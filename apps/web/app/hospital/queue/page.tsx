'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import { useHospitalTimezone } from '../../../hooks/useHospitalTimezone';
import { DoctorQueue } from '../../../components/hospital/DoctorQueue';

// Role-aware queue page

interface Doctor {
  id: string;
  userId: string;
  name: string;
  specialization?: string;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

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
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
}

interface ScheduledAppointment {
  id: string;
  appointmentId: string;
  startTime: string;
  endTime: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  isCheckedIn: boolean;
  reasonForVisit?: string;
}

interface DoctorCheckin {
  status: 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'ON_BREAK' | 'CHECKED_OUT';
  checkedInAt?: string;
}

interface DailyQueueData {
  date: string;
  doctorCheckin: DoctorCheckin | null;
  queue: QueueEntry[];
  waiting: QueueEntry[];
  withDoctor: QueueEntry | null;
  completed: QueueEntry[];
  scheduled: ScheduledAppointment[];
  stats: {
    totalQueue: number;
    totalWaiting: number;
    totalScheduled: number;
    totalCompleted: number;
  };
}

const ITEMS_PER_PAGE = 10;

function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function formatTimeFromISO(isoString: string): string {
  const date = new Date(isoString);
  const hours = date.getHours();
  const mins = date.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${period}`;
}

export default function QueuePage() {
  const { currentHospital, user, profile } = useAuth();
  const { getCurrentTime, formatDate } = useHospitalTimezone();

  // Determine user role
  const userRole = profile?.isSuperAdmin ? 'SUPER_ADMIN' : (currentHospital?.role || 'STAFF');
  const isDoctor = userRole === 'DOCTOR';
  const isManager = userRole === 'SUPER_ADMIN' || userRole === 'HOSPITAL_MANAGER';

  // Show doctor-specific queue view for doctors
  if (isDoctor) {
    return <DoctorQueue />;
  }

  // Manager/Staff queue view below
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [myDoctorProfile, setMyDoctorProfile] = useState<Doctor | null>(null);
  const [queueData, setQueueData] = useState<DailyQueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);

  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showApptModal, setShowApptModal] = useState(false);
  const [walkInForm, setWalkInForm] = useState({
    patientId: '',
    walkInName: '',
    walkInPhone: '',
    reasonForVisit: '',
    priority: 'NORMAL' as 'NORMAL' | 'URGENT' | 'EMERGENCY',
  });

  // Search states
  const [waitingSearch, setWaitingSearch] = useState('');
  const [queueSearch, setQueueSearch] = useState('');
  const [scheduledSearch, setScheduledSearch] = useState('');
  const [completedSearch, setCompletedSearch] = useState('');

  // Pagination states
  const [scheduledPage, setScheduledPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);

  const getToday = useCallback(() => {
    const now = getCurrentTime();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [getCurrentTime]);

  // Fetch current doctor's own profile (for doctor role)
  const fetchMyDoctorProfile = useCallback(async () => {
    if (!isDoctor) return;
    try {
      const res = await apiFetch('/v1/doctors/me');
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          const myProfile: Doctor = {
            id: data.profile.id,
            userId: data.profile.userId,
            name: data.user?.fullName || profile?.fullName || 'Doctor',
            specialization: data.profile.specialization,
          };
          setMyDoctorProfile(myProfile);
          setSelectedDoctor(myProfile);
          setDoctors([myProfile]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch my doctor profile:', error);
    }
  }, [isDoctor, profile?.fullName]);

  const fetchDoctors = useCallback(async () => {
    // If user is a doctor, only show their own profile
    if (isDoctor) {
      await fetchMyDoctorProfile();
      return;
    }
    try {
      const res = await apiFetch('/v1/appointments/doctors/licensed');
      if (res.ok) {
        const data = await res.json();
        setDoctors(data);
        if (data.length > 0 && !selectedDoctor) {
          setSelectedDoctor(data[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch doctors:', error);
    }
  }, [selectedDoctor, isDoctor, fetchMyDoctorProfile]);

  const fetchQueueData = useCallback(async () => {
    if (!selectedDoctor) return;
    try {
      const today = getToday();
      const res = await apiFetch(`/v1/queue/daily?doctorProfileId=${selectedDoctor.id}&date=${today}`);
      if (res.ok) {
        const data = await res.json();
        setQueueData(data);
      }
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDoctor, getToday]);

  const fetchPatients = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/patients');
      if (res.ok) {
        const data = await res.json();
        setPatients(data);
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    }
  }, []);

  useEffect(() => {
    fetchDoctors();
    fetchPatients();
  }, [isDoctor]);

  useEffect(() => {
    if (selectedDoctor) {
      fetchQueueData();
      const interval = setInterval(fetchQueueData, 30000);
      return () => clearInterval(interval);
    }
  }, [selectedDoctor, fetchQueueData]);

  const handleAddWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctor) return;
    try {
      const res = await apiFetch('/v1/queue/walk-in', {
        method: 'POST',
        body: JSON.stringify({
          doctorProfileId: selectedDoctor.id,
          patientId: walkInForm.patientId || undefined,
          walkInName: walkInForm.walkInName || undefined,
          walkInPhone: walkInForm.walkInPhone || undefined,
          reasonForVisit: walkInForm.reasonForVisit || undefined,
          priority: walkInForm.priority,
        }),
      });
      if (res.ok) {
        setShowWalkInModal(false);
        setWalkInForm({ patientId: '', walkInName: '', walkInPhone: '', reasonForVisit: '', priority: 'NORMAL' });
        fetchQueueData();
      }
    } catch (error) {
      alert('Failed to add walk-in');
    }
  };

  const handleCheckInAppointment = async (appointmentId: string) => {
    try {
      const res = await apiFetch(`/v1/queue/check-in/${appointmentId}`, { method: 'POST' });
      if (res.ok) fetchQueueData();
    } catch (error) {
      alert('Failed to check in');
    }
  };

  const handleAppointmentNoShow = async (appointmentId: string) => {
    try {
      const res = await apiFetch(`/v1/queue/appointment/${appointmentId}/no-show`, { method: 'POST' });
      if (res.ok) fetchQueueData();
    } catch (error) {
      alert('Failed to mark as no show');
    }
  };

  const handleUpdateStatus = async (entryId: string, status: string) => {
    try {
      const res = await apiFetch(`/v1/queue/${entryId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (res.ok) fetchQueueData();
    } catch (error) {
      alert('Failed to update status');
    }
  };

  const handleTogglePriority = async (entryId: string, currentPriority: string) => {
    try {
      const newPriority = currentPriority === 'URGENT' ? 'NORMAL' : 'URGENT';
      const res = await apiFetch(`/v1/queue/${entryId}/priority`, {
        method: 'PATCH',
        body: JSON.stringify({ priority: newPriority }),
      });
      if (res.ok) fetchQueueData();
    } catch (error) {
      alert('Failed to update priority');
    }
  };

  const handleDoctorCheckIn = async () => {
    if (!selectedDoctor) return;
    try {
      const res = await apiFetch('/v1/queue/doctor/check-in', {
        method: 'POST',
        body: JSON.stringify({ doctorProfileId: selectedDoctor.id }),
      });
      if (res.ok) fetchQueueData();
    } catch (error) {}
  };

  const handleDoctorCheckOut = async () => {
    if (!selectedDoctor) return;
    try {
      const res = await apiFetch('/v1/queue/doctor/check-out', {
        method: 'POST',
        body: JSON.stringify({ doctorProfileId: selectedDoctor.id }),
      });
      if (res.ok) fetchQueueData();
    } catch (error) {}
  };

  const getPatientName = (entry: QueueEntry) => {
    if (entry.patient) return `${entry.patient.firstName} ${entry.patient.lastName}`;
    return entry.walkInName || 'Unknown';
  };

  const getPatientPhone = (entry: QueueEntry) => {
    return entry.patient?.phone || entry.walkInPhone || '';
  };

  // Filter functions
  const filterEntries = (entries: QueueEntry[], search: string, sortByPriority: boolean = false) => {
    let filtered = entries;
    if (search) {
      const lower = search.toLowerCase();
      filtered = entries.filter(e => getPatientName(e).toLowerCase().includes(lower) || getPatientPhone(e).includes(search));
    }
    if (sortByPriority) {
      const priorityOrder: Record<string, number> = { EMERGENCY: 0, URGENT: 1, NORMAL: 2 };
      filtered = [...filtered].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    }
    return filtered;
  };

  const filterScheduled = (appointments: ScheduledAppointment[], search: string) => {
    if (!search) return appointments;
    const lower = search.toLowerCase();
    return appointments.filter(a => a.patientName.toLowerCase().includes(lower) || a.patientPhone?.includes(search));
  };

  // Reset pagination when search changes
  useEffect(() => { setScheduledPage(1); }, [scheduledSearch]);
  useEffect(() => { setCompletedPage(1); }, [completedSearch]);

  // Paginated data
  const filteredScheduled = filterScheduled(queueData?.scheduled || [], scheduledSearch).filter(s => !s.isCheckedIn);
  const filteredCompleted = filterEntries(queueData?.completed || [], completedSearch);
  const scheduledTotalPages = Math.ceil(filteredScheduled.length / ITEMS_PER_PAGE);
  const completedTotalPages = Math.ceil(filteredCompleted.length / ITEMS_PER_PAGE);
  const paginatedScheduled = filteredScheduled.slice((scheduledPage - 1) * ITEMS_PER_PAGE, scheduledPage * ITEMS_PER_PAGE);
  const paginatedCompleted = filteredCompleted.slice((completedPage - 1) * ITEMS_PER_PAGE, completedPage * ITEMS_PER_PAGE);

  const doctorStatus = queueData?.doctorCheckin?.status || 'NOT_CHECKED_IN';
  const isCheckedIn = doctorStatus === 'CHECKED_IN';

  if (loading && !queueData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (doctors.length === 0) {
    return (
      <div className="p-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
          <p className="text-xs text-amber-700">No doctors with Appointments license</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-fullheight flex flex-col bg-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-1 bg-white border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Doctor selector - hidden for doctor role (they only see their own queue) */}
          {isDoctor ? (
            <span className="text-sm font-medium text-gray-700">
              Dr. {selectedDoctor?.name || profile?.fullName}
            </span>
          ) : (
            <select
              value={selectedDoctor?.id || ''}
              onChange={(e) => setSelectedDoctor(doctors.find(d => d.id === e.target.value) || null)}
              className="text-xs px-2 py-1 border border-gray-200 rounded bg-white"
            >
              {doctors.map(doc => (
                <option key={doc.id} value={doc.id}>Dr. {doc.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={isCheckedIn ? handleDoctorCheckOut : handleDoctorCheckIn}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
              isCheckedIn ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isCheckedIn ? 'bg-green-500' : 'bg-gray-400'}`} />
            {isCheckedIn ? 'Checked In' : 'Check In'}
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded">{queueData?.stats.totalWaiting || 0} waiting</span>
          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">{queueData?.stats.totalQueue || 0} queue</span>
          <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">{queueData?.stats.totalScheduled || 0} scheduled</span>
          <span className="px-1.5 py-0.5 bg-green-50 text-green-600 rounded">{queueData?.stats.totalCompleted || 0} completed</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-2 p-2 min-h-0 overflow-hidden">
        {/* Left Column */}
        <div className="w-[520px] flex flex-col gap-1.5 flex-shrink-0 min-h-0">
          {/* With Doctor */}
          <div className="h-[90px] bg-blue-50 rounded border border-blue-200 shadow-sm flex flex-col">
            <div className="flex-shrink-0 px-2 py-1 border-b border-blue-200 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-sm font-medium text-blue-800">With Doctor</span>
            </div>
            <div className="flex-1 px-2 py-1 flex items-center">
              {!isCheckedIn ? (
                <p className="text-xs text-gray-500 w-full text-center flex items-center justify-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                  Doctor not arrived
                </p>
              ) : queueData?.withDoctor ? (
                <div className="w-full bg-white rounded p-1.5 border border-blue-200 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                      {queueData.withDoctor.queueNumber}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-gray-800">{getPatientName(queueData.withDoctor)}</p>
                      <p className="text-xs text-gray-500">
                        {formatTimeFromISO(queueData.withDoctor.checkedInAt)}
                        {queueData.withDoctor.reasonForVisit && ` • ${queueData.withDoctor.reasonForVisit}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUpdateStatus(queueData.withDoctor!.id, 'COMPLETED')}
                    className="text-xs px-2 py-0.5 bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    Complete
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-500 w-full text-center">No patient with doctor</p>
              )}
            </div>
          </div>

          {/* Waiting */}
          <div className="h-[150px] bg-orange-50 rounded border border-orange-200 shadow-sm flex flex-col">
            <div className="flex-shrink-0 px-2 py-1 border-b border-orange-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="text-sm font-medium text-orange-800">Waiting ({queueData?.waiting.length || 0})</span>
              </div>
              <div className="relative">
                <svg className="w-3 h-3 text-gray-400 absolute left-1.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search..."
                  value={waitingSearch}
                  onChange={(e) => setWaitingSearch(e.target.value)}
                  className="text-xs pl-5 pr-1 py-0.5 border border-orange-200 rounded bg-white w-20"
                />
              </div>
            </div>
            <div className="flex-1 px-1.5 py-1 space-y-1 overflow-y-auto">
              {filterEntries(queueData?.waiting || [], waitingSearch).map(entry => (
                <div key={entry.id} className="bg-white rounded p-1.5 border border-orange-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 bg-orange-400 text-white rounded-full flex items-center justify-center text-xs font-bold">
                      {entry.queueNumber}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-gray-700">{getPatientName(entry)}</p>
                      <p className="text-xs text-gray-400">
                        {formatTimeFromISO(entry.checkedInAt)}
                        {entry.reasonForVisit && ` • ${entry.reasonForVisit}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUpdateStatus(entry.id, 'WITH_DOCTOR')}
                    disabled={!isCheckedIn || queueData?.withDoctor !== null}
                    className="text-xs px-1.5 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
              ))}
              {filterEntries(queueData?.waiting || [], waitingSearch).length === 0 && (
                <p className="text-xs text-gray-500 text-center py-1">No patients waiting</p>
              )}
            </div>
          </div>

          {/* Queue */}
          <div className="flex-1 min-h-0 bg-white rounded border border-gray-200 shadow-sm flex flex-col">
            <div className="flex-shrink-0 px-2 py-1 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                <span className="text-sm font-medium text-gray-800">Queue ({queueData?.queue.length || 0})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <svg className="w-3 h-3 text-gray-400 absolute left-1.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={queueSearch}
                    onChange={(e) => setQueueSearch(e.target.value)}
                    className="text-xs pl-5 pr-1 py-0.5 border border-gray-200 rounded w-20"
                  />
                </div>
                <button
                  onClick={() => setShowWalkInModal(true)}
                  className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 bg-teal-500 text-white rounded hover:bg-teal-600"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Walk-in
                </button>
                <button
                  onClick={() => setShowApptModal(true)}
                  className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 bg-green-500 text-white rounded hover:bg-green-600"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Appt
                </button>
              </div>
            </div>
            <div className="flex-1 px-1.5 py-1 space-y-1 overflow-y-auto">
              {filterEntries(queueData?.queue || [], queueSearch, true).map(entry => (
                <div
                  key={entry.id}
                  className={`rounded p-1.5 border flex items-center justify-between ${
                    entry.priority === 'EMERGENCY' ? 'bg-red-50 border-red-200' :
                    entry.priority === 'URGENT' ? 'bg-orange-50 border-orange-200' :
                    'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                      entry.priority === 'EMERGENCY' ? 'bg-red-500' :
                      entry.priority === 'URGENT' ? 'bg-orange-500' :
                      'bg-blue-500'
                    }`}>
                      {entry.queueNumber}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-gray-700">{getPatientName(entry)}</p>
                      <p className="text-xs text-gray-400">
                        {formatTimeFromISO(entry.checkedInAt)}
                        {entry.reasonForVisit && ` • ${entry.reasonForVisit}`}
                        {entry.entryType === 'SCHEDULED' && <span className="ml-1 text-purple-500">[Appt]</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => handleTogglePriority(entry.id, entry.priority)}
                      className={`text-[10px] px-1 py-0.5 rounded ${
                        entry.priority === 'URGENT' || entry.priority === 'EMERGENCY'
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : 'bg-gray-400 text-white hover:bg-gray-500'
                      }`}
                      title={entry.priority === 'URGENT' ? 'Remove priority' : 'Mark as priority'}
                    >
                      Priority
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(entry.id, 'WAITING')}
                      className="text-[10px] px-1 py-0.5 bg-orange-400 text-white rounded hover:bg-orange-500"
                    >
                      Call
                    </button>
                    {isCheckedIn && !queueData?.withDoctor && (
                      <button
                        onClick={() => handleUpdateStatus(entry.id, 'WITH_DOCTOR')}
                        className="text-[10px] px-1 py-0.5 bg-green-500 text-white rounded hover:bg-green-600"
                      >
                        Direct
                      </button>
                    )}
                    <button
                      onClick={() => handleUpdateStatus(entry.id, 'NO_SHOW')}
                      className="text-[10px] px-1 py-0.5 bg-red-400 text-white rounded hover:bg-red-500"
                      title="Mark as No Show"
                    >
                      NoShow
                    </button>
                  </div>
                </div>
              ))}
              {filterEntries(queueData?.queue || [], queueSearch, true).length === 0 && (
                <p className="text-xs text-gray-500 text-center py-4">No patients in queue</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="flex-1 flex flex-col gap-1.5 min-h-0">
          {/* Scheduled */}
          <div className="h-[45%] min-h-0 bg-white rounded border border-gray-200 shadow-sm flex flex-col">
            <div className="flex-shrink-0 px-2 py-1 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-medium text-gray-800">Scheduled ({queueData?.scheduled.filter(s => !s.isCheckedIn).length || 0})</span>
              </div>
              <div className="relative">
                <svg className="w-3 h-3 text-gray-400 absolute left-1.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search..."
                  value={scheduledSearch}
                  onChange={(e) => setScheduledSearch(e.target.value)}
                  className="text-xs pl-5 pr-1 py-0.5 border border-gray-200 rounded w-20"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium text-gray-600">Time</th>
                    <th className="px-2 py-1 text-left font-medium text-gray-600">Patient</th>
                    <th className="px-2 py-1 text-left font-medium text-gray-600">Phone</th>
                    <th className="px-2 py-1 text-left font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedScheduled.map(appt => (
                    <tr key={appt.id} className="hover:bg-gray-50">
                      <td className="px-2 py-1 text-gray-700">{formatTime12h(appt.startTime)}</td>
                      <td className="px-2 py-1 font-medium text-gray-800">{appt.patientName}</td>
                      <td className="px-2 py-1 text-gray-500">{appt.patientPhone || '-'}</td>
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => handleCheckInAppointment(appt.appointmentId)}
                            className="text-[10px] px-1 py-0.5 bg-purple-500 text-white rounded hover:bg-purple-600"
                          >
                            CheckIn
                          </button>
                          <button
                            onClick={() => handleAppointmentNoShow(appt.appointmentId)}
                            className="text-[10px] px-1 py-0.5 bg-red-400 text-white rounded hover:bg-red-500"
                            title="Mark as No Show"
                          >
                            NoShow
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedScheduled.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-2 py-4 text-center text-gray-500">No scheduled appointments</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {scheduledTotalPages > 1 && (
              <div className="flex-shrink-0 flex items-center justify-between px-2 py-1 border-t border-gray-200 bg-gray-50">
                <span className="text-[10px] text-gray-500">{filteredScheduled.length} total</span>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setScheduledPage(p => Math.max(1, p - 1))} disabled={scheduledPage === 1} className="px-1.5 py-0.5 text-[10px] border rounded hover:bg-gray-100 disabled:opacity-50">Prev</button>
                  <span className="text-[10px] text-gray-600 px-1">{scheduledPage}/{scheduledTotalPages}</span>
                  <button onClick={() => setScheduledPage(p => Math.min(scheduledTotalPages, p + 1))} disabled={scheduledPage === scheduledTotalPages} className="px-1.5 py-0.5 text-[10px] border rounded hover:bg-gray-100 disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
          </div>

          {/* Completed */}
          <div className="flex-1 min-h-0 bg-green-50 rounded border border-green-200 shadow-sm flex flex-col">
            <div className="flex-shrink-0 px-2 py-1 border-b border-green-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-green-800">Completed ({queueData?.completed.length || 0})</span>
              </div>
              <div className="relative">
                <svg className="w-3 h-3 text-gray-400 absolute left-1.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search..."
                  value={completedSearch}
                  onChange={(e) => setCompletedSearch(e.target.value)}
                  className="text-xs pl-5 pr-1 py-0.5 border border-green-200 rounded bg-white w-20"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-green-100/50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium text-green-700">Patient</th>
                    <th className="px-2 py-1 text-left font-medium text-green-700">In</th>
                    <th className="px-2 py-1 text-left font-medium text-green-700">Done</th>
                    <th className="px-2 py-1 text-left font-medium text-green-700">Wait</th>
                    <th className="px-2 py-1 text-left font-medium text-green-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-green-100">
                  {paginatedCompleted.map(entry => (
                    <tr key={entry.id} className="hover:bg-green-100/30">
                      <td className="px-2 py-1 font-medium text-gray-800">{getPatientName(entry)}</td>
                      <td className="px-2 py-1 text-gray-600">{formatTimeFromISO(entry.checkedInAt)}</td>
                      <td className="px-2 py-1 text-gray-600">
                        {entry.completedAt ? formatTimeFromISO(entry.completedAt) : '-'}
                      </td>
                      <td className="px-2 py-1 text-gray-600">
                        {entry.waitTimeMinutes ? `${entry.waitTimeMinutes}m` : '-'}
                      </td>
                      <td className="px-2 py-1">
                        <span className={`px-1 py-0 rounded text-xs font-medium ${
                          entry.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                          entry.status === 'NO_SHOW' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {entry.status === 'COMPLETED' ? 'Done' : entry.status === 'NO_SHOW' ? 'No Show' : 'Left'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {paginatedCompleted.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-4 text-center text-gray-500">No completed yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {completedTotalPages > 1 && (
              <div className="flex-shrink-0 flex items-center justify-between px-2 py-1 border-t border-green-200 bg-green-100/50">
                <span className="text-[10px] text-green-700">{filteredCompleted.length} total</span>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setCompletedPage(p => Math.max(1, p - 1))} disabled={completedPage === 1} className="px-1.5 py-0.5 text-[10px] border border-green-200 rounded bg-white hover:bg-green-50 disabled:opacity-50">Prev</button>
                  <span className="text-[10px] text-green-700 px-1">{completedPage}/{completedTotalPages}</span>
                  <button onClick={() => setCompletedPage(p => Math.min(completedTotalPages, p + 1))} disabled={completedPage === completedTotalPages} className="px-1.5 py-0.5 text-[10px] border border-green-200 rounded bg-white hover:bg-green-50 disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Walk-in Modal */}
      {showWalkInModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-800">Add Walk-in Patient</h3>
              <button onClick={() => setShowWalkInModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddWalkIn} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Select Patient</label>
                <select
                  value={walkInForm.patientId}
                  onChange={(e) => setWalkInForm({ ...walkInForm, patientId: e.target.value })}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg"
                >
                  <option value="">-- New/Unknown Patient --</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                  ))}
                </select>
              </div>
              {!walkInForm.patientId && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                    <input
                      type="text"
                      value={walkInForm.walkInName}
                      onChange={(e) => setWalkInForm({ ...walkInForm, walkInName: e.target.value })}
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg"
                      placeholder="Patient name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                    <input
                      type="text"
                      value={walkInForm.walkInPhone}
                      onChange={(e) => setWalkInForm({ ...walkInForm, walkInPhone: e.target.value })}
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg"
                      placeholder="Phone number"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reason for Visit</label>
                <input
                  type="text"
                  value={walkInForm.reasonForVisit}
                  onChange={(e) => setWalkInForm({ ...walkInForm, reasonForVisit: e.target.value })}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg"
                  placeholder="e.g., Follow-up, Consultation"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                <select
                  value={walkInForm.priority}
                  onChange={(e) => setWalkInForm({ ...walkInForm, priority: e.target.value as any })}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg"
                >
                  <option value="NORMAL">Normal</option>
                  <option value="URGENT">Urgent</option>
                  <option value="EMERGENCY">Emergency</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowWalkInModal(false)} className="text-sm px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="text-sm px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600">
                  Add to Queue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Appointment Check-in Modal */}
      {showApptModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-800">Check In Appointment</h3>
              <button onClick={() => setShowApptModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-3">Select an appointment to check in:</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {queueData?.scheduled.filter(s => !s.isCheckedIn).map(appt => (
                  <button
                    key={appt.id}
                    onClick={() => {
                      handleCheckInAppointment(appt.appointmentId);
                      setShowApptModal(false);
                    }}
                    className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50"
                  >
                    <p className="text-sm font-medium text-gray-800">{appt.patientName}</p>
                    <p className="text-xs text-gray-500">{formatTime12h(appt.startTime)}</p>
                  </button>
                ))}
                {(!queueData?.scheduled || queueData.scheduled.filter(s => !s.isCheckedIn).length === 0) && (
                  <p className="text-center text-gray-500 py-4">No appointments to check in</p>
                )}
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={() => setShowApptModal(false)} className="text-sm px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
