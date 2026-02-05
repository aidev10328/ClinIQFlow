'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '../AuthProvider';
import { apiFetch } from '../../lib/api';
import { useHospitalTimezone } from '../../hooks/useHospitalTimezone';

interface DoctorMember {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  doctorProfileId?: string;
  specialization?: string;
  complianceStatus: string;
}

interface AppointmentEntry {
  id: string;
  patientName: string;
  patientPhone?: string;
  doctorProfileId?: string;
  doctorName: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: string;
  reasonForVisit?: string;
}

interface PatientEntry {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  createdAt: string;
}

interface QueueDailyData {
  isCheckedIn: boolean;
  queue: { id: string; status: string; priority?: string }[];
  waiting: { id: string }[];
  completed: { id: string; status: string; appointmentId?: string }[];
  withDoctor: { id: string } | null;
  doctorCheckin?: { status: string };
  stats?: {
    totalQueue?: number;
    totalWaiting?: number;
    totalScheduled?: number;
    totalCompleted?: number;
  };
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const p = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${p}` : `${h12}:${String(m).padStart(2, '0')}${p}`;
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    SCHEDULED: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Scheduled' },
    CONFIRMED: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Confirmed' },
    CHECKED_IN: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Checked In' },
    IN_PROGRESS: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'In Progress' },
    COMPLETED: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Completed' },
    CANCELLED: { bg: 'bg-red-50', text: 'text-red-600', label: 'Cancelled' },
    NO_SHOW: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'No Show' },
  };
  const s = map[status] || { bg: 'bg-slate-100', text: 'text-slate-600', label: status };
  return <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${s.bg} ${s.text}`}>{s.label}</span>;
}

export function StaffDashboard() {
  const { currentHospital, profile } = useAuth();
  const { formatShortDate, getCurrentTime } = useHospitalTimezone();

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<DoctorMember[]>([]);
  const [appointments, setAppointments] = useState<AppointmentEntry[]>([]);
  const [patients, setPatients] = useState<PatientEntry[]>([]);
  const [doctorQueues, setDoctorQueues] = useState<Record<string, QueueDailyData>>({});
  const [patientSearch, setPatientSearch] = useState('');

  const getToday = useCallback(() => {
    const now = getCurrentTime();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [getCurrentTime]);

  const todayStr = useMemo(() => getToday(), [getToday]);

  const fetchData = useCallback(async () => {
    try {
      const [membersRes, apptsRes, patientsRes] = await Promise.all([
        apiFetch('/v1/hospitals/members/compliance'),
        apiFetch(`/v1/appointments?startDate=${todayStr}&endDate=${todayStr}`),
        apiFetch('/v1/patients'),
      ]);

      if (membersRes.ok) setMembers(await membersRes.json());
      if (apptsRes.ok) setAppointments(await apptsRes.json());
      if (patientsRes.ok) setPatients(await patientsRes.json());
    } catch (error) {
      console.error('Failed to fetch staff dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  const doctors = useMemo(
    () => members.filter((m) => m.role === 'DOCTOR'),
    [members]
  );

  const fetchDoctorQueues = useCallback(async () => {
    if (doctors.length === 0) return;
    const queues: Record<string, QueueDailyData> = {};
    await Promise.all(
      doctors.map(async (doc) => {
        const profileId = doc.doctorProfileId || doc.userId;
        try {
          const res = await apiFetch(`/v1/queue/daily?doctorProfileId=${profileId}&date=${todayStr}`);
          if (res.ok) {
            queues[profileId] = await res.json();
          }
        } catch {
          // skip
        }
      })
    );
    setDoctorQueues(queues);
  }, [doctors, todayStr]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (doctors.length > 0) fetchDoctorQueues();
  }, [doctors, fetchDoctorQueues]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
      if (doctors.length > 0) fetchDoctorQueues();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchData, fetchDoctorQueues, doctors.length]);

  const now = getCurrentTime();
  const staffName = profile?.fullName || 'Staff';

  // Stats — per-doctor: merge appointment data with queue data, then sum across doctors
  // Appointment statuses: SCHEDULED, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW
  // Queue terminal statuses: COMPLETED, NO_SHOW, LEFT (LEFT maps to Cancelled)
  const scheduledAppts = appointments.filter((a) => a.status === 'SCHEDULED').length;
  const confirmedAppts = appointments.filter((a) => a.status === 'CONFIRMED').length;
  const totalInQueue = Object.values(doctorQueues).reduce(
    (sum, q) => sum + (q.queue?.length || 0) + (q.withDoctor ? 1 : 0),
    0
  );
  const totalWaiting = Object.values(doctorQueues).reduce(
    (sum, q) => sum + (q.waiting?.length || 0),
    0
  );

  // For terminal statuses, calculate per-doctor then sum.
  // Per doctor: max(appointment count, queue count) avoids double-counting
  // (when a queue entry completes, the linked appointment is also marked COMPLETED)
  // while still capturing walk-in-only entries that have no appointment record.
  const allDoctorIds = new Set([
    ...Object.keys(doctorQueues),
    ...appointments.map(a => a.doctorProfileId).filter(Boolean) as string[],
  ]);

  let completedAppts = 0;
  let cancelledAppts = 0;
  let noShowAppts = 0;

  allDoctorIds.forEach(docId => {
    const docAppts = appointments.filter(a => a.doctorProfileId === docId);
    const qData = doctorQueues[docId];

    const apptCompleted = docAppts.filter(a => a.status === 'COMPLETED').length;
    const qCompleted = qData?.completed?.filter(c => c.status === 'COMPLETED').length || 0;
    completedAppts += Math.max(apptCompleted, qCompleted);

    const apptCancelled = docAppts.filter(a => a.status === 'CANCELLED').length;
    const qLeft = qData?.completed?.filter(c => c.status === 'LEFT').length || 0;
    cancelledAppts += Math.max(apptCancelled, qLeft);

    const apptNoShow = docAppts.filter(a => a.status === 'NO_SHOW').length;
    const qNoShow = qData?.completed?.filter(c => c.status === 'NO_SHOW').length || 0;
    noShowAppts += Math.max(apptNoShow, qNoShow);
  });

  const todayAppts = scheduledAppts + confirmedAppts + completedAppts;
  const totalPatients = patients.length;

  // Today's appointments sorted by time
  const sortedAppts = useMemo(
    () =>
      [...appointments]
        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
        .slice(0, 15),
    [appointments]
  );

  // Upcoming (not completed/cancelled) appointments
  const upcomingAppts = useMemo(
    () => sortedAppts.filter(a => a.status === 'SCHEDULED' || a.status === 'CONFIRMED' || a.status === 'CHECKED_IN'),
    [sortedAppts]
  );

  // Filtered patients for search
  const filteredPatients = useMemo(() => {
    if (!patientSearch) return patients.slice(0, 10);
    const lower = patientSearch.toLowerCase();
    return patients.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(lower) ||
      p.phone?.includes(patientSearch) ||
      p.email?.toLowerCase().includes(lower)
    ).slice(0, 10);
  }, [patients, patientSearch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-5 h-5 border-2 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="page-fullheight flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2 bg-gradient-to-r from-[#1e3a5f] to-[#2b5a8a]">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-white truncate">Welcome, {staffName}</h1>
            <p className="text-[10px] text-blue-200 truncate">
              {currentHospital?.name} &middot; {DAYS_OF_WEEK[now.getDay()]}, {formatShortDate(now)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href="/hospital/appointments" className="px-2.5 py-1 rounded-md text-[10px] font-medium bg-white/15 text-white hover:bg-white/25 transition-colors">
              Appointments
            </Link>
            <Link href="/hospital/appointments?tab=queue" className="px-2.5 py-1 rounded-md text-[10px] font-medium bg-white/15 text-white hover:bg-white/25 transition-colors">
              Queue
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="flex-shrink-0 px-3 py-2 bg-white border-b border-slate-200">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { label: 'Total', value: todayAppts, color: 'text-[#1e3a5f]', bg: 'bg-blue-50' },
            { label: 'Scheduled', value: scheduledAppts, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Checked In', value: confirmedAppts, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'In Queue', value: totalInQueue, color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: 'Completed', value: completedAppts, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Patients', value: totalPatients, color: 'text-slate-600', bg: 'bg-slate-50' },
          ].map((kpi) => (
            <div key={kpi.label} className={`${kpi.bg} rounded-lg p-1.5 text-center`}>
              <p className={`text-base sm:text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
              <p className="text-[8px] font-semibold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content — Two-Column Layout */}
      <div className="flex-1 overflow-auto p-2">
        <div className="grid lg:grid-cols-2 gap-2 h-full">

          {/* ===== LEFT COLUMN: Appointments & Queue ===== */}
          <div className="space-y-2 flex flex-col min-h-0">

            {/* Today's Appointments */}
            <div className="bg-white rounded-lg border border-slate-200 flex-1 flex flex-col min-h-0">
              <div className="flex-shrink-0 px-3 py-1.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-white">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-[#1e3a5f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <h3 className="text-xs font-semibold text-slate-900">Today&apos;s Appointments</h3>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#1e3a5f] text-white font-medium">{todayAppts}</span>
                </div>
                <Link href="/hospital/appointments" className="text-[9px] text-[#1e3a5f] hover:underline font-medium">
                  View All &rarr;
                </Link>
              </div>
              <div className="flex-1 overflow-auto">
                {sortedAppts.length === 0 ? (
                  <div className="p-6 text-center">
                    <svg className="w-8 h-8 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-[11px] text-slate-400">No appointments scheduled for today</p>
                  </div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/60 sticky top-0">
                        <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase text-[9px] tracking-wider">Time</th>
                        <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase text-[9px] tracking-wider">Patient</th>
                        <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase text-[9px] tracking-wider hidden sm:table-cell">Doctor</th>
                        <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase text-[9px] tracking-wider hidden md:table-cell">Reason</th>
                        <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase text-[9px] tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAppts.map((appt) => (
                        <tr key={appt.id} className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors">
                          <td className="px-2.5 py-1.5 text-slate-700 font-medium whitespace-nowrap">
                            {formatTime12h(appt.startTime)}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <span className="text-slate-900 font-medium truncate block max-w-[120px]">{appt.patientName}</span>
                          </td>
                          <td className="px-2.5 py-1.5 text-slate-500 truncate max-w-[100px] hidden sm:table-cell">{appt.doctorName}</td>
                          <td className="px-2.5 py-1.5 text-slate-400 truncate max-w-[80px] hidden md:table-cell">{appt.reasonForVisit || '-'}</td>
                          <td className="px-2.5 py-1.5">{statusBadge(appt.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Queue Summary by Doctor */}
            <div className="bg-white rounded-lg border border-slate-200 flex-shrink-0">
              <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-50 to-white">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <h3 className="text-xs font-semibold text-slate-900">Queue Overview</h3>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-medium">{totalInQueue + totalWaiting}</span>
                </div>
                <Link href="/hospital/appointments?tab=queue" className="text-[9px] text-amber-600 hover:underline font-medium">
                  Manage &rarr;
                </Link>
              </div>
              <div className="p-2">
                {doctors.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center py-3">No doctors found</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {doctors.map((doc) => {
                      const profileId = doc.doctorProfileId || doc.userId;
                      const qData = doctorQueues[profileId];
                      const isOnline = qData?.isCheckedIn || qData?.doctorCheckin?.status === 'CHECKED_IN';
                      const queueCount = qData?.queue?.length || 0;
                      const waitingCount = qData?.waiting?.length || 0;
                      const hasPatient = !!qData?.withDoctor;
                      const completedCount = qData?.completed?.length || 0;

                      return (
                        <div key={doc.userId} className={`rounded-lg border p-2 ${isOnline ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-slate-50/30'}`}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                              isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-400'
                            }`}>
                              {doc.fullName?.charAt(0) || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-semibold text-slate-800 truncate">Dr. {doc.fullName}</p>
                              {doc.specialization && <p className="text-[8px] text-slate-400 truncate">{doc.specialization}</p>}
                            </div>
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'}`} />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">{queueCount} queue</span>
                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">{waitingCount} wait</span>
                            {hasPatient && <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-medium">With Dr</span>}
                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">{completedCount} done</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Appointment Status Summary */}
            <div className="bg-white rounded-lg border border-slate-200 flex-shrink-0">
              <div className="px-3 py-1.5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                <h3 className="text-xs font-semibold text-slate-900">Today&apos;s Status Breakdown</h3>
              </div>
              <div className="p-2">
                <div className="flex items-center gap-1.5">
                  {[
                    { label: 'Scheduled', value: scheduledAppts, bg: 'bg-blue-500' },
                    { label: 'Checked In', value: confirmedAppts, bg: 'bg-amber-500' },
                    { label: 'Completed', value: completedAppts, bg: 'bg-emerald-500' },
                    { label: 'Cancelled', value: cancelledAppts, bg: 'bg-red-400' },
                    { label: 'No Show', value: noShowAppts, bg: 'bg-slate-400' },
                  ].map((item) => (
                    <div key={item.label} className="flex-1 text-center">
                      <div className={`${item.bg} text-white rounded-lg py-1.5 mb-0.5`}>
                        <p className="text-sm font-bold">{item.value}</p>
                      </div>
                      <p className="text-[7px] font-semibold text-slate-500 uppercase tracking-wider">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ===== RIGHT COLUMN: Doctor Availability & Patient Details ===== */}
          <div className="space-y-2 flex flex-col min-h-0">

            {/* Doctor Availability & Schedules */}
            <div className="bg-white rounded-lg border border-slate-200 flex-shrink-0">
              <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-white">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-xs font-semibold text-slate-900">Doctor Availability</h3>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-white font-medium">{doctors.length}</span>
                </div>
              </div>
              <div className="p-2">
                {doctors.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center py-3">No doctors found</p>
                ) : (
                  <div className="space-y-1">
                    {doctors.map((doc) => {
                      const profileId = doc.doctorProfileId || doc.userId;
                      const qData = doctorQueues[profileId];
                      const isOnline = qData?.isCheckedIn || qData?.doctorCheckin?.status === 'CHECKED_IN';
                      // Count doctor-specific appointments
                      const docAppts = appointments.filter(a => a.doctorName?.includes(doc.fullName) || false);
                      const docScheduled = docAppts.filter(a => a.status === 'SCHEDULED' || a.status === 'CONFIRMED').length;
                      const docCompleted = docAppts.filter(a => a.status === 'COMPLETED').length;

                      return (
                        <div key={doc.userId} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-slate-100 hover:bg-slate-50/50 transition-colors">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            isOnline ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-300' : 'bg-slate-100 text-slate-400'
                          }`}>
                            {doc.fullName?.charAt(0) || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] font-semibold text-slate-900 truncate">Dr. {doc.fullName}</p>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${
                                isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                              }`}>{isOnline ? 'Online' : 'Offline'}</span>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              {doc.specialization && <span className="text-[9px] text-slate-400">{doc.specialization}</span>}
                              {doc.specialization && <span className="text-slate-300">&middot;</span>}
                              <span className="text-[9px] text-blue-500">{docScheduled} upcoming</span>
                              <span className="text-slate-300">&middot;</span>
                              <span className="text-[9px] text-emerald-500">{docCompleted} done</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Patient Directory */}
            <div className="bg-white rounded-lg border border-slate-200 flex-1 flex flex-col min-h-0">
              <div className="flex-shrink-0 px-3 py-1.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <h3 className="text-xs font-semibold text-slate-900">Patients</h3>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-500 text-white font-medium">{totalPatients}</span>
                </div>
                <Link href="/hospital/patients" className="text-[9px] text-[#1e3a5f] hover:underline font-medium">
                  View All &rarr;
                </Link>
              </div>
              <div className="flex-shrink-0 px-2 pt-2">
                <input
                  type="text"
                  placeholder="Search patients by name, phone, email..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] placeholder-slate-400"
                />
              </div>
              <div className="flex-1 overflow-auto p-2">
                {filteredPatients.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center py-4">No patients found</p>
                ) : (
                  <div className="space-y-0.5">
                    {filteredPatients.map((pt) => (
                      <div key={pt.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                        <div className="w-7 h-7 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                          {pt.firstName?.charAt(0)}{pt.lastName?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-slate-900 truncate">{pt.firstName} {pt.lastName}</p>
                          <div className="flex items-center gap-1.5">
                            {pt.phone && <span className="text-[9px] text-slate-400">{pt.phone}</span>}
                            {pt.email && pt.phone && <span className="text-slate-300">&middot;</span>}
                            {pt.email && <span className="text-[9px] text-slate-400 truncate">{pt.email}</span>}
                          </div>
                        </div>
                        <span className="text-[8px] text-slate-300 flex-shrink-0">
                          {new Date(pt.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-shrink-0 px-2 pb-2">
                <Link href="/hospital/patients?action=add" className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg border border-dashed border-[#1e3a5f]/30 text-[10px] font-medium text-[#1e3a5f] hover:bg-blue-50 transition-colors">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add New Patient
                </Link>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg border border-slate-200 flex-shrink-0">
              <div className="px-3 py-1.5 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white">
                <h3 className="text-xs font-semibold text-slate-900">Quick Actions</h3>
              </div>
              <div className="p-2">
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { href: '/hospital/appointments', label: 'Book Appt', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', color: 'text-[#1e3a5f] bg-blue-50' },
                    { href: '/hospital/appointments?tab=queue', label: 'Queue', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', color: 'text-amber-600 bg-amber-50' },
                    { href: '/hospital/patients', label: 'Patients', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', color: 'text-slate-600 bg-slate-50' },
                    { href: '/hospital/patients?action=add', label: 'New Patient', icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z', color: 'text-emerald-600 bg-emerald-50' },
                  ].map((action) => (
                    <Link key={action.href + action.label} href={action.href} className={`flex flex-col items-center gap-1 p-2 rounded-lg ${action.color} hover:opacity-80 transition-opacity`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={action.icon} />
                      </svg>
                      <span className="text-[8px] font-semibold">{action.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
