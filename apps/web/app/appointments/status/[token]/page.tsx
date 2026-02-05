'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4005';

interface AppointmentStatus {
  id: string;
  patientName: string;
  doctorName: string;
  doctorSpecialization: string | null;
  hospitalName: string;
  hospitalLogoUrl: string | null;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  reasonForVisit: string | null;
  cancellationReason: string | null;
  bookedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  canCancel: boolean;
  canReschedule: boolean;
}

interface SlotOption {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

interface AvailableSlots {
  date: string;
  doctorProfileId: string;
  morning: SlotOption[];
  evening: SlotOption[];
  night: SlotOption[];
}

function fmtTime(time: string | null) {
  if (!time) return '-';
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function fmtDate(dateStr: string) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'from-blue-500 to-blue-600',
  CONFIRMED: 'from-indigo-500 to-blue-600',
  COMPLETED: 'from-emerald-500 to-emerald-600',
  CANCELLED: 'from-slate-400 to-slate-500',
  NO_SHOW: 'from-slate-400 to-slate-500',
};

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No Show',
};

export default function AppointmentStatusPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [data, setData] = useState<AppointmentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Cancel state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Reschedule state
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState<AvailableSlots | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/appointments/public/status/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Link expired or invalid');
        return;
      }
      setData(await res.json());
      setError(null);
    } catch {
      setError('Unable to load appointment status.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Fetch available slots when date changes
  useEffect(() => {
    if (!rescheduleDate || !showReschedule) return;
    setLoadingSlots(true);
    setSelectedSlotId(null);
    fetch(`${API_BASE}/v1/appointments/public/slots/${token}?date=${rescheduleDate}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setAvailableSlots(data);
        setLoadingSlots(false);
      })
      .catch(() => {
        setAvailableSlots(null);
        setLoadingSlots(false);
      });
  }, [rescheduleDate, showReschedule, token]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`${API_BASE}/v1/appointments/public/cancel/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason || undefined }),
      });
      if (res.ok) {
        setShowCancelDialog(false);
        setCancelReason('');
        fetchStatus();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Failed to cancel');
      }
    } catch {
      alert('Failed to cancel appointment.');
    } finally {
      setCancelling(false);
    }
  };

  const handleReschedule = async () => {
    if (!selectedSlotId) return;
    setRescheduling(true);
    try {
      const res = await fetch(`${API_BASE}/v1/appointments/public/reschedule/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: selectedSlotId }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.newToken) {
          router.replace(`/appointments/status/${result.newToken}`);
        } else {
          fetchStatus();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Failed to reschedule');
      }
    } catch {
      alert('Failed to reschedule appointment.');
    } finally {
      setRescheduling(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="h-dvh bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="h-dvh bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 max-w-xs w-full text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-800 mb-1">Appointment Not Found</h2>
          <p className="text-xs text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isActive = ['SCHEDULED', 'CONFIRMED'].includes(data.status);
  const headerBg = STATUS_COLORS[data.status] || 'from-slate-400 to-slate-500';

  // Get tomorrow as min date for reschedule
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  const renderSlotSection = (label: string, slots: SlotOption[]) => {
    if (slots.length === 0) return null;
    return (
      <div>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {slots.map(slot => (
            <button
              key={slot.id}
              onClick={() => setSelectedSlotId(slot.id)}
              className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedSlotId === slot.id
                  ? 'bg-blue-500 text-white ring-2 ring-blue-200'
                  : 'bg-slate-50 text-slate-700 hover:bg-blue-50 border border-slate-200'
              }`}
            >
              {fmtTime(slot.startTime)}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="h-dvh flex flex-col bg-slate-50 overflow-hidden">
      {/* Hospital Logo Bar */}
      <div className="flex-shrink-0 bg-white px-4 py-2 border-b border-slate-100">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          {data.hospitalLogoUrl ? (
            <img
              src={data.hospitalLogoUrl}
              alt={data.hospitalName}
              className="w-7 h-7 rounded-md object-contain flex-shrink-0"
            />
          ) : (
            <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">{data.hospitalName?.charAt(0) || 'H'}</span>
            </div>
          )}
          <h1 className="text-xs sm:text-sm font-bold text-slate-800 truncate">{data.hospitalName}</h1>
        </div>
      </div>

      {/* Header: Patient + Doctor + Status */}
      <div className={`bg-gradient-to-br ${headerBg} text-white px-4 py-3 flex-shrink-0`}>
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{data.patientName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm">
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-green-300" />
                )}
                <span className="text-[10px] font-semibold">{STATUS_LABELS[data.status]}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-[11px] font-medium truncate">
                Dr. {data.doctorName}
                {data.doctorSpecialization && (
                  <span className="ml-1 text-[9px] text-white/70">({data.doctorSpecialization})</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-lg mx-auto px-4 py-3 sm:py-4 space-y-3 sm:space-y-4">

          {/* Appointment Details Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Date</p>
                <p className="text-sm font-semibold text-slate-800">{fmtDate(data.appointmentDate)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Time</p>
                <p className="text-sm font-semibold text-slate-800">{fmtTime(data.startTime)} - {fmtTime(data.endTime)}</p>
              </div>
              {data.reasonForVisit && (
                <div className="col-span-2">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Reason</p>
                  <p className="text-xs text-slate-600">{data.reasonForVisit}</p>
                </div>
              )}
            </div>
          </div>

          {/* Completed banner */}
          {data.status === 'COMPLETED' && (
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 text-center">
              <svg className="w-8 h-8 text-emerald-500 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold text-emerald-800">Appointment Completed</p>
              {data.completedAt && (
                <p className="text-xs text-emerald-600 mt-0.5">
                  Completed on {new Date(data.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          )}

          {/* Cancelled banner */}
          {data.status === 'CANCELLED' && (
            <div className="bg-slate-100 rounded-xl border border-slate-200 p-4 text-center">
              <svg className="w-8 h-8 text-slate-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold text-slate-700">Appointment Cancelled</p>
              {data.cancellationReason && (
                <p className="text-xs text-slate-500 mt-0.5">{data.cancellationReason}</p>
              )}
            </div>
          )}

          {/* No Show banner */}
          {data.status === 'NO_SHOW' && (
            <div className="bg-slate-100 rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-sm font-semibold text-slate-700">Marked as No Show</p>
            </div>
          )}

          {/* Reschedule Section */}
          {showReschedule && isActive && (
            <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Reschedule Appointment</h3>
                <button
                  onClick={() => { setShowReschedule(false); setAvailableSlots(null); setSelectedSlotId(null); }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1 block">Select a new date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  min={minDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {loadingSlots && (
                <div className="flex items-center justify-center py-4">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {availableSlots && !loadingSlots && (
                <div className="space-y-3">
                  {availableSlots.morning.length === 0 && availableSlots.evening.length === 0 && availableSlots.night.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-2">No available slots on this date</p>
                  ) : (
                    <>
                      {renderSlotSection('Morning', availableSlots.morning)}
                      {renderSlotSection('Afternoon / Evening', availableSlots.evening)}
                      {renderSlotSection('Night', availableSlots.night)}
                    </>
                  )}

                  {selectedSlotId && (
                    <button
                      onClick={handleReschedule}
                      disabled={rescheduling}
                      className="w-full py-2.5 rounded-xl bg-blue-500 text-white text-xs sm:text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                    >
                      {rescheduling ? 'Rescheduling...' : 'Confirm Reschedule'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Cancel Confirmation Dialog */}
          {showCancelDialog && isActive && (
            <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-800">Cancel Appointment?</h3>
              <p className="text-xs text-slate-500">This action cannot be undone. Your time slot will be released.</p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation (optional)"
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowCancelDialog(false); setCancelReason(''); }}
                  className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50"
                >
                  Keep Appointment
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 py-2 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {isActive && !showCancelDialog && !showReschedule && (
            <div className="space-y-2">
              <button
                onClick={() => setShowReschedule(true)}
                className="w-full py-2.5 rounded-xl bg-blue-500 text-white text-xs sm:text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                Reschedule Appointment
              </button>
              <button
                onClick={() => setShowCancelDialog(true)}
                className="w-full py-2.5 rounded-xl border-2 border-red-200 text-red-600 text-xs sm:text-sm font-medium hover:bg-red-50 transition-colors"
              >
                Cancel Appointment
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 py-2 text-center border-t border-slate-100 bg-white">
        <div className="flex items-center justify-center gap-1.5">
          <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <span className="text-[10px] text-slate-400 font-medium">Powered by <span className="text-blue-500 font-semibold">CliniQFlow</span></span>
        </div>
      </div>
    </div>
  );
}
