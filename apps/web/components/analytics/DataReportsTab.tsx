'use client';

import React, { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Cell } from 'recharts';
import { AnalyticsData } from './useAnalyticsData';
import { chartColors, DONUT_COLORS, TimeFilter, bKey, buildBuckets, getDateRange, formatDate } from './chartHelpers';
import { generatePdf, viewPdf } from './pdfExport';

const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false });
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false });
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

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-700',
  NO_SHOW: 'bg-amber-100 text-amber-700',
  IN_PROGRESS: 'bg-sky-100 text-sky-700',
  CONFIRMED: 'bg-indigo-100 text-indigo-700',
};

export default function DataReportsTab({ data }: { data: AnalyticsData }) {
  const { appointments, patients, queueStats, doctorList, hospitalNow } = data;
  const reportRef = useRef<HTMLDivElement>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('week');
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [pdfAction, setPdfAction] = useState<'download' | 'view' | null>(null);

  // Date range
  const range = useMemo(() => getDateRange(timeFilter, hospitalNow), [timeFilter, hospitalNow]);
  const rangeStart = range.start;
  const rangeEndDate = useMemo(() => {
    const d = new Date(hospitalNow);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [hospitalNow]);

  // Filter appointments
  const filteredAppts = useMemo(() => {
    const rs = bKey(rangeStart);
    const re = bKey(rangeEndDate);
    return appointments.filter((a: any) => {
      const d = (a.appointmentDate || '').slice(0, 10);
      if (d < rs || d > re) return false;
      if (doctorFilter !== 'all' && a.doctorProfileId !== doctorFilter) return false;
      return true;
    });
  }, [appointments, rangeStart, rangeEndDate, doctorFilter]);

  // Filter patients
  const filteredPatients = useMemo(() => {
    const rs = rangeStart.getTime();
    const re = rangeEndDate.getTime();
    return patients.filter((p: any) => {
      const t = new Date(p.createdAt).getTime();
      return t >= rs && t <= re;
    });
  }, [patients, rangeStart, rangeEndDate]);

  // Filter queue stats
  const filteredQueue = useMemo(() => {
    const rs = bKey(rangeStart);
    const re = bKey(rangeEndDate);
    return queueStats.filter(q => q.date >= rs && q.date <= re);
  }, [queueStats, rangeStart, rangeEndDate]);

  // KPIs
  const kpis = useMemo(() => {
    const total = filteredAppts.length;
    const completed = filteredAppts.filter((a: any) => a.status === 'COMPLETED').length;
    const cancelled = filteredAppts.filter((a: any) => a.status === 'CANCELLED').length;
    const noShow = filteredAppts.filter((a: any) => a.status === 'NO_SHOW').length;
    const walkIns = filteredQueue.reduce((s, q) => s + q.walkIns, 0);
    const avgWait = filteredQueue.length > 0
      ? Math.round(filteredQueue.reduce((s, q: any) => s + (q.avgWaitMinutes || 0), 0) / filteredQueue.length)
      : 0;
    return { total, completed, cancelled, noShow, walkIns, avgWait };
  }, [filteredAppts, filteredQueue]);

  // Buckets for trend charts
  const buckets = useMemo(() => buildBuckets(timeFilter, hospitalNow), [timeFilter, hospitalNow]);

  // Appointment trend (AreaChart)
  const apptTrend = useMemo(() => {
    return buckets.map(b => {
      const count = filteredAppts.filter((a: any) => {
        const d = (a.appointmentDate || '').slice(0, 10);
        return timeFilter === 'year' ? d.slice(0, 7) === b.key : d === b.key;
      }).length;
      return { label: b.label, Appointments: count };
    });
  }, [buckets, filteredAppts, timeFilter]);

  // Patient trend (LineChart)
  const patientTrend = useMemo(() => {
    return buckets.map(b => {
      const newP = filteredPatients.filter((p: any) => {
        const d = new Date(p.createdAt);
        const k = timeFilter === 'year'
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          : bKey(d);
        return k === b.key;
      }).length;

      const returning = filteredAppts.filter((a: any) => {
        const d = (a.appointmentDate || '').slice(0, 10);
        const dk = timeFilter === 'year' ? d.slice(0, 7) : d;
        if (dk !== b.key) return false;
        const patient = patients.find((p: any) => p.id === a.patientId);
        if (!patient) return false;
        return new Date(patient.createdAt) < rangeStart;
      }).length;

      return { label: b.label, 'New Patients': newP, 'Returning': returning };
    });
  }, [buckets, filteredPatients, filteredAppts, patients, rangeStart, timeFilter]);

  // Status donut
  const statusDonut = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredAppts.forEach((a: any) => { counts[a.status] = (counts[a.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredAppts]);

  // Walk-in vs Scheduled donut
  const typeDonut = useMemo(() => {
    const walkIns = filteredQueue.reduce((s, q) => s + q.walkIns, 0);
    const scheduled = filteredQueue.reduce((s, q) => s + q.scheduled, 0);
    return [
      { name: 'Walk-ins', value: walkIns },
      { name: 'Scheduled', value: scheduled },
    ].filter(d => d.value > 0);
  }, [filteredQueue]);

  // Doctor comparison (BarChart)
  const doctorComparison = useMemo(() => {
    if (doctorFilter !== 'all') return [];
    return doctorList.map(doc => {
      const docAppts = filteredAppts.filter((a: any) => a.doctorProfileId === doc.doctorProfileId);
      return {
        name: doc.name.split(' ')[0],
        fullName: doc.name,
        Completed: docAppts.filter((a: any) => a.status === 'COMPLETED').length,
        Cancelled: docAppts.filter((a: any) => a.status === 'CANCELLED').length,
        'No-Show': docAppts.filter((a: any) => a.status === 'NO_SHOW').length,
        Other: docAppts.filter((a: any) => !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(a.status)).length,
      };
    }).filter(d => d.Completed + d.Cancelled + d['No-Show'] + d.Other > 0)
      .sort((a, b) => (b.Completed + b.Cancelled + b['No-Show'] + b.Other) - (a.Completed + a.Cancelled + a['No-Show'] + a.Other));
  }, [doctorFilter, doctorList, filteredAppts]);

  // Appointment table data (most recent 50)
  const tableData = useMemo(() => {
    return [...filteredAppts]
      .sort((a: any, b: any) => (b.appointmentDate || '').localeCompare(a.appointmentDate || ''))
      .slice(0, 50)
      .map((a: any) => {
        const patient = patients.find((p: any) => p.id === a.patientId);
        const doctor = doctorList.find(d => d.doctorProfileId === a.doctorProfileId);
        return {
          date: a.appointmentDate?.slice(0, 10) || '',
          time: a.startTime || '',
          patient: patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : 'Unknown',
          doctor: doctor?.name || 'Unknown',
          status: a.status || '',
          type: a.appointmentType || '',
        };
      });
  }, [filteredAppts, patients, doctorList]);

  const handlePdf = async (action: 'download' | 'view') => {
    setGenerating(true);
    setPdfAction(action);
    try {
      const filename = `Data-Report-${timeFilter}-${formatDate(hospitalNow).replace(/\s/g, '-')}`;
      if (action === 'download') {
        await generatePdf(reportRef.current, filename, { orientation: 'landscape' });
      } else {
        await viewPdf(reportRef.current, filename, { orientation: 'landscape' });
      }
    } finally {
      setGenerating(false);
      setPdfAction(null);
    }
  };

  const timeLabels: Record<TimeFilter, string> = { week: 'Last 7 Days', month: 'Last 30 Days', year: 'Last 12 Months' };

  return (
    <div className="flex flex-col gap-2">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Doctor Filter */}
          <select
            value={doctorFilter}
            onChange={e => setDoctorFilter(e.target.value)}
            className="text-[10px] sm:text-[11px] px-2 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
          >
            <option value="all">All Hospital</option>
            {doctorList.map(d => (
              <option key={d.doctorProfileId} value={d.doctorProfileId}>Dr. {d.name}</option>
            ))}
          </select>

          {/* Time Pills */}
          <div className="flex gap-0.5 bg-slate-100 rounded-md p-0.5">
            {(['week', 'month', 'year'] as TimeFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setTimeFilter(f)}
                className={`px-2.5 py-1 text-[10px] font-semibold rounded transition-colors ${
                  timeFilter === f
                    ? 'bg-[#1e3a5f] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f === 'week' ? '7D' : f === 'month' ? '30D' : '12M'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handlePdf('view')}
            disabled={generating}
            className="flex items-center gap-1 px-2.5 py-1.5 border border-[#1e3a5f] text-[#1e3a5f] text-[10px] font-semibold rounded-md hover:bg-[#1e3a5f]/5 transition-colors disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            {generating && pdfAction === 'view' ? 'Opening...' : 'View PDF'}
          </button>
          <button
            onClick={() => handlePdf('download')}
            disabled={generating}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-[#1e3a5f] text-white text-[10px] font-semibold rounded-md hover:bg-[#162f4d] transition-colors disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            {generating && pdfAction === 'download' ? 'Generating...' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Printable Report */}
      <div ref={reportRef} className="flex flex-col gap-2 bg-slate-50 p-2 rounded-lg">
        {/* Report Header */}
        <div className="bg-[#1e3a5f] text-white rounded-lg p-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">Data Report</h2>
            <p className="text-[10px] text-white/70">
              {timeLabels[timeFilter]} {doctorFilter !== 'all' ? `• Dr. ${doctorList.find(d => d.doctorProfileId === doctorFilter)?.name || ''}` : '• All Hospital'}
            </p>
          </div>
          <div className="text-[10px] text-white/70 text-right">
            <p>Generated {formatDate(hospitalNow)}</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {[
            { label: 'TOTAL APPTS', value: kpis.total, color: 'text-slate-900' },
            { label: 'COMPLETED', value: kpis.completed, color: 'text-emerald-600' },
            { label: 'CANCELLED', value: kpis.cancelled, color: 'text-red-500' },
            { label: 'NO-SHOW', value: kpis.noShow, color: 'text-amber-500' },
            { label: 'WALK-INS', value: kpis.walkIns, color: 'text-blue-600' },
            { label: 'AVG WAIT', value: `${kpis.avgWait}m`, color: 'text-slate-900' },
          ].map((kpi, i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 p-2 text-center">
              <p className="text-[7px] sm:text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{kpi.label}</p>
              <p className={`text-base sm:text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Charts Row 1: Area + Line */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
          {/* Appointment Trend */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-col" style={{ minHeight: 220 }}>
            <h3 className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-2">Appointment Trends</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={apptTrend} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dr-appt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} interval={timeFilter === 'month' ? 4 : 0} />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="Appointments" stroke={chartColors.primary} strokeWidth={2} fill="url(#dr-appt)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Patient Trend */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-col" style={{ minHeight: 220 }}>
            <h3 className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-2">Patient Trends</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={patientTrend} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} interval={timeFilter === 'month' ? 4 : 0} />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="New Patients" stroke={chartColors.accent} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Returning" stroke={chartColors.primary} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1.5 text-[10px] text-slate-700 font-medium">
                <span className="w-2 h-2 rounded-full" style={{ background: chartColors.accent }} /> New Patients
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-slate-700 font-medium">
                <span className="w-2 h-2 rounded-full" style={{ background: chartColors.primary }} /> Returning
              </span>
            </div>
          </div>
        </div>

        {/* Charts Row 2: Donuts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
          {/* Status Donut */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-col" style={{ minHeight: 200 }}>
            <h3 className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-2">Appointment Status</h3>
            <div className="flex items-center gap-4 flex-1">
              <div className="relative w-[110px] h-[110px] flex-shrink-0">
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

          {/* Walk-in vs Scheduled Donut */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-col" style={{ minHeight: 200 }}>
            <h3 className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-2">Walk-in vs Scheduled</h3>
            <div className="flex items-center gap-4 flex-1">
              <div className="relative w-[110px] h-[110px] flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typeDonut} cx="50%" cy="50%" innerRadius="50%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none">
                      {typeDonut.map((_: any, i: number) => (
                        <Cell key={i} fill={[chartColors.accent, chartColors.primary][i]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-base font-bold text-slate-900">{kpis.walkIns + (filteredQueue.reduce((s, q) => s + q.scheduled, 0))}</span>
                  <span className="text-[8px] text-slate-500">Total</span>
                </div>
              </div>
              <div className="flex-1 space-y-1">
                {typeDonut.map((d: any, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-700 font-medium">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: [chartColors.accent, chartColors.primary][i] }} />
                    <span className="truncate">{d.name}: {d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Doctor Comparison BarChart */}
        {doctorFilter === 'all' && doctorComparison.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-col" style={{ minHeight: 220 }}>
            <h3 className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-2">Doctor Comparison</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={doctorComparison} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="Completed" stackId="a" fill={chartColors.primary} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Cancelled" stackId="a" fill={chartColors.light} />
                  <Bar dataKey="No-Show" stackId="a" fill={chartColors.muted} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1.5 text-[10px] text-slate-700 font-medium">
                <span className="w-2 h-2 rounded-sm" style={{ background: chartColors.primary }} /> Completed
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-slate-700 font-medium">
                <span className="w-2 h-2 rounded-sm" style={{ background: chartColors.light }} /> Cancelled
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-slate-700 font-medium">
                <span className="w-2 h-2 rounded-sm" style={{ background: chartColors.muted }} /> No-Show
              </span>
            </div>
          </div>
        )}

        {/* Appointments Table */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <h3 className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-2">
            Recent Appointments {filteredAppts.length > 50 && <span className="text-slate-400 font-normal">(showing 50 of {filteredAppts.length})</span>}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#1e3a5f] text-white">
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase rounded-tl-md">Date</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase">Time</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase">Patient</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase">Doctor</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase">Type</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase text-center rounded-tr-md">Status</th>
                </tr>
              </thead>
              <tbody>
                {tableData.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-4 text-center text-[11px] text-slate-400">No appointments in this period</td></tr>
                )}
                {tableData.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-2 py-1.5 text-[11px] text-slate-700">{row.date}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-700">{row.time}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-700 font-medium">{row.patient}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-700">{row.doctor}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-700">{row.type || '—'}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`inline-block px-1.5 py-0.5 text-[9px] font-semibold rounded ${STATUS_COLORS[row.status] || 'bg-slate-100 text-slate-600'}`}>
                        {row.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
