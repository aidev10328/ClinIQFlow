'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../AuthProvider';
import { apiFetch } from '../../lib/api';
import { useHospitalTimezone } from '../../hooks/useHospitalTimezone';

interface QueueEntry {
  id: string;
  queueNumber: number;
  entryType: 'WALK_IN' | 'SCHEDULED';
  status: 'QUEUED' | 'WAITING' | 'WITH_DOCTOR' | 'COMPLETED' | 'NO_SHOW' | 'LEFT';
  priority: 'NORMAL' | 'URGENT' | 'EMERGENCY';
  walkInName?: string;
  walkInPhone?: string;
  reasonForVisit?: string;
  checkedInAt: string;
  calledAt?: string;
  withDoctorAt?: string;
  completedAt?: string;
  waitTimeMinutes?: number;
  consultationMinutes?: number;
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
}

interface CheckinEvent {
  id: string;
  eventType: 'CHECK_IN' | 'CHECK_OUT';
  eventTime: string;
}

interface DailyQueueData {
  date: string;
  checkinEvents: CheckinEvent[];
  isCheckedIn: boolean;
  queue: QueueEntry[];
  withDoctor: QueueEntry | null;
  completed: QueueEntry[];
  stats: {
    totalInQueue: number;
    totalWithDoctor: number;
    totalCompleted: number;
  };
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const hours = date.getHours();
  const mins = date.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${period}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function calculateMinutes(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.round((endDate.getTime() - startDate.getTime()) / 60000);
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case 'EMERGENCY':
      return { bg: 'bg-red-100', text: 'text-red-700', label: 'EMR' };
    case 'URGENT':
      return { bg: 'bg-amber-100', text: 'text-amber-700', label: 'URG' };
    default:
      return null;
  }
}

export function DoctorQueue() {
  const { profile } = useAuth();
  const { formatShortDate, timezone } = useHospitalTimezone();

  const [loading, setLoading] = useState(true);
  const [queueData, setQueueData] = useState<DailyQueueData | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Get today's date string in hospital timezone
  const getToday = useCallback(() => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  }, [timezone]);

  const fetchQueueData = useCallback(async () => {
    try {
      const today = getToday();
      const res = await apiFetch(`/v1/doctors/me/queue?date=${today}`);
      if (res.ok) {
        const data = await res.json();
        setQueueData(data);
      }
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    } finally {
      setLoading(false);
    }
  }, [getToday]);

  useEffect(() => {
    fetchQueueData();
    const interval = setInterval(fetchQueueData, 30000);
    return () => clearInterval(interval);
  }, [fetchQueueData]);

  const handleCheckIn = async () => {
    setActionLoading('checkin');
    try {
      const today = getToday();
      const res = await apiFetch('/v1/doctors/me/checkin', {
        method: 'POST',
        body: JSON.stringify({ date: today }),
      });
      if (res.ok) {
        fetchQueueData();
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.message || 'Failed to check in.');
      }
    } catch (error) {
      alert('Failed to check in.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckOut = async () => {
    setActionLoading('checkout');
    try {
      const today = getToday();
      const res = await apiFetch('/v1/doctors/me/checkout', {
        method: 'POST',
        body: JSON.stringify({ date: today }),
      });
      if (res.ok) {
        fetchQueueData();
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.message || 'Failed to check out.');
      }
    } catch (error) {
      alert('Failed to check out.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleComplete = async (entryId: string) => {
    setActionLoading(entryId);
    try {
      const res = await apiFetch(`/v1/queue/${entryId}/complete`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchQueueData();
      }
    } catch (error) {
      console.error('Failed to complete:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const isCheckedIn = queueData?.isCheckedIn ?? false;
  const doctorName = profile?.fullName || 'Doctor';
  const todayFormatted = formatShortDate(new Date());

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentPatient = queueData?.withDoctor;
  const patientName = currentPatient?.patient
    ? `${currentPatient.patient.firstName} ${currentPatient.patient.lastName}`
    : currentPatient?.walkInName || 'Walk-in';
  const priorityBadge = currentPatient ? getPriorityBadge(currentPatient.priority) : null;

  return (
    <div className="page-fullheight flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2 bg-white border-b">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-gray-900">My Queue</h1>
            <p className="text-[11px] text-gray-500">Dr. {doctorName} • {todayFormatted}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCheckIn}
              disabled={actionLoading === 'checkin'}
              className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white text-[11px] rounded font-medium hover:bg-green-700 disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14" />
              </svg>
              {actionLoading === 'checkin' ? '...' : 'In'}
            </button>
            <button
              onClick={handleCheckOut}
              disabled={actionLoading === 'checkout'}
              className="flex items-center gap-1 px-2.5 py-1 bg-gray-600 text-white text-[11px] rounded font-medium hover:bg-gray-700 disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" />
              </svg>
              {actionLoading === 'checkout' ? '...' : 'Out'}
            </button>
          </div>
        </div>
      </div>

      {/* Check-in Events - Compact */}
      {queueData?.checkinEvents && queueData.checkinEvents.length > 0 && (
        <div className="flex-shrink-0 px-4 py-1.5 bg-gray-100 border-b">
          <div className="flex items-center gap-2 text-[10px] overflow-x-auto">
            {queueData.checkinEvents.map((event) => (
              <span
                key={event.id}
                className={`px-1.5 py-0.5 rounded ${
                  event.eventType === 'CHECK_IN' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                }`}
              >
                {event.eventType === 'CHECK_IN' ? 'In' : 'Out'} {formatTime(event.eventTime)}
              </span>
            ))}
            <span className={`ml-auto px-1.5 py-0.5 rounded font-medium ${
              isCheckedIn ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
            }`}>
              {isCheckedIn ? 'IN' : 'OUT'}
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex gap-2 p-2 min-h-0 overflow-hidden">
        {/* Left Column - Current Patient + Queue */}
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          {/* Current Patient - Compact */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-2.5 py-1.5 border-b border-gray-100 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-xs font-semibold text-gray-900">Current Patient</span>
            </div>

            <div className="p-2.5">
              {!currentPatient ? (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-500">No patient currently</p>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {/* Queue Number */}
                  <div className="w-12 h-12 bg-blue-500 text-white rounded-lg flex items-center justify-center text-lg font-bold flex-shrink-0">
                    #{currentPatient.queueNumber}
                  </div>

                  {/* Patient Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-900 truncate">{patientName}</span>
                      {priorityBadge && (
                        <span className={`px-1 py-0.5 text-[8px] font-medium rounded ${priorityBadge.bg} ${priorityBadge.text}`}>
                          {priorityBadge.label}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500">
                      {currentPatient.entryType === 'SCHEDULED' ? 'Appointment' : 'Walk-in'}
                      {currentPatient.reasonForVisit && ` • ${currentPatient.reasonForVisit}`}
                    </p>
                  </div>

                  {/* Complete Button */}
                  <button
                    onClick={() => handleComplete(currentPatient.id)}
                    disabled={actionLoading === currentPatient.id}
                    className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    {actionLoading === currentPatient.id ? '...' : 'Complete'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Queue Section */}
          <div className="flex-1 bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col min-h-0">
            <div className="px-2.5 py-1.5 border-b border-gray-100 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-xs font-semibold text-gray-900">In Queue</span>
              <span className="text-[10px] text-gray-500">({queueData?.queue?.length || 0})</span>
            </div>

            <div className="flex-1 overflow-auto p-2">
              {!queueData?.queue || queueData.queue.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-xs text-gray-500">No patients in queue</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {queueData.queue.map((entry) => {
                    const queuePatientName = entry.patient
                      ? `${entry.patient.firstName} ${entry.patient.lastName}`
                      : entry.walkInName || 'Walk-in';
                    const queuePriorityBadge = getPriorityBadge(entry.priority);

                    return (
                      <div
                        key={entry.id}
                        className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100"
                      >
                        {/* Queue Number */}
                        <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {entry.queueNumber}
                        </div>

                        {/* Patient Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-medium text-gray-900 truncate">{queuePatientName}</span>
                            {queuePriorityBadge && (
                              <span className={`px-1 py-0.5 text-[7px] font-medium rounded ${queuePriorityBadge.bg} ${queuePriorityBadge.text}`}>
                                {queuePriorityBadge.label}
                              </span>
                            )}
                            {entry.status === 'WAITING' && (
                              <span className="px-1 py-0.5 text-[7px] font-medium rounded bg-blue-100 text-blue-700">
                                READY
                              </span>
                            )}
                          </div>
                          <p className="text-[9px] text-gray-500">
                            In: {formatTime(entry.checkedInAt)}
                            {entry.reasonForVisit && ` • ${entry.reasonForVisit}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Completed */}
        <div className="w-[300px] bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col min-h-0">
          <div className="px-2.5 py-1.5 border-b border-gray-100 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-semibold text-gray-900">Completed</span>
            <span className="text-[10px] text-gray-500">({queueData?.completed?.length || 0})</span>
          </div>

          <div className="flex-1 overflow-auto">
            {!queueData?.completed || queueData.completed.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-gray-500">No completed yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {/* Header */}
                <div className="px-2 py-1 bg-gray-50 flex items-center text-[8px] font-medium text-gray-500 uppercase">
                  <div className="w-6">#</div>
                  <div className="flex-1">Patient</div>
                  <div className="w-12 text-center">In</div>
                  <div className="w-12 text-center">Out</div>
                  <div className="w-10 text-center">Dur</div>
                </div>

                {queueData.completed.map((entry) => {
                  const completedName = entry.patient
                    ? `${entry.patient.firstName} ${entry.patient.lastName}`
                    : entry.walkInName || 'Walk-in';
                  const duration = entry.withDoctorAt && entry.completedAt
                    ? calculateMinutes(entry.withDoctorAt, entry.completedAt)
                    : 0;

                  return (
                    <div key={entry.id} className="px-2 py-1.5 flex items-center hover:bg-gray-50">
                      <div className="w-6">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100 text-green-700 text-[8px] font-medium">
                          {entry.queueNumber}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-medium text-gray-900 truncate">{completedName}</p>
                      </div>
                      <div className="w-12 text-center text-[9px] text-gray-600">
                        {formatTime(entry.checkedInAt)}
                      </div>
                      <div className="w-12 text-center text-[9px] text-gray-600">
                        {entry.completedAt ? formatTime(entry.completedAt) : '-'}
                      </div>
                      <div className="w-10 text-center">
                        <span className={`inline-flex px-1 py-0.5 rounded text-[8px] font-medium ${
                          duration <= 15 ? 'bg-green-100 text-green-700' :
                          duration <= 30 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {duration > 0 ? formatDuration(duration) : '-'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary */}
          {queueData?.completed && queueData.completed.length > 0 && (
            <div className="px-2 py-1.5 border-t border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-gray-500">Total: <span className="font-semibold text-gray-900">{queueData.completed.length}</span></span>
                <span className="text-gray-500">
                  Avg: <span className="font-semibold text-gray-900">
                    {formatDuration(
                      Math.round(
                        queueData.completed.reduce((sum, e) => {
                          if (e.withDoctorAt && e.completedAt) {
                            return sum + calculateMinutes(e.withDoctorAt, e.completedAt);
                          }
                          return sum;
                        }, 0) / (queueData.completed.length || 1)
                      )
                    )}
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
