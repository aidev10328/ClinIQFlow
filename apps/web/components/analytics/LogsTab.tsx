'use client';

import React, { useMemo, useRef, useState } from 'react';
import { AnalyticsData } from './useAnalyticsData';
import { bKey, formatDate } from './chartHelpers';
import { generatePdf, viewPdf } from './pdfExport';

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  SERVING: 'bg-sky-100 text-sky-700',
  WAITING: 'bg-amber-100 text-amber-700',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-700',
  NO_SHOW: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-indigo-100 text-indigo-700',
  IN_PROGRESS: 'bg-sky-100 text-sky-700',
  SKIPPED: 'bg-slate-100 text-slate-600',
  WALKED_OUT: 'bg-red-100 text-red-600',
};

export default function LogsTab({ data }: { data: AnalyticsData }) {
  const { appointments, patients, queueStats, doctorList, hospitalNow } = data;
  const reportRef = useRef<HTMLDivElement>(null);
  const [dateOffset, setDateOffset] = useState(0);
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [pdfAction, setPdfAction] = useState<'download' | 'view' | null>(null);

  // Selected date
  const selectedDate = useMemo(() => {
    const d = new Date(hospitalNow);
    d.setDate(d.getDate() + dateOffset);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [hospitalNow, dateOffset]);

  const dateKey = bKey(selectedDate);
  const dateLabel = formatDate(selectedDate);

  // Queue stats for this day
  const dayQueueStats = useMemo(() => {
    return queueStats.find(q => q.date === dateKey);
  }, [queueStats, dateKey]);

  // Day's appointments
  const dayAppts = useMemo(() => {
    return appointments.filter((a: any) => {
      const d = (a.appointmentDate || '').slice(0, 10);
      if (d !== dateKey) return false;
      if (doctorFilter !== 'all' && a.doctorProfileId !== doctorFilter) return false;
      return true;
    });
  }, [appointments, dateKey, doctorFilter]);

  // Day's new patients (created on this date)
  const dayPatients = useMemo(() => {
    return patients.filter((p: any) => {
      const pd = new Date(p.createdAt);
      return bKey(pd) === dateKey;
    });
  }, [patients, dateKey]);

  // Summary cards
  const summary = useMemo(() => {
    const queued = dayQueueStats ? (dayQueueStats.walkIns + dayQueueStats.scheduled) : 0;
    const completed = dayAppts.filter((a: any) => a.status === 'COMPLETED').length;
    const walkIns = dayQueueStats?.walkIns || 0;
    const noShows = dayAppts.filter((a: any) => a.status === 'NO_SHOW').length;
    return { queued, completed, walkIns, noShows };
  }, [dayQueueStats, dayAppts]);

  // Queue Activity Log
  const queueLog = useMemo(() => {
    return dayAppts
      .filter((a: any) => a.queueEntryId || a.queuePosition)
      .sort((a: any, b: any) => (a.startTime || '').localeCompare(b.startTime || ''))
      .map((a: any) => {
        const patient = patients.find((p: any) => p.id === a.patientId);
        const doctor = doctorList.find(d => d.doctorProfileId === a.doctorProfileId);
        return {
          time: a.startTime || a.appointmentDate?.slice(11, 16) || '—',
          patient: patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : 'Unknown',
          doctor: doctor?.name || 'Unknown',
          type: a.isWalkIn ? 'Walk-in' : 'Scheduled',
          status: a.status || '',
        };
      });
  }, [dayAppts, patients, doctorList]);

  // All appointments for the day (appointments created/scheduled on this date)
  const apptLog = useMemo(() => {
    return [...dayAppts]
      .sort((a: any, b: any) => (a.startTime || '').localeCompare(b.startTime || ''))
      .map((a: any) => {
        const patient = patients.find((p: any) => p.id === a.patientId);
        const doctor = doctorList.find(d => d.doctorProfileId === a.doctorProfileId);
        return {
          time: a.startTime || '—',
          patient: patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : 'Unknown',
          doctor: doctor?.name || 'Unknown',
          type: a.appointmentType || '—',
          status: a.status || '',
          reason: a.reason || '',
        };
      });
  }, [dayAppts, patients, doctorList]);

  // Patients registered today
  const patientLog = useMemo(() => {
    return dayPatients.map((p: any) => ({
      time: new Date(p.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Unknown',
      phone: p.phone || '—',
      email: p.email || '—',
    }));
  }, [dayPatients]);

  const handlePdf = async (action: 'download' | 'view') => {
    setGenerating(true);
    setPdfAction(action);
    try {
      const filename = `Daily-Log-${dateKey}`;
      if (action === 'download') {
        await generatePdf(reportRef.current, filename);
      } else {
        await viewPdf(reportRef.current, filename);
      }
    } finally {
      setGenerating(false);
      setPdfAction(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          {/* Date Navigator */}
          <button onClick={() => setDateOffset(o => o - 1)} className="p-1 rounded hover:bg-slate-100 text-slate-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-[11px] font-semibold text-slate-700 min-w-[140px] text-center">{dateLabel}</span>
          <button onClick={() => setDateOffset(o => o + 1)} className="p-1 rounded hover:bg-slate-100 text-slate-500" disabled={dateOffset >= 0}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          {dateOffset !== 0 && (
            <button onClick={() => setDateOffset(0)} className="text-[9px] text-[#1e3a5f] font-medium hover:underline">Today</button>
          )}

          {/* Doctor Filter */}
          <select
            value={doctorFilter}
            onChange={e => setDoctorFilter(e.target.value)}
            className="text-[10px] sm:text-[11px] px-2 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
          >
            <option value="all">All Doctors</option>
            {doctorList.map(d => (
              <option key={d.doctorProfileId} value={d.doctorProfileId}>Dr. {d.name}</option>
            ))}
          </select>
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
            <h2 className="text-sm font-bold">Daily Activity Log</h2>
            <p className="text-[10px] text-white/70">
              {dateLabel} {doctorFilter !== 'all' ? `• Dr. ${doctorList.find(d => d.doctorProfileId === doctorFilter)?.name || ''}` : '• All Doctors'}
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {[
            { label: 'QUEUED', value: summary.queued, color: 'text-slate-900' },
            { label: 'COMPLETED', value: summary.completed, color: 'text-emerald-600' },
            { label: 'WALK-INS', value: summary.walkIns, color: 'text-blue-600' },
            { label: 'NO-SHOWS', value: summary.noShows, color: 'text-amber-500' },
          ].map((card, i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 p-2 text-center">
              <p className="text-[8px] sm:text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{card.label}</p>
              <p className={`text-lg sm:text-xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Appointments Log */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <h3 className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-2">
            Appointments ({apptLog.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#1e3a5f] text-white">
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase rounded-tl-md">Time</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase">Patient</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase">Doctor</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase">Type</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase">Reason</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase text-center rounded-tr-md">Status</th>
                </tr>
              </thead>
              <tbody>
                {apptLog.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-4 text-center text-[11px] text-slate-400">No appointments on this date</td></tr>
                )}
                {apptLog.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-2 py-1.5 text-[11px] text-slate-700 font-medium whitespace-nowrap">{row.time}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-700 font-medium">{row.patient}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-700">{row.doctor}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-700">{row.type}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-500 max-w-[150px] truncate">{row.reason || '—'}</td>
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

        {/* Queue Activity Log */}
        {queueLog.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-3">
            <h3 className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-2">
              Queue Activity ({queueLog.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#1e3a5f] text-white">
                    <th className="px-2 py-1.5 text-[9px] font-semibold uppercase rounded-tl-md">Time</th>
                    <th className="px-2 py-1.5 text-[9px] font-semibold uppercase">Patient</th>
                    <th className="px-2 py-1.5 text-[9px] font-semibold uppercase">Doctor</th>
                    <th className="px-2 py-1.5 text-[9px] font-semibold uppercase">Type</th>
                    <th className="px-2 py-1.5 text-[9px] font-semibold uppercase text-center rounded-tr-md">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {queueLog.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-2 py-1.5 text-[11px] text-slate-700 font-medium whitespace-nowrap">{row.time}</td>
                      <td className="px-2 py-1.5 text-[11px] text-slate-700 font-medium">{row.patient}</td>
                      <td className="px-2 py-1.5 text-[11px] text-slate-700">{row.doctor}</td>
                      <td className="px-2 py-1.5 text-[11px] text-slate-700">
                        <span className={`inline-block px-1.5 py-0.5 text-[9px] font-semibold rounded ${
                          row.type === 'Walk-in' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                        }`}>{row.type}</span>
                      </td>
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
        )}

        {/* New Patient Registrations */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <h3 className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-2">
            New Patient Registrations ({patientLog.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#1e3a5f] text-white">
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase rounded-tl-md">Time</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase">Name</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase">Phone</th>
                  <th className="px-2 py-1.5 text-[9px] font-semibold uppercase rounded-tr-md">Email</th>
                </tr>
              </thead>
              <tbody>
                {patientLog.length === 0 && (
                  <tr><td colSpan={4} className="px-2 py-4 text-center text-[11px] text-slate-400">No new patients registered on this date</td></tr>
                )}
                {patientLog.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-2 py-1.5 text-[11px] text-slate-700 font-medium whitespace-nowrap">{row.time}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-700 font-medium">{row.name}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-700">{row.phone}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-500">{row.email}</td>
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
