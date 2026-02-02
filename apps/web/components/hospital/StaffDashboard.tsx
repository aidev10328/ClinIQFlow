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
  createdAt: string;
}

interface QueueDailyData {
  isCheckedIn: boolean;
  queue: { id: string; status: string }[];
  completed: { id: string }[];
  withDoctor: { id: string } | null;
  doctorCheckin?: { status: string };
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
    COMPLETED: { bg: 'bg-[#ecf5e7]', text: 'text-[#4d7c43]', label: 'Completed' },
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

  // Stats
  const todayAppts = appointments.length;
  const completedAppts = appointments.filter((a) => a.status === 'COMPLETED').length;
  const totalInQueue = Object.values(doctorQueues).reduce(
    (sum, q) => sum + (q.queue?.length || 0) + (q.withDoctor ? 1 : 0),
    0
  );
  const totalPatients = patients.length;

  // Today's appointments sorted by time
  const sortedAppts = useMemo(
    () =>
      [...appointments]
        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
        .slice(0, 12),
    [appointments]
  );

  // Recent patients (last 5 added)
  const recentPatients = useMemo(
    () =>
      [...patients]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [patients]
  );

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
      <div className="flex-shrink-0 px-3 py-1.5 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-semibold text-slate-900 truncate">Welcome, {staffName}</h1>
            <p className="text-[10px] text-slate-500 truncate">
              {currentHospital?.name} &middot; {DAYS_OF_WEEK[now.getDay()]}, {formatShortDate(now)}
            </p>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-[#1e3a5f] flex items-center gap-1 flex-shrink-0">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Staff
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {[
            { label: "Today's Appts", value: todayAppts, sub: `${Math.max(0, todayAppts - completedAppts)} remaining`, subBg: 'bg-blue-50 text-[#1e3a5f]' },
            { label: 'In Queue', value: totalInQueue, sub: `${doctors.length} doctors`, subBg: 'bg-amber-50 text-amber-700' },
            { label: 'Completed', value: completedAppts, sub: todayAppts > 0 ? `${Math.round((completedAppts / todayAppts) * 100)}%` : '0%', subBg: 'bg-[#ecf5e7] text-[#4d7c43]' },
            { label: 'Total Patients', value: totalPatients, sub: 'registered', subBg: 'bg-slate-50 text-slate-600' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-lg border border-slate-200 p-1.5 sm:p-2.5">
              <p className="text-[8px] sm:text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-0.5 sm:mb-1">{kpi.label}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm sm:text-xl font-bold text-slate-900">{kpi.value}</span>
                <span className={`text-[7px] sm:text-[9px] px-1 sm:px-1.5 py-px sm:py-0.5 rounded font-medium ${kpi.subBg}`}>{kpi.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Two-Column Layout */}
        <div className="grid lg:grid-cols-5 gap-2 min-h-0">
          {/* Left Column (3/5) */}
          <div className="lg:col-span-3 space-y-2">
            {/* Today's Appointments */}
            <div className="bg-white rounded-lg border border-slate-200">
              <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-slate-900">Today&apos;s Appointments</h3>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-[#1e3a5f] font-medium">{todayAppts}</span>
                </div>
                <Link href="/hospital/appointments" className="text-[9px] text-[#1e3a5f] hover:underline font-medium">
                  View All &rarr;
                </Link>
              </div>
              <div className="overflow-x-auto">
                {sortedAppts.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-[11px] text-slate-400">No appointments scheduled for today</p>
                  </div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase text-[9px] tracking-wider">Time</th>
                        <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase text-[9px] tracking-wider">Patient</th>
                        <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase text-[9px] tracking-wider hidden sm:table-cell">Doctor</th>
                        <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 uppercase text-[9px] tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAppts.map((appt) => (
                        <tr key={appt.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="px-2.5 py-1.5 text-slate-700 font-medium whitespace-nowrap">
                            {formatTime12h(appt.startTime)} – {formatTime12h(appt.endTime)}
                          </td>
                          <td className="px-2.5 py-1.5 text-slate-900 font-medium truncate max-w-[140px]">{appt.patientName}</td>
                          <td className="px-2.5 py-1.5 text-slate-600 truncate max-w-[120px] hidden sm:table-cell">{appt.doctorName}</td>
                          <td className="px-2.5 py-1.5">{statusBadge(appt.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Doctor Status */}
            <div className="bg-white rounded-lg border border-slate-200">
              <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-900">Doctor Status</h3>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 font-medium">{doctors.length} doctors</span>
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
                      const queueCount = qData?.queue?.length || 0;
                      const hasPatient = !!qData?.withDoctor;
                      const completedCount = qData?.completed?.length || 0;

                      return (
                        <div key={doc.userId} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                            isOnline ? 'bg-[#ecf5e7] text-[#4d7c43]' : 'bg-slate-100 text-slate-400'
                          }`}>
                            {doc.fullName?.charAt(0) || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] font-medium text-slate-900 truncate">Dr. {doc.fullName}</p>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOnline ? 'bg-[#4d7c43] animate-pulse' : 'bg-slate-300'}`} />
                            </div>
                            {doc.specialization && (
                              <p className="text-[9px] text-slate-400 truncate">{doc.specialization}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {isOnline && (
                              <>
                                {hasPatient && (
                                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">With Patient</span>
                                )}
                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">{queueCount} queued</span>
                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#ecf5e7] text-[#4d7c43] font-medium">{completedCount} done</span>
                              </>
                            )}
                            {!isOnline && (
                              <span className="text-[9px] text-slate-400 font-medium">Offline</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column (2/5) */}
          <div className="lg:col-span-2 space-y-2">
            {/* Quick Actions */}
            <div className="bg-white rounded-lg border border-slate-200">
              <div className="px-3 py-1.5 border-b border-slate-100">
                <h3 className="text-xs font-semibold text-slate-900">Quick Actions</h3>
              </div>
              <div className="p-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <Link href="/hospital/appointments" className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-[#1e3a5f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-medium text-slate-700">Appointments</span>
                  </Link>
                  <Link href="/hospital/appointments?tab=queue" className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200">
                    <div className="w-7 h-7 rounded-lg bg-[#ecf5e7] flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-[#4d7c43]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-medium text-slate-700">Daily Queue</span>
                  </Link>
                  <Link href="/hospital/patients" className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-medium text-slate-700">Patients</span>
                  </Link>
                  <Link href="/hospital/patients?action=add" className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200">
                    <div className="w-7 h-7 rounded-lg bg-[#1e3a5f] flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-medium text-slate-700">Add Patient</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Recent Patients */}
            <div className="bg-white rounded-lg border border-slate-200">
              <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-900">Recent Patients</h3>
                <Link href="/hospital/patients" className="text-[9px] text-[#1e3a5f] hover:underline font-medium">
                  View All &rarr;
                </Link>
              </div>
              <div className="p-1.5">
                {recentPatients.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center py-3">No patients yet</p>
                ) : (
                  <div className="space-y-0.5">
                    {recentPatients.map((pt) => (
                      <div key={pt.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 transition-colors">
                        <div className="w-6 h-6 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                          {pt.firstName?.charAt(0)}{pt.lastName?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-slate-900 truncate">{pt.firstName} {pt.lastName}</p>
                          {pt.phone && <p className="text-[9px] text-slate-400">{pt.phone}</p>}
                        </div>
                        <span className="text-[8px] text-slate-400 flex-shrink-0">
                          {new Date(pt.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Today's Summary */}
            <div className="bg-white rounded-lg border border-slate-200">
              <div className="px-3 py-1.5 border-b border-slate-100">
                <h3 className="text-xs font-semibold text-slate-900">Today&apos;s Summary</h3>
              </div>
              <div className="p-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="text-center p-2 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-lg font-bold text-[#1e3a5f]">{todayAppts}</p>
                    <p className="text-[8px] text-[#1e3a5f] font-medium uppercase">Scheduled</p>
                  </div>
                  <div className="text-center p-2 bg-[#ecf5e7] rounded-lg border border-[#c5ddbf]">
                    <p className="text-lg font-bold text-[#4d7c43]">{completedAppts}</p>
                    <p className="text-[8px] text-[#4d7c43] font-medium uppercase">Completed</p>
                  </div>
                  <div className="text-center p-2 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-lg font-bold text-amber-600">{totalInQueue}</p>
                    <p className="text-[8px] text-amber-600 font-medium uppercase">In Queue</p>
                  </div>
                  <div className="text-center p-2 bg-red-50 rounded-lg border border-red-100">
                    <p className="text-lg font-bold text-red-600">{appointments.filter(a => a.status === 'CANCELLED').length}</p>
                    <p className="text-[8px] text-red-600 font-medium uppercase">Cancelled</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
