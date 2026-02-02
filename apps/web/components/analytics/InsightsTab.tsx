'use client';

import React, { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Cell } from 'recharts';
import { AnalyticsData } from './useAnalyticsData';
import { chartColors, DONUT_COLORS, bKey, getWeekRange, formatDate } from './chartHelpers';
import { generatePdf } from './pdfExport';

const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false });
const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false });
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false });
const PieChart = dynamic(() => import('recharts').then(m => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then(m => m.Pie), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white px-2 py-1.5 rounded-lg shadow-lg border border-slate-200 text-xs">
      <p className="text-slate-500 mb-0.5 font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-semibold text-slate-800">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function InsightsTab({ data }: { data: AnalyticsData }) {
  const { appointments, patients, queueStats, doctorList, hospitalNow, timezone } = data;
  const reportRef = useRef<HTMLDivElement>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [generating, setGenerating] = useState(false);

  const { start: weekStart, end: weekEnd } = useMemo(() => getWeekRange(hospitalNow, weekOffset), [hospitalNow, weekOffset]);

  // Filter data to selected week
  const weekAppts = useMemo(() => {
    const ws = bKey(weekStart);
    const we = bKey(weekEnd);
    return appointments.filter((a: any) => {
      const d = (a.appointmentDate || '').slice(0, 10);
      return d >= ws && d <= we;
    });
  }, [appointments, weekStart, weekEnd]);

  const weekPatients = useMemo(() => {
    const ws = weekStart.getTime();
    const we = weekEnd.getTime();
    return patients.filter((p: any) => {
      const t = new Date(p.createdAt).getTime();
      return t >= ws && t <= we;
    });
  }, [patients, weekStart, weekEnd]);

  const weekQueueStats = useMemo(() => {
    const ws = bKey(weekStart);
    const we = bKey(weekEnd);
    return queueStats.filter(q => q.date >= ws && q.date <= we);
  }, [queueStats, weekStart, weekEnd]);

  // KPI metrics
  const kpis = useMemo(() => {
    const total = weekAppts.length;
    const completed = weekAppts.filter((a: any) => a.status === 'COMPLETED').length;
    const cancelled = weekAppts.filter((a: any) => a.status === 'CANCELLED').length;
    const noShow = weekAppts.filter((a: any) => a.status === 'NO_SHOW').length;
    const walkIns = weekQueueStats.reduce((s, q) => s + q.walkIns, 0);
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, cancelled, noShow, newPatients: weekPatients.length, walkIns, completionRate: rate };
  }, [weekAppts, weekPatients, weekQueueStats]);

  // Daily breakdown for AreaChart
  const dailyData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dk = bKey(d);
      const scheduled = weekAppts.filter((a: any) => (a.appointmentDate || '').slice(0, 10) === dk).length;
      const qs = weekQueueStats.find(q => q.date === dk);
      return { label: DAY_NAMES[d.getDay()], Scheduled: scheduled, 'Walk-ins': qs?.walkIns || 0 };
    });
  }, [weekStart, weekAppts, weekQueueStats]);

  // Appointment status donut
  const statusDonut = useMemo(() => {
    const counts: Record<string, number> = {};
    weekAppts.forEach((a: any) => { counts[a.status] = (counts[a.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [weekAppts]);

  // Doctor performance table
  const doctorPerformance = useMemo(() => {
    return doctorList.map(doc => {
      const docAppts = weekAppts.filter((a: any) => a.doctorProfileId === doc.doctorProfileId);
      return {
        name: doc.name,
        total: docAppts.length,
        completed: docAppts.filter((a: any) => a.status === 'COMPLETED').length,
        cancelled: docAppts.filter((a: any) => a.status === 'CANCELLED').length,
        noShow: docAppts.filter((a: any) => a.status === 'NO_SHOW').length,
        patients: new Set(docAppts.map((a: any) => a.patientId)).size,
      };
    }).sort((a, b) => b.total - a.total);
  }, [doctorList, weekAppts]);

  // Patient registration daily trend
  const patientTrend = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dk = bKey(d);
      const count = weekPatients.filter((p: any) => {
        const pd = new Date(p.createdAt);
        return bKey(pd) === dk;
      }).length;
      return { label: DAY_NAMES[d.getDay()], 'New Patients': count };
    });
  }, [weekStart, weekPatients]);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      await generatePdf(reportRef.current, `Weekly-Insights-${formatDate(weekStart).replace(/\s/g, '-')}`);
    } finally {
      setGenerating(false);
    }
  };

  const weekLabel = `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;

  return (
    <div className="flex flex-col gap-2">
      {/* Controls */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset(o => o - 1)} className="p-1 rounded hover:bg-slate-100 text-slate-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-[11px] font-semibold text-slate-700 min-w-[180px] text-center">{weekLabel}</span>
          <button onClick={() => setWeekOffset(o => o + 1)} className="p-1 rounded hover:bg-slate-100 text-slate-500" disabled={weekOffset >= 0}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="text-[9px] text-[#1e3a5f] font-medium hover:underline">This Week</button>
          )}
        </div>
        <button
          onClick={handleDownload}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white text-[10px] font-semibold rounded-md hover:bg-[#162f4d] transition-colors disabled:opacity-50"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          {generating ? 'Generating...' : 'Download PDF'}
        </button>
      </div>

      {/* Printable Report */}
      <div ref={reportRef} className="flex flex-col gap-2 bg-slate-50 p-2 rounded-lg">
        {/* Report Header */}
        <div className="bg-[#1e3a5f] text-white rounded-lg p-3">
          <h2 className="text-sm font-bold">Weekly Insights Report</h2>
          <p className="text-[10px] text-white/70">{weekLabel}</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {[
            { label: 'TOTAL APPOINTMENTS', value: kpis.total, sub: `${kpis.completed} completed` },
            { label: 'NEW PATIENTS', value: kpis.newPatients, sub: 'registered this week' },
            { label: 'WALK-INS', value: kpis.walkIns, sub: `of ${kpis.total + kpis.walkIns} total` },
            { label: 'COMPLETION RATE', value: `${kpis.completionRate}%`, sub: `${kpis.noShow} no-shows` },
          ].map((kpi, i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 p-2">
              <p className="text-[8px] sm:text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-0.5">{kpi.label}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm sm:text-xl font-bold text-slate-900">{kpi.value}</span>
                <span className="text-[7px] sm:text-[9px] text-[#1e3a5f] bg-[#e8f4fc] px-1 py-0.5 rounded font-medium">{kpi.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
          {/* Appointments AreaChart */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-col" style={{ minHeight: 220 }}>
            <h3 className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-2">Appointments Breakdown</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ins-sched" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ins-walk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColors.accent} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={chartColors.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="Scheduled" stroke={chartColors.primary} strokeWidth={2} fill="url(#ins-sched)" dot={false} />
                  <Area type="monotone" dataKey="Walk-ins" stroke={chartColors.accent} strokeWidth={2} fill="url(#ins-walk)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1.5 text-[10px] text-slate-700 font-medium">
                <span className="w-2 h-2 rounded-full" style={{ background: chartColors.primary }} /> Scheduled
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-slate-700 font-medium">
                <span className="w-2 h-2 rounded-full" style={{ background: chartColors.accent }} /> Walk-ins
              </span>
            </div>
          </div>

          {/* Appointment Status Donut */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-col" style={{ minHeight: 220 }}>
            <h3 className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-2">Appointment Status</h3>
            <div className="flex items-center gap-4 flex-1">
              <div className="relative w-[120px] h-[120px] flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusDonut} cx="50%" cy="50%" innerRadius="50%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none">
                      {statusDonut.map((_: any, i: number) => (
                        <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-base font-bold text-slate-900">{kpis.total}</span>
                  <span className="text-[8px] text-slate-500">Total</span>
                </div>
              </div>
              <div className="flex-1 space-y-1">
                {statusDonut.map((d: any, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-700 font-medium">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span className="truncate">{d.name}: {d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Doctor Performance Table */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <h3 className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-2">Doctor Performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#1e3a5f] text-white">
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase rounded-tl-md">Doctor</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase text-center">Appts</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase text-center">Completed</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase text-center">Cancelled</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase text-center">No-Show</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase text-center rounded-tr-md">Patients</th>
                </tr>
              </thead>
              <tbody>
                {doctorPerformance.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-4 text-center text-[11px] text-slate-400">No data for this week</td></tr>
                )}
                {doctorPerformance.map((doc, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-2 py-1.5 text-[11px] text-slate-700 font-medium">{doc.name}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-700 text-center font-semibold">{doc.total}</td>
                    <td className="px-2 py-1.5 text-[11px] text-emerald-600 text-center">{doc.completed}</td>
                    <td className="px-2 py-1.5 text-[11px] text-red-500 text-center">{doc.cancelled}</td>
                    <td className="px-2 py-1.5 text-[11px] text-amber-500 text-center">{doc.noShow}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-700 text-center">{doc.patients}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Patient Registration Trend */}
        <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-col" style={{ minHeight: 180 }}>
          <h3 className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-2">New Patient Registrations</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={patientTrend} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="New Patients" stroke={chartColors.accent} strokeWidth={2} dot={{ r: 3, fill: chartColors.accent }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
