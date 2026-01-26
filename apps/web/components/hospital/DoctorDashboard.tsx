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
  todayAppointments: number;
  todayCompleted: number;
  todayPending: number;
  totalPatients: number;
  weeklyAppointments: {
    scheduled: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
  monthlyAppointments: {
    scheduled: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
  avgWaitTime: number;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function DoctorDashboard() {
  const { currentHospital, profile, canAccessProduct } = useAuth();
  const { formatShortDate, isToday } = useHospitalTimezone();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [stats, setStats] = useState<DoctorStats | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  const hasAppointments = canAccessProduct('APPOINTMENTS');

  useEffect(() => {
    fetchDashboardData();
    fetchStats();
  }, []);

  async function fetchDashboardData() {
    try {
      const res = await apiFetch('/v1/doctors/me');
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    try {
      const res = await apiFetch('/v1/doctors/me/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }

  async function handleCheckin() {
    setCheckingIn(true);
    try {
      const res = await apiFetch('/v1/doctors/me/checkin', {
        method: 'POST',
      });
      if (res.ok) {
        fetchDashboardData();
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
      const res = await apiFetch('/v1/doctors/me/checkout', {
        method: 'POST',
      });
      if (res.ok) {
        fetchDashboardData();
      }
    } catch (error) {
      console.error('Failed to check out:', error);
    } finally {
      setCheckingIn(false);
    }
  }

  function getTodaySchedule(): Schedule | undefined {
    if (!dashboardData?.schedules) return undefined;
    const today = new Date().getDay();
    return dashboardData.schedules.find(s => s.dayOfWeek === today);
  }

  function isOnTimeOff(): boolean {
    if (!dashboardData?.timeOffs) return false;
    const today = new Date();
    return dashboardData.timeOffs.some(t => {
      const start = new Date(t.startDate);
      const end = new Date(t.endDate);
      return today >= start && today <= end;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const todaySchedule = getTodaySchedule();
  const onTimeOff = isOnTimeOff();
  const checkinStatus = dashboardData?.checkinStatus?.status || 'NOT_CHECKED_IN';
  const doctorName = dashboardData?.user?.fullName || profile?.fullName || 'Doctor';

  return (
    <div className="space-y-5">
      {/* Welcome Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Welcome, Dr. {doctorName}</h1>
          <p className="admin-page-subtitle">
            {currentHospital?.name} - {DAYS_OF_WEEK[new Date().getDay()]}, {formatShortDate(new Date())}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Check-in/out Button */}
          {!onTimeOff && todaySchedule?.isWorking && (
            <>
              {checkinStatus === 'NOT_CHECKED_IN' && (
                <button
                  onClick={handleCheckin}
                  disabled={checkingIn}
                  className="btn-primary"
                >
                  {checkingIn ? 'Checking in...' : 'Check In'}
                </button>
              )}
              {checkinStatus === 'CHECKED_IN' && (
                <button
                  onClick={handleCheckout}
                  disabled={checkingIn}
                  className="btn-secondary"
                >
                  {checkingIn ? 'Checking out...' : 'Check Out'}
                </button>
              )}
              {checkinStatus === 'CHECKED_OUT' && (
                <span className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg">
                  Checked Out
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Status Banner */}
      {onTimeOff && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-amber-800 font-medium">You are currently on time off</span>
          </div>
        </div>
      )}

      {/* Today's Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="admin-stat-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="admin-stat-label">Today's Appointments</p>
              <p className="admin-stat-value">{stats?.todayAppointments || 0}</p>
            </div>
            <div className="admin-stat-icon">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="admin-stat-label">Completed</p>
              <p className="admin-stat-value text-green-600">{stats?.todayCompleted || 0}</p>
            </div>
            <div className="admin-stat-icon bg-green-50 text-green-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="admin-stat-label">Pending</p>
              <p className="admin-stat-value text-amber-600">{stats?.todayPending || 0}</p>
            </div>
            <div className="admin-stat-icon bg-amber-50 text-amber-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="admin-stat-label">Total Patients</p>
              <p className="admin-stat-value">{stats?.totalPatients || 0}</p>
            </div>
            <div className="admin-stat-icon">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions & Schedule */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Quick Actions */}
        <div className="lg:col-span-1">
          <div className="pro-card">
            <div className="pro-card-header">
              <h3 className="pro-card-title">Quick Actions</h3>
            </div>
            <div className="pro-card-body space-y-2">
              {hasAppointments && (
                <Link
                  href="/hospital/appointments"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-[var(--color-primary)]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">My Appointments</p>
                    <p className="text-xs text-gray-500">View your schedule</p>
                  </div>
                </Link>
              )}

              <Link
                href="/hospital/queue"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Today's Queue</p>
                  <p className="text-xs text-gray-500">Manage patient flow</p>
                </div>
              </Link>

              <Link
                href="/hospital/patients"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">My Patients</p>
                  <p className="text-xs text-gray-500">View patient records</p>
                </div>
              </Link>

              <Link
                href="/hospital/doctors/me"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">My Profile</p>
                  <p className="text-xs text-gray-500">Update your information</p>
                </div>
              </Link>
            </div>
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="lg:col-span-2">
          <div className="pro-card">
            <div className="pro-card-header flex items-center justify-between">
              <h3 className="pro-card-title">Today's Schedule</h3>
              <Link href="/hospital/doctors/me" className="text-xs text-[var(--color-primary)] hover:underline">
                Edit Schedule
              </Link>
            </div>
            <div className="pro-card-body">
              {onTimeOff ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">Time Off Today</p>
                  <p className="text-xs text-gray-500">You are on scheduled time off</p>
                </div>
              ) : !todaySchedule?.isWorking ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">Day Off</p>
                  <p className="text-xs text-gray-500">You are not scheduled to work today</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Schedule Info */}
                  <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-blue-900">Working Hours</p>
                        <p className="text-xs text-blue-700">
                          {todaySchedule.shiftStart || '09:00'} - {todaySchedule.shiftEnd || '17:00'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-blue-900">
                        {dashboardData?.profile?.appointmentDurationMinutes || 30} min
                      </p>
                      <p className="text-xs text-blue-700">per appointment</p>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-700">{stats?.todayCompleted || 0}</p>
                      <p className="text-xs text-green-600">Completed</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-2xl font-bold text-blue-700">{stats?.todayPending || 0}</p>
                      <p className="text-xs text-blue-600">Remaining</p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-700">{stats?.avgWaitTime || 0}</p>
                      <p className="text-xs text-gray-600">Avg Wait (min)</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Stats */}
      {stats?.weeklyAppointments && (
        <div className="pro-card">
          <div className="pro-card-header">
            <h3 className="pro-card-title">This Week's Performance</h3>
          </div>
          <div className="pro-card-body">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-3xl font-bold text-blue-700">{stats.weeklyAppointments.scheduled}</p>
                <p className="text-sm text-blue-600">Scheduled</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-3xl font-bold text-green-700">{stats.weeklyAppointments.completed}</p>
                <p className="text-sm text-green-600">Completed</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-3xl font-bold text-red-700">{stats.weeklyAppointments.cancelled}</p>
                <p className="text-sm text-red-600">Cancelled</p>
              </div>
              <div className="text-center p-4 bg-amber-50 rounded-lg">
                <p className="text-3xl font-bold text-amber-700">{stats.weeklyAppointments.noShow}</p>
                <p className="text-sm text-amber-600">No-Show</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
