'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4005';

interface QueueStatus {
  patientName: string;
  queueNumber: number;
  status: 'QUEUED' | 'WAITING' | 'WITH_DOCTOR' | 'COMPLETED' | 'NO_SHOW' | 'LEFT';
  priority: 'NORMAL' | 'URGENT' | 'EMERGENCY';
  reasonForVisit: string | null;
  checkedInAt: string;
  calledAt: string | null;
  withDoctorAt: string | null;
  completedAt: string | null;
  waitTimeMinutes: number | null;
  patientsAhead: number;
  patientsBehind: number;
  estimatedWaitMinutes: number | null;
  doctorName: string;
  doctorCheckedIn: boolean;
  hospitalName: string;
  hospitalLogoUrl: string | null;
  queueDate: string;
  canCancel: boolean;
}

const STATUS_STEPS = ['QUEUED', 'WAITING', 'WITH_DOCTOR', 'COMPLETED'] as const;
const STATUS_LABELS: Record<string, string> = {
  QUEUED: 'In Queue',
  WAITING: 'Called',
  WITH_DOCTOR: 'With Doctor',
  COMPLETED: 'Completed',
  NO_SHOW: 'No Show',
  LEFT: 'Cancelled',
};

function fmt(iso: string | null) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return '-'; }
}

export default function QueueStatusPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<QueueStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/queue/public/status/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Link expired or invalid');
        return;
      }
      setData(await res.json());
      setError(null);
    } catch {
      setError('Unable to load queue status.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to leave the queue?')) return;
    setCancelling(true);
    try {
      const res = await fetch(`${API_BASE}/v1/queue/public/cancel/${token}`, { method: 'POST' });
      if (res.ok) fetchStatus();
      else { const err = await res.json().catch(() => ({})); alert(err.message || 'Failed to cancel'); }
    } catch { alert('Failed to cancel.'); }
    finally { setCancelling(false); }
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
          <h2 className="text-base font-semibold text-slate-800 mb-1">Link Expired</h2>
          <p className="text-xs text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isTerminal = ['COMPLETED', 'NO_SHOW', 'LEFT'].includes(data.status);
  const stepIdx = STATUS_STEPS.indexOf(data.status as any);

  // Status-based colors
  const headerBg = isTerminal
    ? data.status === 'COMPLETED' ? 'from-emerald-500 to-emerald-600' : 'from-slate-400 to-slate-500'
    : data.status === 'WITH_DOCTOR' ? 'from-indigo-500 to-blue-600'
    : data.status === 'WAITING' ? 'from-amber-500 to-orange-500'
    : 'from-blue-500 to-blue-600';

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

      {/* Compact Header: Queue Number + Patient + Status */}
      <div className={`bg-gradient-to-br ${headerBg} text-white px-4 py-3 flex-shrink-0`}>
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-2xl font-black">{data.queueNumber}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{data.patientName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm">
                {(data.status === 'WITH_DOCTOR' || data.status === 'WAITING') && (
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${data.status === 'WITH_DOCTOR' ? 'bg-green-300' : 'bg-yellow-300'}`} />
                )}
                <span className="text-[10px] font-semibold">{STATUS_LABELS[data.status]}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${data.doctorCheckedIn ? 'bg-green-300 animate-pulse' : 'bg-red-300'}`} />
              <span className="text-[11px] font-medium truncate">
                Dr. {data.doctorName}
                <span className={`ml-1 text-[9px] ${data.doctorCheckedIn ? 'text-green-200' : 'text-red-200'}`}>
                  ({data.doctorCheckedIn ? 'Available' : 'Not Available'})
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Middle: Content area fills remaining space */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-lg mx-auto px-4 py-3 sm:py-4 space-y-3 sm:space-y-4">

          {/* Progress Stepper */}
          {!isTerminal && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 px-4 py-3">
              <div className="flex items-center">
                {STATUS_STEPS.map((step, i) => {
                  const done = i < stepIdx;
                  const current = i === stepIdx;
                  const future = i > stepIdx;
                  return (
                    <div key={step} className="flex items-center flex-1 last:flex-initial">
                      <div className="flex flex-col items-center">
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold transition-all ${
                          current ? 'bg-blue-500 text-white ring-[3px] ring-blue-100' :
                          done ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {done ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          ) : i + 1}
                        </div>
                        <span className={`text-[8px] sm:text-[9px] mt-0.5 font-medium ${current ? 'text-blue-600' : future ? 'text-slate-400' : 'text-slate-500'}`}>
                          {['Queue', 'Called', 'Doctor', 'Done'][i]}
                        </span>
                      </div>
                      {i < STATUS_STEPS.length - 1 && (
                        <div className={`flex-1 h-[2px] mx-1.5 -mt-3 ${done ? 'bg-blue-500' : 'bg-slate-200'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stats Row: Ahead / Wait / Behind */}
          {!isTerminal && (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3 text-center">
                <p className="text-[10px] sm:text-xs text-slate-500">Ahead</p>
                <p className={`text-2xl sm:text-3xl font-bold ${data.patientsAhead === 0 ? 'text-emerald-600' : 'text-blue-600'}`}>
                  {data.patientsAhead}
                </p>
                {data.patientsAhead === 0 && data.status === 'QUEUED' && (
                  <p className="text-[9px] text-emerald-500 font-semibold">Next!</p>
                )}
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3 text-center">
                <p className="text-[10px] sm:text-xs text-slate-500">Est. Wait</p>
                {!data.doctorCheckedIn ? (
                  <>
                    <p className="text-lg sm:text-xl font-bold text-amber-500">--</p>
                    <p className="text-[8px] text-amber-500 font-medium">Dr. not in yet</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl sm:text-3xl font-bold text-blue-600">
                      {data.estimatedWaitMinutes !== null ? data.estimatedWaitMinutes : '--'}
                    </p>
                    <p className="text-[9px] text-slate-400">{data.estimatedWaitMinutes !== null ? 'min' : ''}</p>
                  </>
                )}
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3 text-center">
                <p className="text-[10px] sm:text-xs text-slate-500">Behind</p>
                <p className="text-2xl sm:text-3xl font-bold text-slate-500">{data.patientsBehind}</p>
              </div>
            </div>
          )}

          {/* Completed banner */}
          {data.status === 'COMPLETED' && (
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 text-center">
              <svg className="w-8 h-8 text-emerald-500 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-sm font-semibold text-emerald-800">Visit Complete</p>
              {data.waitTimeMinutes && <p className="text-xs text-emerald-600 mt-0.5">Total wait: {data.waitTimeMinutes} min</p>}
            </div>
          )}

          {/* Left / No Show banner */}
          {(data.status === 'LEFT' || data.status === 'NO_SHOW') && (
            <div className="bg-slate-100 rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-sm font-semibold text-slate-700">
                {data.status === 'LEFT' ? 'You have left the queue.' : 'Marked as No Show'}
              </p>
            </div>
          )}

          {/* Timeline (compact horizontal on mobile) */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3 sm:p-4">
            <div className="grid grid-cols-4 gap-1 text-center">
              {[
                { label: 'Check In', time: data.checkedInAt },
                { label: 'Called', time: data.calledAt },
                { label: 'Doctor', time: data.withDoctorAt },
                { label: 'Done', time: data.completedAt },
              ].map((item, i) => (
                <div key={i}>
                  <div className={`w-2 h-2 rounded-full mx-auto mb-1 ${item.time ? 'bg-blue-500' : 'bg-slate-200'}`} />
                  <p className={`text-[9px] sm:text-[10px] font-medium ${item.time ? 'text-slate-700' : 'text-slate-400'}`}>{item.label}</p>
                  <p className={`text-[10px] sm:text-xs font-semibold ${item.time ? 'text-blue-600' : 'text-slate-300'}`}>{fmt(item.time)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Auto-refresh note */}
          {!isTerminal && (
            <p className="text-center text-[10px] text-slate-400">
              Auto-updates every 15 seconds
            </p>
          )}

          {/* Cancel Button */}
          {data.canCancel && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full py-2.5 rounded-xl border-2 border-red-200 text-red-600 text-xs sm:text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {cancelling ? 'Cancelling...' : 'Leave Queue'}
            </button>
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
