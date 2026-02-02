'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../AuthProvider';
import { apiFetch } from '../../lib/api';
import { useHospitalTimezone } from '../../hooks/useHospitalTimezone';

interface DoctorProfile {
  id: string;
  userId: string;
  hospitalId: string;
  specialization?: string;
  qualification?: string;
  experience?: number;
  consultationFee?: number;
  appointmentDurationMinutes: number;
  avatarUrl?: string;
}

interface UserInfo {
  fullName: string;
  email: string;
  phone?: string;
}

interface Schedule {
  dayOfWeek: number;
  isWorking: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
}

interface TimeOff {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

interface CheckinStatus {
  status: 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'ON_BREAK' | 'CHECKED_OUT';
  checkedInAt: string | null;
  checkedOutAt: string | null;
}

interface DashboardData {
  profile: DoctorProfile;
  user: UserInfo | null;
  schedules: Schedule[];
  timeOffs: TimeOff[];
  checkinStatus: CheckinStatus;
}

interface DoctorStats {
  today: {
    appointments: number;
    completedAppointments: number;
    inQueue: number;
    waiting: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
  week: {
    appointments: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
  month: {
    appointments: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
  totalPatients: number;
  avgWaitTime: number;
}

interface QueueEntry {
  id: string;
  queueNumber: number;
  status: string;
  priority: string;
  patientName?: string;
  walkInName?: string;
  checkedInAt?: string;
  patient?: { id: string; firstName: string; lastName: string; phone?: string };
}

interface QueueData {
  date: string;
  isCheckedIn: boolean;
  queue: QueueEntry[];
  withDoctor: QueueEntry | null;
  completed: QueueEntry[];
  stats: { totalInQueue: number; totalWithDoctor: number; totalCompleted: number };
}

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime12h(time24: string | null): string {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const p = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${p}` : `${h12}:${String(m).padStart(2, '0')}${p}`;
}

function getPatientName(entry: QueueEntry): string {
  if (entry.patient) return `${entry.patient.firstName} ${entry.patient.lastName}`;
  return entry.walkInName || entry.patientName || 'Unknown';
}

export function DoctorDashboard() {
  const { currentHospital, profile, canAccessProduct } = useAuth();
  const { formatShortDate, getCurrentTime, formatTime: formatTimeHospital } = useHospitalTimezone();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [stats, setStats] = useState<DoctorStats | null>(null);
  const [queueData, setQueueData] = useState<QueueData | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  const hasAppointments = canAccessProduct('APPOINTMENTS');

  const getToday = useCallback(() => {
    const now = getCurrentTime();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [getCurrentTime]);

  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/doctors/me');
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
        return data;
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/doctors/me/stats');
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  const fetchQueueData = useCallback(async (doctorProfileId: string) => {
    try {
      const today = getToday();
      const res = await apiFetch(`/v1/queue/daily?doctorProfileId=${doctorProfileId}&date=${today}`);
      if (res.ok) {
        const data = await res.json();
        setQueueData(data);
      }
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    }
  }, [getToday]);

  useEffect(() => {
    (async () => {
      const [data] = await Promise.all([fetchDashboardData(), fetchStats()]);
      if (data?.profile?.id) {
        fetchQueueData(data.profile.id);
      }
    })();
  }, [fetchDashboardData, fetchStats, fetchQueueData]);

  // Auto-refresh queue every 30s
  useEffect(() => {
    if (!dashboardData?.profile?.id) return;
    const interval = setInterval(() => {
      fetchQueueData(dashboardData.profile.id);
      fetchStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [dashboardData?.profile?.id, fetchQueueData, fetchStats]);

  async function handleCheckin() {
    setCheckingIn(true);
    try {
      const res = await apiFetch('/v1/doctors/me/checkin', { method: 'POST' });
      if (res.ok) {
        await fetchDashboardData();
        if (dashboardData?.profile?.id) fetchQueueData(dashboardData.profile.id);
      }
    } catch (error) {
      console.error('Failed to check in:', error);
    } finally {
      setCheckingIn(false);
    }
  }

  async function handleCheckout() {
    setCheckingIn(true);
    try {
      const res = await apiFetch('/v1/doctors/me/checkout', { method: 'POST' });
      if (res.ok) {
        await fetchDashboardData();
        if (dashboardData?.profile?.id) fetchQueueData(dashboardData.profile.id);
      }
    } catch (error) {
      console.error('Failed to check out:', error);
    } finally {
      setCheckingIn(false);
    }
  }

  function getTodaySchedule(): Schedule | undefined {
    if (!dashboardData?.schedules) return undefined;
    const today = getCurrentTime().getDay();
    return dashboardData.schedules.find(s => s.dayOfWeek === today);
  }

  function isOnTimeOff(): boolean {
    if (!dashboardData?.timeOffs) return false;
    const todayStr = getToday();
    return dashboardData.timeOffs.some(t => todayStr >= t.startDate && todayStr <= t.endDate);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-5 h-5 border-2 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const todaySchedule = getTodaySchedule();
  const onTimeOff = isOnTimeOff();
  const checkinStatus = dashboardData?.checkinStatus?.status || 'NOT_CHECKED_IN';
  const isOnline = checkinStatus === 'CHECKED_IN';
  const doctorName = dashboardData?.user?.fullName || profile?.fullName || 'Doctor';

  // Stats (handle both old and new API response shapes)
  const todayStats = stats?.today || {} as any;
  const todayAppts = todayStats.appointments ?? (stats as any)?.todayAppointments ?? 0;
  const todayCompleted = todayStats.completedAppointments ?? todayStats.completed ?? (stats as any)?.todayCompleted ?? 0;
  const todayInQueue = todayStats.inQueue ?? 0;
  const todayWaiting = todayStats.waiting ?? 0;
  const todayCancelled = todayStats.cancelled ?? 0;
  const todayNoShow = todayStats.noShow ?? 0;
  const avgWait = stats?.avgWaitTime ?? 0;
  const totalPatients = stats?.totalPatients ?? (stats as any)?.totalPatients ?? 0;
  const weekStats = stats?.week ?? (stats as any)?.weeklyAppointments ?? {};
  const monthStats = stats?.month ?? (stats as any)?.monthlyAppointments ?? {};
  const todayRemaining = Math.max(0, todayAppts - todayCompleted);

  // Queue data
  const currentPatient = queueData?.withDoctor;
  const queueList = queueData?.queue || [];
  const nextPatient = queueList[0];

  return (
    <div className="page-fullheight flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-1.5 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-semibold text-slate-900 truncate">Dr. {doctorName}</h1>
            <p className="text-[10px] text-slate-500 truncate">
              {currentHospital?.name} &middot; {DAYS_OF_WEEK[getCurrentTime().getDay()]}, {formatShortDate(getCurrentTime())}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1 ${
              isOnline
                ? 'bg-[#ecf5e7] text-[#4d7c43]'
                : checkinStatus === 'CHECKED_OUT'
                ? 'bg-slate-100 text-slate-500'
                : 'bg-amber-50 text-amber-600'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-[#4d7c43]' : checkinStatus === 'CHECKED_OUT' ? 'bg-slate-400' : 'bg-amber-500'}`} />
              {isOnline ? 'Online' : checkinStatus === 'CHECKED_OUT' ? 'Checked Out' : 'Offline'}
            </span>
            {!onTimeOff && todaySchedule?.isWorking && (
              <>
                {checkinStatus === 'NOT_CHECKED_IN' && (
                  <button onClick={handleCheckin} disabled={checkingIn} className="px-3 py-1 bg-[#1e3a5f] text-white text-[10px] font-medium rounded hover:bg-[#162d4a] disabled:opacity-50">
                    {checkingIn ? '...' : 'Check In'}
                  </button>
                )}
                {checkinStatus === 'CHECKED_IN' && (
                  <button onClick={handleCheckout} disabled={checkingIn} className="px-3 py-1 bg-slate-600 text-white text-[10px] font-medium rounded hover:bg-slate-700 disabled:opacity-50">
                    {checkingIn ? '...' : 'Check Out'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Time Off Banner */}
      {onTimeOff && (
        <div className="flex-shrink-0 px-3 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[10px] text-amber-800 font-medium">You are currently on scheduled time off</span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {/* KPI Row */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {[
            { label: "Today's Appts", value: todayAppts, sub: `${todayRemaining} left`, color: 'text-[#1e3a5f]', subBg: 'bg-blue-50 text-blue-700' },
            { label: 'Completed', value: todayCompleted, sub: todayAppts > 0 ? `${Math.round((todayCompleted / todayAppts) * 100)}%` : '0%', color: 'text-[#4d7c43]', subBg: 'bg-[#ecf5e7] text-[#4d7c43]' },
            { label: 'In Queue', value: todayInQueue + todayWaiting, sub: `${todayWaiting} waiting`, color: 'text-amber-600', subBg: 'bg-amber-50 text-amber-700' },
            { label: 'Cancelled', value: todayCancelled, sub: `${todayNoShow} no-show`, color: 'text-red-600', subBg: 'bg-red-50 text-red-600' },
            { label: 'Avg Wait', value: `${avgWait}m`, sub: 'minutes', color: 'text-slate-700', subBg: 'bg-slate-50 text-slate-500' },
            { label: 'Total Patients', value: totalPatients, sub: 'all time', color: 'text-[#1e3a5f]', subBg: 'bg-blue-50 text-[#1e3a5f]' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-lg border border-slate-200 p-1.5 sm:p-2">
              <p className="text-[8px] sm:text-[9px] font-medium text-slate-500 uppercase tracking-wider truncate">{kpi.label}</p>
              <div className="flex items-end justify-between mt-0.5">
                <p className={`text-lg sm:text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <span className={`text-[7px] sm:text-[8px] px-1 py-0.5 rounded font-medium ${kpi.subBg} hidden sm:inline`}>{kpi.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Two-Column Layout */}
        <div className="grid lg:grid-cols-5 gap-2 min-h-0">
          {/* Left Column (3/5) */}
          <div className="lg:col-span-3 space-y-2">
            {/* Live Queue Status */}
            <div className="bg-white rounded-lg border border-slate-200">
              <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-slate-900">Live Queue</h3>
                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-[#4d7c43] animate-pulse' : 'bg-slate-300'}`} />
                </div>
                <Link href="/hospital/appointments?tab=queue" className="text-[9px] text-[#1e3a5f] hover:underline font-medium">
                  Open Queue →
                </Link>
              </div>
              <div className="p-2.5">
                {!isOnline && !onTimeOff && todaySchedule?.isWorking ? (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-700">Not checked in</p>
                      <p className="text-[10px] text-slate-500">Check in to start seeing patients</p>
                    </div>
                  </div>
                ) : onTimeOff || !todaySchedule?.isWorking ? (
                  <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg">
                    <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-amber-900">{onTimeOff ? 'Time Off' : 'Day Off'}</p>
                      <p className="text-[10px] text-amber-700">{onTimeOff ? 'You are on scheduled time off' : 'Not scheduled today'}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Current Patient */}
                    <div className={`rounded-lg p-2.5 border ${currentPatient ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                      <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">With You Now</p>
                      {currentPatient ? (
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                            {currentPatient.queueNumber}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{getPatientName(currentPatient)}</p>
                            <p className="text-[10px] text-slate-500">
                              {currentPatient.priority !== 'NORMAL' && (
                                <span className={`font-medium ${currentPatient.priority === 'EMERGENCY' ? 'text-red-600' : 'text-amber-600'}`}>{currentPatient.priority} &middot; </span>
                              )}
                              {currentPatient.checkedInAt ? `Since ${formatTimeHospital(currentPatient.checkedInAt)}` : ''}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400">Ready for next patient</p>
                      )}
                    </div>

                    {/* Queue Summary */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="text-center p-2 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-lg font-bold text-[#1e3a5f]">{queueList.length}</p>
                        <p className="text-[8px] text-[#1e3a5f] font-medium uppercase">In Queue</p>
                      </div>
                      <div className="text-center p-2 bg-amber-50 rounded-lg border border-amber-100">
                        <p className="text-lg font-bold text-amber-600">{todayWaiting}</p>
                        <p className="text-[8px] text-amber-600 font-medium uppercase">Waiting</p>
                      </div>
                      <div className="text-center p-2 bg-[#ecf5e7] rounded-lg border border-[#c5ddbf]">
                        <p className="text-lg font-bold text-[#4d7c43]">{queueData?.completed?.length || 0}</p>
                        <p className="text-[8px] text-[#4d7c43] font-medium uppercase">Done</p>
                      </div>
                    </div>

                    {/* Next Up */}
                    {nextPatient && !currentPatient && (
                      <div className="flex items-center gap-2 p-2 bg-amber-50 rounded border border-amber-100">
                        <span className="text-[9px] font-medium text-amber-700 uppercase">Next up:</span>
                        <span className="text-[11px] font-medium text-slate-800">#{nextPatient.queueNumber} {getPatientName(nextPatient)}</span>
                        {nextPatient.priority !== 'NORMAL' && (
                          <span className={`text-[8px] px-1 py-0.5 rounded font-medium ${nextPatient.priority === 'EMERGENCY' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                            {nextPatient.priority}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Today's Schedule */}
            <div className="bg-white rounded-lg border border-slate-200">
              <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-900">Today&apos;s Schedule</h3>
                <Link href="/hospital/profile" className="text-[9px] text-[#1e3a5f] hover:underline font-medium">
                  Edit →
                </Link>
              </div>
              <div className="p-2.5">
                {onTimeOff ? (
                  <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 rounded p-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Time Off — No appointments today
                  </div>
                ) : !todaySchedule?.isWorking ? (
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 rounded p-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Day Off — Not scheduled
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#1e3a5f] flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-900">
                          {formatTime12h(todaySchedule.shiftStart || '09:00')} – {formatTime12h(todaySchedule.shiftEnd || '17:00')}
                        </p>
                        <p className="text-[10px] text-slate-500">{dashboardData?.profile?.appointmentDurationMinutes || 30} min slots</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-center px-2.5 py-1 bg-[#ecf5e7] rounded">
                        <p className="text-sm font-bold text-[#4d7c43]">{todayCompleted}</p>
                        <p className="text-[7px] text-[#4d7c43] font-medium uppercase">Done</p>
                      </div>
                      <div className="text-center px-2.5 py-1 bg-blue-50 rounded">
                        <p className="text-sm font-bold text-[#1e3a5f]">{todayRemaining}</p>
                        <p className="text-[7px] text-[#1e3a5f] font-medium uppercase">Left</p>
                      </div>
                      <div className="text-center px-2.5 py-1 bg-slate-50 rounded">
                        <p className="text-sm font-bold text-slate-700">{avgWait}m</p>
                        <p className="text-[7px] text-slate-500 font-medium uppercase">Wait</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg border border-slate-200">
              <div className="px-3 py-1.5 border-b border-slate-100">
                <h3 className="text-xs font-semibold text-slate-900">Quick Actions</h3>
              </div>
              <div className="p-1.5">
                <div className="grid grid-cols-3 gap-1.5">
                  {hasAppointments && (
                    <Link href="/hospital/appointments" className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3.5 h-3.5 text-[#1e3a5f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <span className="text-[10px] font-medium text-slate-700">Appointments</span>
                    </Link>
                  )}
                  <Link href="/hospital/appointments?tab=queue" className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200">
                    <div className="w-7 h-7 rounded-lg bg-[#ecf5e7] flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-[#4d7c43]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-medium text-slate-700">Daily Queue</span>
                  </Link>
                  <Link href="/hospital/profile" className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-medium text-slate-700">My Profile</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (2/5) */}
          <div className="lg:col-span-2 space-y-2">
            {/* This Week */}
            <div className="bg-white rounded-lg border border-slate-200">
              <div className="px-3 py-1.5 border-b border-slate-100">
                <h3 className="text-xs font-semibold text-slate-900">This Week</h3>
              </div>
              <div className="p-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="text-center p-2 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-lg font-bold text-[#1e3a5f]">{(weekStats as any).appointments ?? (weekStats as any).scheduled ?? 0}</p>
                    <p className="text-[8px] text-[#1e3a5f] font-medium uppercase">Scheduled</p>
                  </div>
                  <div className="text-center p-2 bg-[#ecf5e7] rounded-lg border border-[#c5ddbf]">
                    <p className="text-lg font-bold text-[#4d7c43]">{(weekStats as any).completed ?? 0}</p>
                    <p className="text-[8px] text-[#4d7c43] font-medium uppercase">Completed</p>
                  </div>
                  <div className="text-center p-2 bg-red-50 rounded-lg border border-red-100">
                    <p className="text-lg font-bold text-red-600">{(weekStats as any).cancelled ?? 0}</p>
                    <p className="text-[8px] text-red-600 font-medium uppercase">Cancelled</p>
                  </div>
                  <div className="text-center p-2 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-lg font-bold text-amber-600">{(weekStats as any).noShow ?? 0}</p>
                    <p className="text-[8px] text-amber-600 font-medium uppercase">No-Show</p>
                  </div>
                </div>
              </div>
            </div>

            {/* This Month */}
            <div className="bg-white rounded-lg border border-slate-200">
              <div className="px-3 py-1.5 border-b border-slate-100">
                <h3 className="text-xs font-semibold text-slate-900">This Month</h3>
              </div>
              <div className="p-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="text-center p-2 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-lg font-bold text-[#1e3a5f]">{(monthStats as any).appointments ?? (monthStats as any).scheduled ?? 0}</p>
                    <p className="text-[8px] text-[#1e3a5f] font-medium uppercase">Scheduled</p>
                  </div>
                  <div className="text-center p-2 bg-[#ecf5e7] rounded-lg border border-[#c5ddbf]">
                    <p className="text-lg font-bold text-[#4d7c43]">{(monthStats as any).completed ?? 0}</p>
                    <p className="text-[8px] text-[#4d7c43] font-medium uppercase">Completed</p>
                  </div>
                  <div className="text-center p-2 bg-red-50 rounded-lg border border-red-100">
                    <p className="text-lg font-bold text-red-600">{(monthStats as any).cancelled ?? 0}</p>
                    <p className="text-[8px] text-red-600 font-medium uppercase">Cancelled</p>
                  </div>
                  <div className="text-center p-2 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-lg font-bold text-amber-600">{(monthStats as any).noShow ?? 0}</p>
                    <p className="text-[8px] text-amber-600 font-medium uppercase">No-Show</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Week Schedule */}
            <div className="bg-white rounded-lg border border-slate-200">
              <div className="px-3 py-1.5 border-b border-slate-100">
                <h3 className="text-xs font-semibold text-slate-900">Week Schedule</h3>
              </div>
              <div className="p-1.5">
                <div className="space-y-0.5">
                  {DAYS_SHORT.map((day, idx) => {
                    const schedule = dashboardData?.schedules?.find(s => s.dayOfWeek === idx);
                    const isTodayDay = getCurrentTime().getDay() === idx;
                    return (
                      <div key={day} className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] ${isTodayDay ? 'bg-blue-50 border border-blue-100' : ''}`}>
                        <span className={`w-7 font-semibold ${isTodayDay ? 'text-[#1e3a5f]' : 'text-slate-500'}`}>{day}</span>
                        {schedule?.isWorking ? (
                          <div className="flex items-center gap-1.5 flex-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#4d7c43]" />
                            <span className="text-slate-700 font-medium">
                              {formatTime12h(schedule.shiftStart || '09:00')} – {formatTime12h(schedule.shiftEnd || '17:00')}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                            <span className="text-slate-400">Off</span>
                          </div>
                        )}
                        {isTodayDay && <span className="text-[8px] font-medium text-[#1e3a5f] bg-blue-100 px-1 py-0.5 rounded">Today</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Upcoming Time Off */}
            {dashboardData?.timeOffs && dashboardData.timeOffs.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200">
                <div className="px-3 py-1.5 border-b border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-900">Upcoming Time Off</h3>
                </div>
                <div className="p-1.5 space-y-1 max-h-[120px] overflow-y-auto">
                  {dashboardData.timeOffs.map((to) => (
                    <div key={to.id} className="flex items-center justify-between px-2 py-1.5 bg-amber-50 rounded border border-amber-100">
                      <div>
                        <p className="text-[10px] font-medium text-slate-700">
                          {to.startDate}{to.startDate !== to.endDate && ` – ${to.endDate}`}
                        </p>
                        {to.reason && <p className="text-[9px] text-slate-500">{to.reason}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
