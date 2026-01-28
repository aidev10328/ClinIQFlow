'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import { useHospitalTimezone } from '../../../hooks/useHospitalTimezone';

const DoctorAppointments = dynamic(
  () => import('../../../components/hospital/DoctorAppointments').then((m) => m.DoctorAppointments),
  { loading: () => null }
);

// Role-aware appointments page

interface Doctor {
  id: string;
  userId: string;
  name: string;
  specialization?: string;
  appointmentDurationMinutes: number;
}

interface DoctorSchedule {
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  isWorking: boolean;
  morningShift: boolean;
  eveningShift: boolean;
  nightShift: boolean;
}

interface DoctorTimeOff {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

interface DoctorDetails {
  schedules: DoctorSchedule[];
  timeOffs: DoctorTimeOff[];
}

interface Slot {
  id: string;
  hospitalId: string;
  doctorProfileId: string;
  doctorName: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  period: 'MORNING' | 'EVENING' | 'NIGHT';
  status: 'AVAILABLE' | 'BOOKED' | 'BLOCKED';
  appointmentId?: string;
  patientId?: string;
  patientName?: string;
}

interface SlotsForDate {
  date: string;
  formattedDate: string;
  morning: Slot[];
  evening: Slot[];
  night: Slot[];
  stats: {
    total: number;
    available: number;
    booked: number;
    blocked: number;
  };
}

interface CalendarDay {
  date: string;
  hasSlots: boolean;
  availableCount: number;
  bookedCount: number;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'p' : 'a';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')}${period}`;
}

export default function AppointmentsPage() {
  const { currentHospital, profile } = useAuth();
  const { getCurrentTime } = useHospitalTimezone();

  // Determine user role
  const userRole = profile?.isSuperAdmin ? 'SUPER_ADMIN' : (currentHospital?.role || 'STAFF');
  const isDoctor = userRole === 'DOCTOR';
  const isManager = userRole === 'SUPER_ADMIN' || userRole === 'HOSPITAL_MANAGER';

  // Show doctor-specific appointments view for doctors
  if (isDoctor) {
    return <DoctorAppointments />;
  }

  // Manager/Staff appointments view below
  // Get current date in hospital timezone
  const getHospitalToday = useCallback(() => {
    return getCurrentTime();
  }, [getCurrentTime]);

  // Format date as YYYY-MM-DD in hospital timezone
  const formatDateString = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // State - initialize with hospital timezone
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => getHospitalToday());
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const today = getHospitalToday();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [slotsData, setSlotsData] = useState<SlotsForDate | null>(null);
  const [doctorDetails, setDoctorDetails] = useState<DoctorDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Modal states
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Generate modal state
  const [generateStartDate, setGenerateStartDate] = useState('');
  const [generateEndDate, setGenerateEndDate] = useState('');
  const [generating, setGenerating] = useState(false);

  // Booking modal state
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [reasonForVisit, setReasonForVisit] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [booking, setBooking] = useState(false);

  // Fetch doctor's own profile (for doctor role)
  const fetchMyDoctorProfile = useCallback(async () => {
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
            appointmentDurationMinutes: data.profile.appointmentDurationMinutes || 30,
          };
          setDoctors([myProfile]);
          setSelectedDoctor(myProfile);
        }
      }
    } catch (error) {
      console.error('Failed to fetch my doctor profile:', error);
    } finally {
      setLoading(false);
    }
  }, [profile?.fullName]);

  // Fetch doctors with APPOINTMENTS license
  const fetchDoctors = useCallback(async () => {
    // If user is a doctor, only fetch their own profile
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
    } finally {
      setLoading(false);
    }
  }, [selectedDoctor, isDoctor, fetchMyDoctorProfile]);

  // Fetch calendar overview for a month
  const fetchCalendar = useCallback(async () => {
    if (!selectedDoctor) return;

    try {
      const year = calendarMonth.getFullYear();
      const month = calendarMonth.getMonth() + 1;
      const res = await apiFetch(`/v1/appointments/calendar/${year}/${month}?doctorProfileId=${selectedDoctor.id}`);
      if (res.ok) {
        const data = await res.json();
        setCalendarDays(data);
      }
    } catch (error) {
      console.error('Failed to fetch calendar:', error);
    }
  }, [selectedDoctor, calendarMonth]);

  // Fetch slots for selected date
  const fetchSlots = useCallback(async () => {
    if (!selectedDoctor) return;

    setSlotsLoading(true);
    try {
      const dateStr = formatDateString(selectedDate);
      const res = await apiFetch(`/v1/appointments/slots/date/${dateStr}?doctorProfileId=${selectedDoctor.id}`);
      if (res.ok) {
        const data = await res.json();
        setSlotsData(data);
      }
    } catch (error) {
      console.error('Failed to fetch slots:', error);
    } finally {
      setSlotsLoading(false);
    }
  }, [selectedDoctor, selectedDate, formatDateString]);

  // Fetch patients for booking
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

  // Fetch doctor details (schedules and time offs)
  const fetchDoctorDetails = useCallback(async (doctorProfileId: string) => {
    try {
      const [schedulesRes, timeOffsRes] = await Promise.all([
        apiFetch(`/v1/doctors/${doctorProfileId}/schedules`),
        apiFetch(`/v1/doctors/${doctorProfileId}/time-off`),
      ]);

      const schedules = schedulesRes.ok ? await schedulesRes.json() : [];
      const timeOffs = timeOffsRes.ok ? await timeOffsRes.json() : [];

      setDoctorDetails({ schedules, timeOffs });
    } catch (error) {
      console.error('Failed to fetch doctor details:', error);
      setDoctorDetails({ schedules: [], timeOffs: [] });
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchDoctors(), fetchPatients()]);
  }, []);

  useEffect(() => {
    if (selectedDoctor) {
      Promise.all([fetchCalendar(), fetchSlots(), fetchDoctorDetails(selectedDoctor.id)]);
    }
  }, [selectedDoctor, calendarMonth, selectedDate, fetchDoctorDetails]);

  // Generate slots handler
  const handleGenerateSlots = async () => {
    if (!selectedDoctor || !generateStartDate || !generateEndDate) return;

    setGenerating(true);
    try {
      const res = await apiFetch('/v1/appointments/slots/generate', {
        method: 'POST',
        body: JSON.stringify({
          doctorProfileId: selectedDoctor.id,
          startDate: generateStartDate,
          endDate: generateEndDate,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        alert(`Generated ${result.slotsGenerated} slots (${result.slotsSkipped} skipped)`);
        setShowGenerateModal(false);
        setGenerateStartDate('');
        setGenerateEndDate('');
        fetchCalendar();
        fetchSlots();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to generate slots');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to generate slots');
    } finally {
      setGenerating(false);
    }
  };

  // Book appointment handler
  const handleBookAppointment = async () => {
    if (!selectedSlot || !selectedPatient) return;

    setBooking(true);
    try {
      const res = await apiFetch('/v1/appointments', {
        method: 'POST',
        body: JSON.stringify({
          slotId: selectedSlot.id,
          patientId: selectedPatient.id,
          reasonForVisit: reasonForVisit || null,
          notes: bookingNotes || null,
        }),
      });

      if (res.ok) {
        setShowBookingModal(false);
        setSelectedSlot(null);
        setSelectedPatient(null);
        setReasonForVisit('');
        setBookingNotes('');
        setPatientSearch('');
        fetchSlots();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to book appointment');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to book appointment');
    } finally {
      setBooking(false);
    }
  };

  // Cancel appointment handler
  const handleCancelAppointment = async (appointmentId: string) => {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;

    try {
      const res = await apiFetch(`/v1/appointments/${appointmentId}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      if (res.ok) {
        fetchSlots();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to cancel appointment');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to cancel appointment');
    }
  };

  // Block slot handler
  const handleBlockSlot = async (slotId: string) => {
    try {
      const res = await apiFetch(`/v1/appointments/slots/${slotId}/block`, {
        method: 'PATCH',
      });
      if (res.ok) {
        fetchSlots();
        fetchCalendar();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to block slot');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to block slot');
    }
  };

  // Unblock slot handler
  const handleUnblockSlot = async (slotId: string) => {
    try {
      const res = await apiFetch(`/v1/appointments/slots/${slotId}/unblock`, {
        method: 'PATCH',
      });
      if (res.ok) {
        fetchSlots();
        fetchCalendar();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to unblock slot');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to unblock slot');
    }
  };

  // Calendar navigation
  const prevMonth = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
  };

  const goToToday = () => {
    const today = getHospitalToday();
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  };

  // Build calendar grid using local dates (not UTC)
  const buildCalendarGrid = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const calendarMap = new Map<string, CalendarDay>();
    calendarDays.forEach((d) => calendarMap.set(d.date, d));

    const grid: Array<{ day: number; date: string; isCurrentMonth: boolean; calendarDay?: CalendarDay }> = [];

    // Helper to format date as YYYY-MM-DD without timezone conversion
    const formatDate = (y: number, m: number, d: number) => {
      return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    };

    // Previous month days
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const date = formatDate(prevYear, prevMonth, day);
      grid.push({ day, date, isCurrentMonth: false });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = formatDate(year, month, day);
      grid.push({ day, date, isCurrentMonth: true, calendarDay: calendarMap.get(date) });
    }

    // Next month days
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const remaining = 42 - grid.length;
    for (let day = 1; day <= remaining; day++) {
      const date = formatDate(nextYear, nextMonth, day);
      grid.push({ day, date, isCurrentMonth: false });
    }

    return grid;
  };

  const calendarGrid = buildCalendarGrid();
  const today = formatDateString(getHospitalToday());
  const selectedDateStr = formatDateString(selectedDate);

  // Filter patients for search
  const filteredPatients = patients.filter((p) => {
    const searchLower = patientSearch.toLowerCase();
    return (
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchLower) ||
      p.email?.toLowerCase().includes(searchLower) ||
      p.phone?.includes(patientSearch)
    );
  });

  if (loading) {
    return null;
  }

  if (doctors.length === 0) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <svg className="w-12 h-12 mx-auto text-yellow-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-medium text-yellow-800 mb-2">No Doctors Available</h3>
          <p className="text-sm text-yellow-600">
            No doctors have an active Appointments license. Please assign licenses from the Licenses page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-fullheight flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-1 bg-white border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-gray-900">
            {isDoctor ? 'My Appointments' : 'Appointments'}
          </h1>
          {/* Doctor Selector - hidden for doctor role */}
          {isDoctor ? (
            <span className="text-xs text-gray-600">
              Dr. {selectedDoctor?.name || profile?.fullName}
              {selectedDoctor?.specialization ? ` (${selectedDoctor.specialization})` : ''}
            </span>
          ) : (
            <select
              value={selectedDoctor?.id || ''}
              onChange={(e) => {
                const doc = doctors.find((d) => d.id === e.target.value);
                setSelectedDoctor(doc || null);
              }}
              className="text-xs px-2 py-1 border border-gray-200 rounded bg-white min-w-[180px]"
            >
              {doctors.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  Dr. {doc.name} {doc.specialization ? `(${doc.specialization})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Stats and Generate Button */}
        <div className="flex items-center gap-2">
          {slotsData && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="px-1.5 py-0.5 bg-gray-100 rounded">
                <span className="font-medium">{slotsData.stats.total}</span>
                <span className="text-gray-500 ml-1">Total</span>
              </span>
              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
                <span className="font-medium">{slotsData.stats.booked}</span>
                <span className="ml-1">Booked</span>
              </span>
              <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded">
                <span className="font-medium">{slotsData.stats.available}</span>
                <span className="ml-1">Open</span>
              </span>
            </div>
          )}
          <button
            onClick={() => setShowGenerateModal(true)}
            className="btn-primary text-xs flex items-center gap-1 px-2 py-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Generate
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-3 p-3 min-h-0">
        {/* Left: Calendar */}
        <div className="w-[300px] flex-shrink-0 flex flex-col min-h-0">
          <div className="bg-white rounded border border-gray-100 p-2 flex flex-col min-h-0">
            {/* Calendar Header */}
            <div className="flex-shrink-0 flex items-center justify-between mb-2">
              <h2 className="font-medium text-xs text-gray-900">
                {MONTHS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
              </h2>
              <div className="flex items-center gap-1.5">
                <button onClick={prevMonth} className="p-0.5 hover:bg-gray-100 rounded">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button onClick={goToToday} className="text-xs text-[var(--color-primary)] hover:underline">
                  Today
                </button>
                <button onClick={nextMonth} className="p-0.5 hover:bg-gray-100 rounded">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="flex-shrink-0 grid grid-cols-7 gap-px bg-gray-200 rounded-t overflow-hidden text-center text-xs">
              {DAYS.map((day) => (
                <div key={day} className="bg-gray-50 py-1.5 text-gray-500 font-semibold text-[10px]">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-b overflow-hidden">
              {calendarGrid.map((cell, idx) => {
                const isSelected = cell.date === selectedDateStr;
                const isToday = cell.date === today;
                const hasSlots = cell.calendarDay?.hasSlots;
                const availableCount = cell.calendarDay?.availableCount || 0;
                const bookedCount = cell.calendarDay?.bookedCount || 0;

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      if (cell.isCurrentMonth) {
                        // Parse date string without timezone issues
                        const [y, m, d] = cell.date.split('-').map(Number);
                        setSelectedDate(new Date(y, m - 1, d));
                      }
                    }}
                    disabled={!cell.isCurrentMonth}
                    className={`
                      relative p-1 text-xs transition-colors bg-white
                      ${!cell.isCurrentMonth ? 'text-gray-300 bg-gray-50' : 'text-gray-700 hover:bg-blue-50'}
                      ${isSelected ? 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]' : ''}
                      ${isToday && !isSelected ? 'ring-2 ring-[var(--color-primary)] ring-inset font-bold' : ''}
                    `}
                  >
                    <span>{cell.day}</span>
                    {cell.isCurrentMonth && hasSlots && !isSelected && (
                      <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                        {availableCount > 0 && (
                          <span className="w-1 h-1 rounded-full bg-green-500" />
                        )}
                        {bookedCount > 0 && (
                          <span className="w-1 h-1 rounded-full bg-blue-500" />
                        )}
                      </div>
                    )}
                    {cell.isCurrentMonth && hasSlots && (
                      <div className="text-[9px] text-gray-400 leading-none">
                        {availableCount}/{availableCount + bookedCount}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex-shrink-0 flex items-center justify-center gap-3 mt-2 text-[10px] text-gray-500">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span>Available</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
                <span>Selected</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                <span>Off/No Slots</span>
              </div>
            </div>
          </div>

          {/* Doctor Schedule Reference */}
          {selectedDoctor && (
            <div className="mt-2 rounded border border-blue-100 p-2" style={{ background: 'var(--color-primary-light)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <svg className="w-3.5 h-3.5 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-[10px] font-semibold text-[var(--color-primary-dark)] uppercase tracking-wide">Doctor Info</span>
              </div>
              <div className="space-y-1.5 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Slot Duration</span>
                  <span className="font-semibold text-[var(--color-primary)]">{selectedDoctor.appointmentDurationMinutes} min</span>
                </div>

                {/* Weekly Available Days */}
                <div className="pt-1.5 mt-1 border-t border-blue-100">
                  <span className="text-gray-600 block mb-1">Weekly Schedule</span>
                  <div className="flex gap-0.5">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => {
                      const schedule = doctorDetails?.schedules.find(s => s.dayOfWeek === idx);
                      const isWorking = schedule?.isWorking;
                      return (
                        <span
                          key={idx}
                          className={`w-5 h-5 flex items-center justify-center rounded text-[9px] font-medium ${
                            isWorking
                              ? 'bg-[var(--color-primary)] text-white'
                              : 'bg-gray-200 text-gray-400'
                          }`}
                          title={isWorking ? `Working on ${DAYS[idx]}` : `Off on ${DAYS[idx]}`}
                        >
                          {day}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Day Offs List */}
                {doctorDetails?.timeOffs && doctorDetails.timeOffs.length > 0 && (
                  <div className="pt-1.5 mt-1 border-t border-blue-100">
                    <span className="text-gray-600 block mb-1">Upcoming Time Off</span>
                    <div className="space-y-1 max-h-[60px] overflow-y-auto">
                      {doctorDetails.timeOffs.slice(0, 3).map((timeOff) => (
                        <div key={timeOff.id} className="flex items-center gap-1 text-[9px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                          <span className="text-gray-700">
                            {new Date(timeOff.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {timeOff.startDate !== timeOff.endDate && (
                              <> - {new Date(timeOff.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                            )}
                          </span>
                          {timeOff.reason && (
                            <span className="text-gray-500 truncate">({timeOff.reason})</span>
                          )}
                        </div>
                      ))}
                      {doctorDetails.timeOffs.length > 3 && (
                        <span className="text-[9px] text-gray-500">+{doctorDetails.timeOffs.length - 3} more</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Slots for Selected Date */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 bg-gray-50 rounded-lg border border-gray-200 flex flex-col min-h-0 overflow-hidden">
            {/* Date Header */}
            <div className="flex-shrink-0 px-3 py-2 bg-white border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-medium text-xs text-gray-900">
                {slotsData?.formattedDate || selectedDate.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </h2>
              {slotsData && slotsData.stats.total > 0 && (
                <span className="text-xs text-gray-500">
                  {slotsData.stats.available} open · {slotsData.stats.booked} booked
                </span>
              )}
            </div>

            {slotsLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !slotsData || slotsData.stats.total === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <svg className="w-10 h-10 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm">No slots for this date</p>
                  <p className="text-xs mt-1">Generate slots using the button above</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 grid grid-cols-3 gap-3 p-3 min-h-0">
                {/* Morning */}
                <div className="flex flex-col min-h-0 bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                  <div className="flex-shrink-0 px-2 py-1.5 bg-amber-50 border-b border-amber-100 flex items-center gap-1.5">
                    <span className="text-sm">☀️</span>
                    <div>
                      <span className="font-medium text-xs text-amber-800">Morning</span>
                      <span className="text-[10px] text-amber-600 ml-1.5">
                        {slotsData.morning.filter((s) => s.status === 'AVAILABLE').length} open
                        {' · '}
                        {slotsData.morning.filter((s) => s.status === 'BOOKED').length} booked
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 p-1.5 overflow-y-auto">
                    {slotsData.morning.map((slot) => (
                      <SlotCard
                        key={slot.id}
                        slot={slot}
                        onBook={() => {
                          setSelectedSlot(slot);
                          setShowBookingModal(true);
                        }}
                        onCancel={() => slot.appointmentId && handleCancelAppointment(slot.appointmentId)}
                        onBlock={() => handleBlockSlot(slot.id)}
                        onUnblock={() => handleUnblockSlot(slot.id)}
                      />
                    ))}
                    {slotsData.morning.length === 0 && (
                      <p className="text-center text-xs text-gray-400 py-4">No slots</p>
                    )}
                  </div>
                </div>

                {/* Evening */}
                <div className="flex flex-col min-h-0 bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                  <div className="flex-shrink-0 px-2 py-1.5 bg-orange-50 border-b border-orange-100 flex items-center gap-1.5">
                    <span className="text-sm">🌅</span>
                    <div>
                      <span className="font-medium text-xs text-orange-800">Evening</span>
                      <span className="text-[10px] text-orange-600 ml-1.5">
                        {slotsData.evening.filter((s) => s.status === 'AVAILABLE').length} open
                        {' · '}
                        {slotsData.evening.filter((s) => s.status === 'BOOKED').length} booked
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 p-1.5 overflow-y-auto">
                    {slotsData.evening.map((slot) => (
                      <SlotCard
                        key={slot.id}
                        slot={slot}
                        onBook={() => {
                          setSelectedSlot(slot);
                          setShowBookingModal(true);
                        }}
                        onCancel={() => slot.appointmentId && handleCancelAppointment(slot.appointmentId)}
                        onBlock={() => handleBlockSlot(slot.id)}
                        onUnblock={() => handleUnblockSlot(slot.id)}
                      />
                    ))}
                    {slotsData.evening.length === 0 && (
                      <p className="text-center text-xs text-gray-400 py-4">No slots</p>
                    )}
                  </div>
                </div>

                {/* Night */}
                <div className="flex flex-col min-h-0 bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                  <div className="flex-shrink-0 px-2 py-1.5 bg-indigo-50 border-b border-indigo-100 flex items-center gap-1.5">
                    <span className="text-sm">🌙</span>
                    <div>
                      <span className="font-medium text-xs text-indigo-800">Night</span>
                      <span className="text-[10px] text-indigo-600 ml-1.5">
                        {slotsData.night.filter((s) => s.status === 'AVAILABLE').length} open
                        {' · '}
                        {slotsData.night.filter((s) => s.status === 'BOOKED').length} booked
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 p-1.5 overflow-y-auto">
                    {slotsData.night.map((slot) => (
                      <SlotCard
                        key={slot.id}
                        slot={slot}
                        onBook={() => {
                          setSelectedSlot(slot);
                          setShowBookingModal(true);
                        }}
                        onCancel={() => slot.appointmentId && handleCancelAppointment(slot.appointmentId)}
                        onBlock={() => handleBlockSlot(slot.id)}
                        onUnblock={() => handleUnblockSlot(slot.id)}
                      />
                    ))}
                    {slotsData.night.length === 0 && (
                      <p className="text-center text-xs text-gray-400 py-4">No slots</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Generate Slots Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Generate Appointment Slots</h3>
              <button onClick={() => setShowGenerateModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Doctor</label>
                <input
                  type="text"
                  value={selectedDoctor ? `Dr. ${selectedDoctor.name}` : ''}
                  disabled
                  className="form-input bg-gray-50 text-gray-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Slot duration: {selectedDoctor?.appointmentDurationMinutes || 30} minutes
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={generateStartDate}
                    onChange={(e) => setGenerateStartDate(e.target.value)}
                    min={formatDateString(getHospitalToday())}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={generateEndDate}
                    onChange={(e) => setGenerateEndDate(e.target.value)}
                    min={generateStartDate || formatDateString(getHospitalToday())}
                    className="form-input"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Slots will be generated based on the doctor&apos;s weekly schedule and will skip any time-off periods.
              </p>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateSlots}
                disabled={generating || !generateStartDate || !generateEndDate}
                className="btn-primary text-sm"
              >
                {generating ? 'Generating...' : 'Generate Slots'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {showBookingModal && selectedSlot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Book Appointment</h3>
              <button
                onClick={() => {
                  setShowBookingModal(false);
                  setSelectedSlot(null);
                  setSelectedPatient(null);
                  setPatientSearch('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Slot Info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)] text-white flex items-center justify-center text-sm font-medium">
                    {formatTime12h(selectedSlot.startTime)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Dr. {selectedSlot.doctorName}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(selectedSlot.slotDate).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                      {' · '}
                      {formatTime12h(selectedSlot.startTime)} - {formatTime12h(selectedSlot.endTime)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Patient Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Patient</label>
                <input
                  type="text"
                  placeholder="Search by name, email, or phone..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="form-input"
                />
                {patientSearch && !selectedPatient && (
                  <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                    {filteredPatients.length === 0 ? (
                      <p className="p-3 text-sm text-gray-500">No patients found</p>
                    ) : (
                      filteredPatients.slice(0, 10).map((patient) => (
                        <button
                          key={patient.id}
                          onClick={() => {
                            setSelectedPatient(patient);
                            setPatientSearch(`${patient.firstName} ${patient.lastName}`);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                        >
                          <p className="font-medium text-sm text-gray-900">
                            {patient.firstName} {patient.lastName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {patient.email || patient.phone || 'No contact info'}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {selectedPatient && (
                  <div className="mt-2 flex items-center justify-between bg-green-50 rounded-lg p-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-sm font-medium">
                        {selectedPatient.firstName.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-green-800">
                          {selectedPatient.firstName} {selectedPatient.lastName}
                        </p>
                        <p className="text-xs text-green-600">{selectedPatient.phone || selectedPatient.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedPatient(null);
                        setPatientSearch('');
                      }}
                      className="text-green-600 hover:text-green-800"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Reason for Visit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Visit (optional)</label>
                <input
                  type="text"
                  value={reasonForVisit}
                  onChange={(e) => setReasonForVisit(e.target.value)}
                  placeholder="e.g., Follow-up, Consultation"
                  className="form-input"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  placeholder="Any additional notes..."
                  rows={2}
                  className="form-input"
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowBookingModal(false);
                  setSelectedSlot(null);
                  setSelectedPatient(null);
                  setPatientSearch('');
                }}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleBookAppointment}
                disabled={booking || !selectedPatient}
                className="btn-primary text-sm"
              >
                {booking ? 'Booking...' : 'Book Appointment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Slot Card Component
function SlotCard({
  slot,
  onBook,
  onCancel,
  onBlock,
  onUnblock,
}: {
  slot: Slot;
  onBook: () => void;
  onCancel: () => void;
  onBlock: () => void;
  onUnblock: () => void;
}) {
  const isAvailable = slot.status === 'AVAILABLE';
  const isBooked = slot.status === 'BOOKED';
  const isBlocked = slot.status === 'BLOCKED';

  return (
    <div
      className={`
        px-2 py-1.5 rounded mb-1 flex items-center justify-between text-xs
        ${isAvailable ? 'bg-white border border-gray-200 hover:border-[var(--color-primary)] cursor-pointer' : ''}
        ${isBooked ? 'bg-blue-50 border border-blue-200' : ''}
        ${isBlocked ? 'bg-gray-100 border border-gray-200' : ''}
      `}
      onClick={() => isAvailable && onBook()}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-gray-700">{formatTime12h(slot.startTime)}</span>
        {isAvailable && (
          <>
            <span className="w-1 h-1 rounded-full bg-green-500" />
            <span className="text-gray-500">Available</span>
          </>
        )}
        {isBooked && (
          <>
            <span className="w-1 h-1 rounded-full bg-blue-500" />
            <span className="text-blue-700 font-medium truncate max-w-[80px]">{slot.patientName}</span>
          </>
        )}
        {isBlocked && (
          <>
            <span className="w-1 h-1 rounded-full bg-gray-400" />
            <span className="text-gray-500">Blocked</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        {isAvailable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBlock();
            }}
            className="p-0.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
            title="Block this slot"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </button>
        )}
        {isBooked && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="text-[10px] text-red-600 hover:text-red-800"
          >
            Cancel
          </button>
        )}
        {isBlocked && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUnblock();
            }}
            className="text-[10px] text-green-600 hover:text-green-800"
          >
            Unblock
          </button>
        )}
      </div>
    </div>
  );
}
