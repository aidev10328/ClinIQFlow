'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import PhoneInput from '../../../components/PhoneInput';
import { useHospitalTimezone } from '../../../hooks/useHospitalTimezone';

const DoctorAppointments = dynamic(
  () => import('../../../components/hospital/DoctorAppointments').then((m) => m.DoctorAppointments),
  { loading: () => null }
);

type TabType = 'schedule' | 'scheduler' | 'calendar' | 'queue' | 'patients';

interface Doctor {
  id: string;
  userId: string;
  name: string;
  specialization?: string;
  appointmentDurationMinutes: number;
}

interface DoctorSchedule {
  dayOfWeek: number;
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
  dateOfBirth?: string;
  gender?: string;
}

interface Appointment {
  id: string;
  slotId: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  doctorProfileId: string;
  doctorName: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  status: 'SCHEDULED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  reasonForVisit?: string;
  notes?: string;
  checkedInAt?: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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

  const userRole = profile?.isSuperAdmin ? 'SUPER_ADMIN' : (currentHospital?.role || 'STAFF');
  const isDoctor = userRole === 'DOCTOR';
  const isManager = userRole === 'SUPER_ADMIN' || userRole === 'HOSPITAL_MANAGER';

  // Show doctor-specific view for doctors
  if (isDoctor) {
    return <DoctorAppointments />;
  }

  const [activeTab, setActiveTab] = useState<TabType>('schedule');

  const getHospitalToday = useCallback(() => {
    return getCurrentTime();
  }, [getCurrentTime]);

  const formatDateString = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Shared state
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  // Scheduler tab state
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => getHospitalToday());
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const today = getHospitalToday();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [slotsData, setSlotsData] = useState<SlotsForDate | null>(null);
  const [doctorDetails, setDoctorDetails] = useState<DoctorDetails | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Modal states
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Generate modal state
  const [generateStartDate, setGenerateStartDate] = useState('');
  const [generateEndDate, setGenerateEndDate] = useState('');
  const [generating, setGenerating] = useState(false);

  // Booking modal state
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [reasonForVisit, setReasonForVisit] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [booking, setBooking] = useState(false);

  // Add patient form state
  const [newPatientForm, setNewPatientForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
  });
  const [addingPatient, setAddingPatient] = useState(false);

  // Schedule management state
  const [scheduleDoctor, setScheduleDoctor] = useState<Doctor | null>(null);
  const [scheduleEditMode, setScheduleEditMode] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<DoctorSchedule[]>([]);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [timeOffForm, setTimeOffForm] = useState({ startDate: '', endDate: '', reason: '' });
  const [addingTimeOff, setAddingTimeOff] = useState(false);

  // Hospital holidays
  const [hospitalHolidays, setHospitalHolidays] = useState<{ month: number; day: number; name: string }[]>([]);
  useEffect(() => {
    if (!currentHospital?.id) return;
    apiFetch(`/v1/hospitals/${currentHospital.id}`).then(async res => {
      if (res.ok) {
        const data = await res.json();
        setHospitalHolidays(data.hospitalHolidays || []);
      }
    }).catch(() => {});
  }, [currentHospital?.id]);

  // Fetch doctors with APPOINTMENTS license
  const fetchDoctors = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/appointments/doctors/licensed');
      if (res.ok) {
        const data = await res.json();
        setDoctors(data);
        if (data.length > 0 && !selectedDoctor) {
          setSelectedDoctor(data[0]);
          setScheduleDoctor(data[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch doctors:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDoctor]);

  // Fetch patients
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

  // Fetch calendar overview
  const fetchCalendar = useCallback(async () => {
    if (!selectedDoctor) return;
    try {
      const year = calendarMonth.getFullYear();
      const month = calendarMonth.getMonth() + 1;
      const res = await apiFetch(`/v1/appointments/calendar/${year}/${month}?doctorProfileId=${selectedDoctor.id}`);
      if (res.ok) {
        setCalendarDays(await res.json());
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
        setSlotsData(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch slots:', error);
    } finally {
      setSlotsLoading(false);
    }
  }, [selectedDoctor, selectedDate, formatDateString]);

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
      setScheduleForm(schedules.length > 0 ? schedules : DAYS.map((_, idx) => ({
        dayOfWeek: idx,
        isWorking: idx !== 0 && idx !== 6,
        morningShift: true,
        eveningShift: true,
        nightShift: false,
      })));
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
  }, [selectedDoctor, calendarMonth, selectedDate]);

  useEffect(() => {
    if (scheduleDoctor) {
      fetchDoctorDetails(scheduleDoctor.id);
    }
  }, [scheduleDoctor]);

  // Handler: Generate slots
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

  // Handler: Book appointment
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

  // Handler: Add patient inline
  const handleAddPatient = async () => {
    if (!newPatientForm.firstName || !newPatientForm.lastName) return;
    setAddingPatient(true);
    try {
      const res = await apiFetch('/v1/patients', {
        method: 'POST',
        body: JSON.stringify(newPatientForm),
      });
      if (res.ok) {
        const newPatient = await res.json();
        setPatients(prev => [...prev, newPatient]);
        setSelectedPatient(newPatient);
        setPatientSearch(`${newPatient.firstName} ${newPatient.lastName}`);
        setShowAddPatientModal(false);
        setNewPatientForm({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '' });
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to add patient');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to add patient');
    } finally {
      setAddingPatient(false);
    }
  };

  // Handler: Cancel appointment
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

  // Handler: Block/Unblock slot
  const handleBlockSlot = async (slotId: string) => {
    try {
      const res = await apiFetch(`/v1/appointments/slots/${slotId}/block`, { method: 'PATCH' });
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

  const handleUnblockSlot = async (slotId: string) => {
    try {
      const res = await apiFetch(`/v1/appointments/slots/${slotId}/unblock`, { method: 'PATCH' });
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

  // Handler: Save schedule
  const handleSaveSchedule = async () => {
    if (!scheduleDoctor) return;
    setSavingSchedule(true);
    try {
      const res = await apiFetch(`/v1/doctors/${scheduleDoctor.id}/schedules`, {
        method: 'PUT',
        body: JSON.stringify({ schedules: scheduleForm }),
      });
      if (res.ok) {
        setScheduleEditMode(false);
        fetchDoctorDetails(scheduleDoctor.id);
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to save schedule');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to save schedule');
    } finally {
      setSavingSchedule(false);
    }
  };

  // Handler: Add time off
  const handleAddTimeOff = async () => {
    if (!scheduleDoctor || !timeOffForm.startDate || !timeOffForm.endDate) return;
    setAddingTimeOff(true);
    try {
      const res = await apiFetch(`/v1/doctors/${scheduleDoctor.id}/time-off`, {
        method: 'POST',
        body: JSON.stringify(timeOffForm),
      });
      if (res.ok) {
        setTimeOffForm({ startDate: '', endDate: '', reason: '' });
        fetchDoctorDetails(scheduleDoctor.id);
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to add time off');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to add time off');
    } finally {
      setAddingTimeOff(false);
    }
  };

  // Handler: Delete time off
  const handleDeleteTimeOff = async (timeOffId: string) => {
    if (!scheduleDoctor || !confirm('Remove this time off?')) return;
    try {
      const res = await apiFetch(`/v1/doctors/${scheduleDoctor.id}/time-off/${timeOffId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchDoctorDetails(scheduleDoctor.id);
      }
    } catch (error) {
      console.error('Failed to delete time off:', error);
    }
  };

  // Calendar navigation
  const prevMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
  const nextMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
  const goToToday = () => {
    const today = getHospitalToday();
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  };

  // Build calendar grid
  const holidaySet = useMemo(() => {
    const map = new Map<string, string>();
    hospitalHolidays.forEach(h => {
      const key = `${h.month}-${h.day}`;
      map.set(key, h.name);
    });
    return map;
  }, [hospitalHolidays]);

  const buildCalendarGrid = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const calendarMap = new Map<string, CalendarDay>();
    calendarDays.forEach((d) => calendarMap.set(d.date, d));

    const grid: Array<{ day: number; date: string; isCurrentMonth: boolean; calendarDay?: CalendarDay; isHoliday?: boolean; holidayName?: string }> = [];
    const formatDate = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    const prevM = month === 0 ? 11 : month - 1;
    const prevY = month === 0 ? year - 1 : year;
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      grid.push({ day, date: formatDate(prevY, prevM, day), isCurrentMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = formatDate(year, month, day);
      const hKey = `${month + 1}-${day}`;
      const hName = holidaySet.get(hKey);
      grid.push({ day, date, isCurrentMonth: true, calendarDay: calendarMap.get(date), isHoliday: !!hName, holidayName: hName });
    }
    const nextM = month === 11 ? 0 : month + 1;
    const nextY = month === 11 ? year + 1 : year;
    const remaining = 42 - grid.length;
    for (let day = 1; day <= remaining; day++) {
      grid.push({ day, date: formatDate(nextY, nextM, day), isCurrentMonth: false });
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
            No doctors have an active Appointments license. Please assign licenses from Administration.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Tabs - Full Width */}
      <div className="flex border-b border-slate-200 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {[
          { id: 'schedule' as TabType, label: 'Doctor Schedule' },
          { id: 'scheduler' as TabType, label: 'Appointments' },
          { id: 'calendar' as TabType, label: 'Hospital Calendar' },
          { id: 'queue' as TabType, label: 'Daily Queue' },
          { id: 'patients' as TabType, label: 'Patients' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-fit py-2 px-2 sm:px-0 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'schedule' && (
        <DoctorScheduleTab
          doctors={doctors}
          scheduleDoctor={scheduleDoctor}
          setScheduleDoctor={setScheduleDoctor}
          doctorDetails={doctorDetails}
          scheduleForm={scheduleForm}
          setScheduleForm={setScheduleForm}
          scheduleEditMode={scheduleEditMode}
          setScheduleEditMode={setScheduleEditMode}
          savingSchedule={savingSchedule}
          handleSaveSchedule={handleSaveSchedule}
          timeOffForm={timeOffForm}
          setTimeOffForm={setTimeOffForm}
          addingTimeOff={addingTimeOff}
          handleAddTimeOff={handleAddTimeOff}
          handleDeleteTimeOff={handleDeleteTimeOff}
          showGenerateModal={showGenerateModal}
          setShowGenerateModal={setShowGenerateModal}
          generateStartDate={generateStartDate}
          setGenerateStartDate={setGenerateStartDate}
          generateEndDate={generateEndDate}
          setGenerateEndDate={setGenerateEndDate}
          generating={generating}
          handleGenerateSlots={handleGenerateSlots}
          formatDateString={formatDateString}
          getHospitalToday={getHospitalToday}
        />
      )}

      {activeTab === 'scheduler' && (
        <SchedulerTab
          doctors={doctors}
          selectedDoctor={selectedDoctor}
          setSelectedDoctor={setSelectedDoctor}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          calendarMonth={calendarMonth}
          prevMonth={prevMonth}
          nextMonth={nextMonth}
          goToToday={goToToday}
          calendarGrid={calendarGrid}
          today={today}
          selectedDateStr={selectedDateStr}
          slotsData={slotsData}
          slotsLoading={slotsLoading}
          doctorDetails={doctorDetails}
          onBookSlot={(slot: Slot) => {
            setSelectedSlot(slot);
            setShowBookingModal(true);
          }}
          onCancelAppointment={handleCancelAppointment}
          onBlockSlot={handleBlockSlot}
          onUnblockSlot={handleUnblockSlot}
          setShowGenerateModal={setShowGenerateModal}
        />
      )}

      {activeTab === 'calendar' && (
        <HospitalCalendarTab
          doctors={doctors}
          formatDateString={formatDateString}
          getHospitalToday={getHospitalToday}
        />
      )}

      {activeTab === 'queue' && (
        <QueueTab
          doctors={doctors}
          patients={patients}
          formatDateString={formatDateString}
          getHospitalToday={getHospitalToday}
          onAddPatient={() => setShowAddPatientModal(true)}
        />
      )}

      {activeTab === 'patients' && (
        <PatientsTab
          patients={patients}
          setPatients={setPatients}
          onAddPatient={() => setShowAddPatientModal(true)}
        />
      )}

      {/* Generate Slots Modal */}
      {showGenerateModal && (
        <GenerateSlotsModal
          selectedDoctor={selectedDoctor || scheduleDoctor}
          generateStartDate={generateStartDate}
          setGenerateStartDate={setGenerateStartDate}
          generateEndDate={generateEndDate}
          setGenerateEndDate={setGenerateEndDate}
          generating={generating}
          handleGenerateSlots={handleGenerateSlots}
          onClose={() => setShowGenerateModal(false)}
          formatDateString={formatDateString}
          getHospitalToday={getHospitalToday}
        />
      )}

      {/* Booking Modal */}
      {showBookingModal && selectedSlot && (
        <BookingModal
          selectedSlot={selectedSlot}
          patientSearch={patientSearch}
          setPatientSearch={setPatientSearch}
          filteredPatients={filteredPatients}
          selectedPatient={selectedPatient}
          setSelectedPatient={setSelectedPatient}
          reasonForVisit={reasonForVisit}
          setReasonForVisit={setReasonForVisit}
          bookingNotes={bookingNotes}
          setBookingNotes={setBookingNotes}
          booking={booking}
          handleBookAppointment={handleBookAppointment}
          onClose={() => {
            setShowBookingModal(false);
            setSelectedSlot(null);
            setSelectedPatient(null);
            setPatientSearch('');
          }}
          onAddPatient={() => setShowAddPatientModal(true)}
        />
      )}

      {/* Add Patient Modal */}
      {showAddPatientModal && (
        <AddPatientModal
          form={newPatientForm}
          setForm={setNewPatientForm}
          adding={addingPatient}
          onAdd={handleAddPatient}
          onClose={() => setShowAddPatientModal(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// DOCTOR SCHEDULE TAB
// ============================================================================
function DoctorScheduleTab({
  doctors,
  scheduleDoctor,
  setScheduleDoctor,
  doctorDetails,
  scheduleForm,
  setScheduleForm,
  scheduleEditMode,
  setScheduleEditMode,
  savingSchedule,
  handleSaveSchedule,
  timeOffForm,
  setTimeOffForm,
  addingTimeOff,
  handleAddTimeOff,
  handleDeleteTimeOff,
  setShowGenerateModal,
  formatDateString,
  getHospitalToday,
}: any) {
  const [doctorCheckInStatus, setDoctorCheckInStatus] = useState<string>('NOT_CHECKED_IN');
  const [slotsEndDate, setSlotsEndDate] = useState<string | null>(null);

  // Fetch doctor check-in status and slots info
  useEffect(() => {
    if (!scheduleDoctor) return;
    const fetchDoctorStatus = async () => {
      try {
        const today = formatDateString(getHospitalToday());
        const res = await apiFetch(`/v1/queue/daily?doctorProfileId=${scheduleDoctor.id}&date=${today}`);
        if (res.ok) {
          const data = await res.json();
          setDoctorCheckInStatus(data.doctorCheckin?.status || 'NOT_CHECKED_IN');
        }
        // Fetch latest slot date
        const slotsRes = await apiFetch(`/v1/appointments/slots/latest?doctorProfileId=${scheduleDoctor.id}`);
        if (slotsRes.ok) {
          const slotsData = await slotsRes.json();
          setSlotsEndDate(slotsData.latestSlotDate || null);
        }
      } catch (e) { /* ignore */ }
    };
    fetchDoctorStatus();
  }, [scheduleDoctor, formatDateString, getHospitalToday]);

  const workingDays = scheduleForm.filter((s: DoctorSchedule) => s.isWorking).length;

  return (
    <div className="space-y-3">
      {/* Doctor Selector Card */}
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <select
              value={scheduleDoctor?.id || ''}
              onChange={(e) => {
                const doc = doctors.find((d: Doctor) => d.id === e.target.value);
                setScheduleDoctor(doc || null);
                setScheduleEditMode(false);
              }}
              className="text-xs px-3 py-2 sm:py-1.5 border border-slate-200 rounded-lg bg-white w-full sm:w-auto sm:min-w-[220px] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            >
              {doctors.map((doc: Doctor) => (
                <option key={doc.id} value={doc.id}>
                  Dr. {doc.name} {doc.specialization ? `- ${doc.specialization}` : ''}
                </option>
              ))}
            </select>
            {/* Status indicators */}
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${
                doctorCheckInStatus === 'CHECKED_IN' ? 'bg-emerald-50 text-emerald-700' :
                doctorCheckInStatus === 'ON_BREAK' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  doctorCheckInStatus === 'CHECKED_IN' ? 'bg-emerald-500' :
                  doctorCheckInStatus === 'ON_BREAK' ? 'bg-amber-500' : 'bg-slate-400'
                }`} />
                {doctorCheckInStatus === 'CHECKED_IN' ? 'Online' : doctorCheckInStatus === 'ON_BREAK' ? 'On Break' : 'Offline'}
              </div>
              <div className="text-[10px] text-slate-500">
                <span className="font-medium text-slate-700">{scheduleDoctor?.appointmentDurationMinutes || 30}</span> min/slot
              </div>
              {slotsEndDate && (
                <div className="text-[10px] text-slate-500">
                  Slots till <span className="font-medium text-slate-700">{new Date(slotsEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowGenerateModal(true)}
            className="px-3 py-1.5 text-[10px] font-medium text-[var(--color-primary)] border border-[var(--color-primary)] rounded-lg hover:bg-[var(--color-primary)] hover:text-white transition-colors"
          >
            Generate Slots
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Weekly Schedule */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-slate-800">Weekly Schedule</h3>
              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] rounded">{workingDays} days/week</span>
            </div>
            {!scheduleEditMode ? (
              <button onClick={() => setScheduleEditMode(true)} className="text-[10px] text-[var(--color-primary)] hover:underline">Edit</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setScheduleEditMode(false)} className="text-[10px] text-slate-500 hover:text-slate-700">Cancel</button>
                <button onClick={handleSaveSchedule} disabled={savingSchedule} className="text-[10px] text-[var(--color-primary)] font-medium hover:underline disabled:opacity-50">
                  {savingSchedule ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
          <div className="p-3 overflow-x-auto">
            <table className="w-full text-[11px] min-w-[400px]">
              <thead>
                <tr className="text-left text-slate-400 text-[10px] uppercase tracking-wide">
                  <th className="pb-2 font-medium">Day</th>
                  <th className="pb-2 font-medium text-center">Status</th>
                  <th className="pb-2 font-medium text-center">Morning<br/><span className="text-[8px] normal-case">(6am-12pm)</span></th>
                  <th className="pb-2 font-medium text-center">Evening<br/><span className="text-[8px] normal-case">(12pm-6pm)</span></th>
                  <th className="pb-2 font-medium text-center">Night<br/><span className="text-[8px] normal-case">(6pm-10pm)</span></th>
                </tr>
              </thead>
              <tbody>
                {DAYS_FULL.map((dayName, idx) => {
                  const schedule = scheduleForm.find((s: DoctorSchedule) => s.dayOfWeek === idx) || {
                    dayOfWeek: idx, isWorking: false, morningShift: false, eveningShift: false, nightShift: false,
                  };
                  const shifts = [schedule.morningShift, schedule.eveningShift, schedule.nightShift].filter(Boolean).length;
                  return (
                    <tr key={idx} className={`border-t border-slate-50 ${!schedule.isWorking ? 'opacity-50' : ''}`}>
                      <td className="py-2 text-slate-700 font-medium">{dayName}</td>
                      <td className="py-2 text-center">
                        {scheduleEditMode ? (
                          <input type="checkbox" checked={schedule.isWorking} onChange={(e) => {
                            const updated = scheduleForm.map((s: DoctorSchedule) => s.dayOfWeek === idx ? { ...s, isWorking: e.target.checked } : s);
                            setScheduleForm(updated);
                          }} className="w-4 h-4 sm:w-3.5 sm:h-3.5 rounded border-slate-300 text-[var(--color-primary)]" />
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${schedule.isWorking ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                            {schedule.isWorking ? `Working (${shifts})` : 'Off'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {scheduleEditMode ? (
                          <input type="checkbox" checked={schedule.morningShift} disabled={!schedule.isWorking} onChange={(e) => {
                            const updated = scheduleForm.map((s: DoctorSchedule) => s.dayOfWeek === idx ? { ...s, morningShift: e.target.checked } : s);
                            setScheduleForm(updated);
                          }} className="w-4 h-4 sm:w-3.5 sm:h-3.5 rounded border-slate-300 text-[var(--color-primary)] disabled:opacity-30" />
                        ) : (
                          <span className={schedule.morningShift && schedule.isWorking ? 'text-amber-600 font-medium' : 'text-slate-300'}>
                            {schedule.morningShift && schedule.isWorking ? '6a-12p' : '—'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {scheduleEditMode ? (
                          <input type="checkbox" checked={schedule.eveningShift} disabled={!schedule.isWorking} onChange={(e) => {
                            const updated = scheduleForm.map((s: DoctorSchedule) => s.dayOfWeek === idx ? { ...s, eveningShift: e.target.checked } : s);
                            setScheduleForm(updated);
                          }} className="w-4 h-4 sm:w-3.5 sm:h-3.5 rounded border-slate-300 text-[var(--color-primary)] disabled:opacity-30" />
                        ) : (
                          <span className={schedule.eveningShift && schedule.isWorking ? 'text-orange-600 font-medium' : 'text-slate-300'}>
                            {schedule.eveningShift && schedule.isWorking ? '12p-6p' : '—'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {scheduleEditMode ? (
                          <input type="checkbox" checked={schedule.nightShift} disabled={!schedule.isWorking} onChange={(e) => {
                            const updated = scheduleForm.map((s: DoctorSchedule) => s.dayOfWeek === idx ? { ...s, nightShift: e.target.checked } : s);
                            setScheduleForm(updated);
                          }} className="w-4 h-4 sm:w-3.5 sm:h-3.5 rounded border-slate-300 text-[var(--color-primary)] disabled:opacity-30" />
                        ) : (
                          <span className={schedule.nightShift && schedule.isWorking ? 'text-indigo-600 font-medium' : 'text-slate-300'}>
                            {schedule.nightShift && schedule.isWorking ? '6p-10p' : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Time Off */}
        <div className="bg-white rounded-lg border border-slate-200">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-800">Time Off</h3>
            <span className="text-[9px] text-slate-400">{doctorDetails?.timeOffs?.length || 0} scheduled</span>
          </div>
          <div className="p-3 space-y-3">
            {/* Add Time Off Form */}
            <div className="p-2 bg-slate-50 rounded-lg space-y-2">
              <p className="text-[10px] font-medium text-slate-600">Add New</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="date" value={timeOffForm.startDate} onChange={(e) => setTimeOffForm({ ...timeOffForm, startDate: e.target.value })} min={formatDateString(getHospitalToday())} className="w-full text-[10px] px-2 py-1.5 border border-slate-200 rounded bg-white" />
                <input type="date" value={timeOffForm.endDate} onChange={(e) => setTimeOffForm({ ...timeOffForm, endDate: e.target.value })} min={timeOffForm.startDate || formatDateString(getHospitalToday())} className="w-full text-[10px] px-2 py-1.5 border border-slate-200 rounded bg-white" />
              </div>
              <input type="text" value={timeOffForm.reason} onChange={(e) => setTimeOffForm({ ...timeOffForm, reason: e.target.value })} placeholder="Reason (optional)" className="w-full text-[10px] px-2 py-1.5 border border-slate-200 rounded" />
              <button onClick={handleAddTimeOff} disabled={addingTimeOff || !timeOffForm.startDate || !timeOffForm.endDate} className="w-full px-2 py-1.5 text-[10px] font-medium text-[var(--color-primary)] border border-[var(--color-primary)] rounded hover:bg-[var(--color-primary)] hover:text-white transition-colors disabled:opacity-50">
                {addingTimeOff ? 'Adding...' : 'Add Time Off'}
              </button>
            </div>

            {/* Time Off List */}
            <div>
              <p className="text-[10px] font-medium text-slate-500 mb-2">Scheduled Time Off</p>
              {doctorDetails?.timeOffs && doctorDetails.timeOffs.length > 0 ? (
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {doctorDetails.timeOffs.map((timeOff: DoctorTimeOff) => {
                    const start = new Date(timeOff.startDate);
                    const end = new Date(timeOff.endDate);
                    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    const isPast = end < new Date();
                    return (
                      <div key={timeOff.id} className={`flex items-center justify-between p-2 rounded border ${isPast ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-amber-50 border-amber-100'}`}>
                        <div>
                          <p className="text-[10px] font-medium text-slate-700">
                            {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {timeOff.startDate !== timeOff.endDate && <> - {end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>}
                          </p>
                          <p className="text-[9px] text-slate-400">{days} day{days > 1 ? 's' : ''}{timeOff.reason && ` · ${timeOff.reason}`}</p>
                        </div>
                        {!isPast && (
                          <button onClick={() => handleDeleteTimeOff(timeOff.id)} className="p-1 text-slate-400 hover:text-red-500">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-slate-400 text-center py-4">No time off scheduled</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SCHEDULER TAB
// ============================================================================
function SchedulerTab({
  doctors,
  selectedDoctor,
  setSelectedDoctor,
  selectedDate,
  setSelectedDate,
  calendarMonth,
  prevMonth,
  nextMonth,
  goToToday,
  calendarGrid,
  today,
  selectedDateStr,
  slotsData,
  slotsLoading,
  doctorDetails,
  onBookSlot,
  onCancelAppointment,
  onBlockSlot,
  onUnblockSlot,
  setShowGenerateModal,
}: any) {
  return (
    <div className="flex flex-col lg:flex-row gap-3" style={{ height: 'calc(100vh - 220px)' }}>
      {/* Left: Calendar */}
      <div className="w-full lg:w-[280px] flex-shrink-0 flex flex-col">
        <div className="bg-white rounded-lg border border-slate-200 p-2 flex flex-col">
          {/* Doctor Selector */}
          <div className="mb-2 pb-2 border-b border-slate-100">
            <select
              value={selectedDoctor?.id || ''}
              onChange={(e) => {
                const doc = doctors.find((d: Doctor) => d.id === e.target.value);
                setSelectedDoctor(doc || null);
              }}
              className="w-full text-xs px-2 py-1 border border-slate-200 rounded bg-white"
            >
              {doctors.map((doc: Doctor) => (
                <option key={doc.id} value={doc.id}>
                  Dr. {doc.name} {doc.specialization ? `(${doc.specialization})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium text-xs text-slate-900">
              {MONTHS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
            </h2>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="p-0.5 hover:bg-slate-100 rounded">
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button onClick={goToToday} className="text-[10px] text-[var(--color-primary)] hover:underline px-1">Today</button>
              <button onClick={nextMonth} className="p-0.5 hover:bg-slate-100 rounded">
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-t overflow-hidden text-center">
            {DAYS.map((day) => (
              <div key={day} className="bg-slate-50 py-1 text-slate-500 font-medium text-[9px]">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-b overflow-hidden">
            {calendarGrid.map((cell: any, idx: number) => {
              const isSelected = cell.date === selectedDateStr;
              const isToday = cell.date === today;
              const availableCount = cell.calendarDay?.availableCount || 0;
              const bookedCount = cell.calendarDay?.bookedCount || 0;
              const isHoliday = cell.isHoliday;

              return (
                <button
                  key={idx}
                  onClick={() => {
                    if (cell.isCurrentMonth) {
                      const [y, m, d] = cell.date.split('-').map(Number);
                      setSelectedDate(new Date(y, m - 1, d));
                    }
                  }}
                  disabled={!cell.isCurrentMonth}
                  title={isHoliday ? cell.holidayName : undefined}
                  className={`
                    relative p-1 text-[10px] transition-colors bg-white
                    ${!cell.isCurrentMonth ? 'text-slate-300 bg-slate-50' : isHoliday && !isSelected ? 'bg-red-50 text-red-700 font-bold hover:bg-red-100' : 'text-slate-700 hover:bg-slate-50'}
                    ${isSelected ? 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]' : ''}
                    ${isToday && !isSelected ? 'ring-1 ring-[var(--color-primary)] ring-inset font-bold' : ''}
                  `}
                >
                  <span>{cell.day}</span>
                  {isHoliday && !isSelected && (
                    <div className="text-[7px] text-red-500 leading-none mt-0.5 truncate">Holiday</div>
                  )}
                  {!isHoliday && cell.isCurrentMonth && cell.calendarDay?.hasSlots && (
                    <div className="text-[8px] text-slate-400 leading-none mt-0.5">
                      {availableCount}/{availableCount + bookedCount}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Doctor Info */}
          {selectedDoctor && (
            <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-100">
              <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wide mb-1">Doctor Info</p>
              <div className="text-[10px] space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Duration</span>
                  <span className="text-slate-700 font-medium">{selectedDoctor.appointmentDurationMinutes} min</span>
                </div>
                <div className="flex gap-0.5 mt-1">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => {
                    const schedule = doctorDetails?.schedules.find((s: DoctorSchedule) => s.dayOfWeek === idx);
                    const isWorking = schedule?.isWorking;
                    return (
                      <span
                        key={idx}
                        className={`w-4 h-4 flex items-center justify-center rounded text-[8px] font-medium ${
                          isWorking ? 'bg-[var(--color-primary)] text-white' : 'bg-slate-200 text-slate-400'
                        }`}
                      >
                        {day}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Slots */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="bg-white rounded-lg border border-slate-200 flex flex-col min-h-0 overflow-hidden flex-1">
          {/* Header */}
          <div className="flex-shrink-0 px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-medium text-xs text-slate-900">
                {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </h2>
              {slotsData && slotsData.stats.total > 0 && (
                <p className="text-[10px] text-slate-500">{slotsData.stats.available} open · {slotsData.stats.booked} booked</p>
              )}
            </div>
            <button
              onClick={() => setShowGenerateModal(true)}
              className="px-2 py-1 text-[10px] text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-dark)] flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Generate
            </button>
          </div>

          {slotsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !slotsData || slotsData.stats.total === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-xs">No slots for this date</p>
                <p className="text-[10px] mt-1">Generate slots using the button above</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-2 min-h-0 overflow-auto">
              {/* Morning */}
              <div className="flex flex-col min-h-0 bg-amber-50 rounded border border-amber-100 overflow-hidden">
                <div className="flex-shrink-0 px-2 py-1.5 bg-amber-100/50 border-b border-amber-100 flex items-center gap-1">
                  <span className="text-xs">☀️</span>
                  <span className="font-medium text-[10px] text-amber-800">Morning</span>
                  <span className="text-[9px] text-amber-600 ml-auto">
                    {slotsData.morning.filter((s: Slot) => s.status === 'AVAILABLE').length} open
                  </span>
                </div>
                <div className="flex-1 p-1 overflow-y-auto space-y-0.5">
                  {slotsData.morning.map((slot: Slot) => (
                    <SlotCard key={slot.id} slot={slot} onBook={() => onBookSlot(slot)} onCancel={() => slot.appointmentId && onCancelAppointment(slot.appointmentId)} onBlock={() => onBlockSlot(slot.id)} onUnblock={() => onUnblockSlot(slot.id)} />
                  ))}
                  {slotsData.morning.length === 0 && <p className="text-center text-[10px] text-amber-400 py-2">No slots</p>}
                </div>
              </div>

              {/* Evening */}
              <div className="flex flex-col min-h-0 bg-orange-50 rounded border border-orange-100 overflow-hidden">
                <div className="flex-shrink-0 px-2 py-1.5 bg-orange-100/50 border-b border-orange-100 flex items-center gap-1">
                  <span className="text-xs">🌅</span>
                  <span className="font-medium text-[10px] text-orange-800">Evening</span>
                  <span className="text-[9px] text-orange-600 ml-auto">
                    {slotsData.evening.filter((s: Slot) => s.status === 'AVAILABLE').length} open
                  </span>
                </div>
                <div className="flex-1 p-1 overflow-y-auto space-y-0.5">
                  {slotsData.evening.map((slot: Slot) => (
                    <SlotCard key={slot.id} slot={slot} onBook={() => onBookSlot(slot)} onCancel={() => slot.appointmentId && onCancelAppointment(slot.appointmentId)} onBlock={() => onBlockSlot(slot.id)} onUnblock={() => onUnblockSlot(slot.id)} />
                  ))}
                  {slotsData.evening.length === 0 && <p className="text-center text-[10px] text-orange-400 py-2">No slots</p>}
                </div>
              </div>

              {/* Night */}
              <div className="flex flex-col min-h-0 bg-indigo-50 rounded border border-indigo-100 overflow-hidden">
                <div className="flex-shrink-0 px-2 py-1.5 bg-indigo-100/50 border-b border-indigo-100 flex items-center gap-1">
                  <span className="text-xs">🌙</span>
                  <span className="font-medium text-[10px] text-indigo-800">Night</span>
                  <span className="text-[9px] text-indigo-600 ml-auto">
                    {slotsData.night.filter((s: Slot) => s.status === 'AVAILABLE').length} open
                  </span>
                </div>
                <div className="flex-1 p-1 overflow-y-auto space-y-0.5">
                  {slotsData.night.map((slot: Slot) => (
                    <SlotCard key={slot.id} slot={slot} onBook={() => onBookSlot(slot)} onCancel={() => slot.appointmentId && onCancelAppointment(slot.appointmentId)} onBlock={() => onBlockSlot(slot.id)} onUnblock={() => onUnblockSlot(slot.id)} />
                  ))}
                  {slotsData.night.length === 0 && <p className="text-center text-[10px] text-indigo-400 py-2">No slots</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HOSPITAL CALENDAR TAB
// ============================================================================
function HospitalCalendarTab({ doctors, formatDateString, getHospitalToday }: any) {
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const today = getHospitalToday();
    const day = today.getDay();
    const diff = today.getDate() - day;
    return new Date(today.getFullYear(), today.getMonth(), diff);
  });
  const [weekData, setWeekData] = useState<Map<string, Map<string, any>>>(new Map());
  const [loading, setLoading] = useState(false);

  // Generate 7 days of the week
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekStart]);

  const fetchWeekData = useCallback(async () => {
    setLoading(true);
    const newData = new Map<string, Map<string, any>>();
    try {
      for (const day of weekDays) {
        const dateStr = formatDateString(day);
        const dayData = new Map<string, any>();
        const promises = doctors.map(async (doc: Doctor) => {
          const res = await apiFetch(`/v1/appointments/slots/date/${dateStr}?doctorProfileId=${doc.id}`);
          if (res.ok) {
            const data = await res.json();
            dayData.set(doc.id, data);
          }
        });
        await Promise.all(promises);
        newData.set(dateStr, dayData);
      }
      setWeekData(newData);
    } catch (error) {
      console.error('Failed to fetch week data:', error);
    } finally {
      setLoading(false);
    }
  }, [weekDays, doctors, formatDateString]);

  useEffect(() => {
    fetchWeekData();
  }, [weekStart, doctors]);

  const navigateWeek = (weeks: number) => {
    const newStart = new Date(weekStart);
    newStart.setDate(weekStart.getDate() + weeks * 7);
    setWeekStart(newStart);
  };

  const goToToday = () => {
    const today = getHospitalToday();
    const day = today.getDay();
    const diff = today.getDate() - day;
    setWeekStart(new Date(today.getFullYear(), today.getMonth(), diff));
  };

  const todayStr = formatDateString(getHospitalToday());

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigateWeek(-1)} className="p-1 hover:bg-slate-100 rounded">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-xs font-medium text-slate-700">
            {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button onClick={() => navigateWeek(1)} className="p-1 hover:bg-slate-100 rounded">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button onClick={goToToday} className="text-[10px] text-[var(--color-primary)] hover:underline ml-2">Today</button>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Available</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Booked</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300"></span> Blocked</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wide border-r border-slate-100 min-w-[140px]">Doctor</th>
                {weekDays.map((day) => {
                  const dateStr = formatDateString(day);
                  const isToday = dateStr === todayStr;
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <th key={dateStr} className={`px-2 py-2 text-center min-w-[100px] ${isToday ? 'bg-blue-50' : isWeekend ? 'bg-slate-100/50' : ''}`}>
                      <div className={`text-[10px] font-medium ${isToday ? 'text-blue-600' : 'text-slate-500'}`}>
                        {day.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div className={`text-xs font-semibold ${isToday ? 'text-blue-700' : 'text-slate-700'}`}>
                        {day.getDate()}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doctors.map((doctor: Doctor) => (
                <tr key={doctor.id} className="hover:bg-slate-50/50">
                  <td className="sticky left-0 bg-white px-3 py-2 border-r border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)] text-[9px] font-semibold">
                        {doctor.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-slate-800">Dr. {doctor.name}</p>
                        <p className="text-[9px] text-slate-400">{doctor.specialization || 'General'}</p>
                      </div>
                    </div>
                  </td>
                  {weekDays.map((day) => {
                    const dateStr = formatDateString(day);
                    const dayData = weekData.get(dateStr);
                    const doctorSlots = dayData?.get(doctor.id);
                    const isToday = dateStr === todayStr;
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                    if (!doctorSlots || doctorSlots.stats.total === 0) {
                      return (
                        <td key={dateStr} className={`px-2 py-2 text-center ${isToday ? 'bg-blue-50/50' : isWeekend ? 'bg-slate-50/50' : ''}`}>
                          <span className="text-[10px] text-slate-300">—</span>
                        </td>
                      );
                    }

                    const { available, booked, blocked, total } = doctorSlots.stats;
                    const utilization = total > 0 ? Math.round((booked / total) * 100) : 0;

                    return (
                      <td key={dateStr} className={`px-2 py-2 ${isToday ? 'bg-blue-50/50' : isWeekend ? 'bg-slate-50/50' : ''}`}>
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1 text-[9px]">
                            <span className="text-emerald-600 font-medium">{available}</span>
                            <span className="text-slate-300">/</span>
                            <span className="text-blue-600 font-medium">{booked}</span>
                            {blocked > 0 && <span className="text-slate-400">({blocked})</span>}
                          </div>
                          <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden flex">
                            <div className="bg-blue-500 h-full" style={{ width: `${utilization}%` }} />
                            <div className="bg-emerald-500 h-full" style={{ width: `${(available / total) * 100}%` }} />
                          </div>
                          <span className="text-[8px] text-slate-400">{utilization}% booked</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// QUEUE TAB
// ============================================================================
function QueueTab({ doctors, patients, formatDateString, getHospitalToday, onAddPatient }: any) {
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(doctors[0] || null);
  const [queueData, setQueueData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showApptModal, setShowApptModal] = useState(false);

  // Search states
  const [waitingSearch, setWaitingSearch] = useState('');
  const [queueSearch, setQueueSearch] = useState('');
  const [scheduledSearch, setScheduledSearch] = useState('');
  const [completedSearch, setCompletedSearch] = useState('');

  // Walk-in form
  const [walkInForm, setWalkInForm] = useState({
    patientId: '',
    walkInName: '',
    walkInPhone: '',
    reasonForVisit: '',
    priority: 'NORMAL' as 'NORMAL' | 'URGENT' | 'EMERGENCY',
  });

  const getToday = useCallback(() => formatDateString(getHospitalToday()), [formatDateString, getHospitalToday]);

  const fetchQueueData = useCallback(async () => {
    if (!selectedDoctor) return;
    try {
      const today = getToday();
      const res = await apiFetch(`/v1/queue/daily?doctorProfileId=${selectedDoctor.id}&date=${today}`);
      if (res.ok) setQueueData(await res.json());
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDoctor, getToday]);

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

  const getPatientName = (entry: any) => {
    if (entry.patient) return `${entry.patient.firstName} ${entry.patient.lastName}`;
    return entry.walkInName || 'Unknown';
  };

  const getPatientPhone = (entry: any) => entry.patient?.phone || entry.walkInPhone || '';

  const filterEntries = (entries: any[], search: string, sortByPriority = false) => {
    let filtered = entries;
    if (search) {
      const lower = search.toLowerCase();
      filtered = entries.filter((e: any) => getPatientName(e).toLowerCase().includes(lower) || getPatientPhone(e).includes(search));
    }
    if (sortByPriority) {
      const priorityOrder: Record<string, number> = { EMERGENCY: 0, URGENT: 1, NORMAL: 2 };
      filtered = [...filtered].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    }
    return filtered;
  };

  const filterScheduled = (appointments: any[], search: string) => {
    if (!search) return appointments;
    const lower = search.toLowerCase();
    return appointments.filter((a: any) => a.patientName.toLowerCase().includes(lower) || a.patientPhone?.includes(search));
  };

  const formatTimeFromISO = (isoString: string) => {
    const date = new Date(isoString);
    const hours = date.getHours();
    const mins = date.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${String(mins).padStart(2, '0')} ${period}`;
  };

  const doctorStatus = queueData?.doctorCheckin?.status || 'NOT_CHECKED_IN';
  const isCheckedIn = doctorStatus === 'CHECKED_IN';

  if (loading && !queueData) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-1.5 bg-white rounded-lg border border-slate-200 mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <select
            value={selectedDoctor?.id || ''}
            onChange={(e) => setSelectedDoctor(doctors.find((d: Doctor) => d.id === e.target.value) || null)}
            className="text-xs px-2 py-1 border border-slate-200 rounded bg-white"
          >
            {doctors.map((doc: Doctor) => (
              <option key={doc.id} value={doc.id}>Dr. {doc.name}</option>
            ))}
          </select>
          <button
            onClick={isCheckedIn ? handleDoctorCheckOut : handleDoctorCheckIn}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
              isCheckedIn ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isCheckedIn ? 'bg-green-500' : 'bg-slate-400'}`} />
            {isCheckedIn ? 'Checked In' : 'Check In'}
          </button>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium">{queueData?.stats?.totalWaiting || 0} waiting</span>
          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">{queueData?.stats?.totalQueue || 0} queue</span>
          <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">{queueData?.stats?.totalScheduled || 0} scheduled</span>
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full font-medium">{queueData?.stats?.totalCompleted || 0} done</span>
        </div>
      </div>

      {/* Main Content - Circular Flow Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 overflow-auto lg:overflow-hidden relative">
        {/* LEFT COLUMN */}
        <div className="flex flex-col min-h-0 relative">
          {/* DAILY QUEUE (Top Left) */}
          <div className="flex-1 min-h-0 bg-blue-50/40 rounded-lg border border-blue-200/60 flex flex-col">
            <div className="flex-shrink-0 px-3 py-1.5 bg-blue-100/50 border-b border-blue-200/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-700">Daily Queue</span>
                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-medium rounded">{queueData?.queue?.length || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <input type="text" placeholder="Search..." value={queueSearch} onChange={(e) => setQueueSearch(e.target.value)} className="text-[10px] px-2 py-0.5 border border-slate-200 rounded w-20 bg-white" />
                <button onClick={() => setShowWalkInModal(true)} className="text-[10px] px-2 py-0.5 bg-[var(--color-primary)] text-white rounded hover:bg-[var(--color-primary-dark)] transition-colors font-medium">
                  + Walk-in
                </button>
              </div>
            </div>
            <div className="flex-1 p-1.5 space-y-1 overflow-y-auto">
              {filterEntries(queueData?.queue || [], queueSearch, true).map((entry: any) => (
                <div key={entry.id} className={`rounded p-1.5 border flex items-center justify-between ${
                  entry.priority === 'EMERGENCY' ? 'bg-red-50 border-red-200' :
                  entry.priority === 'URGENT' ? 'bg-amber-50 border-amber-200' : 'bg-white border-blue-100'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold text-white ${
                      entry.priority === 'EMERGENCY' ? 'bg-red-500' : entry.priority === 'URGENT' ? 'bg-amber-500' : 'bg-blue-500'
                    }`}>{entry.queueNumber}</span>
                    <div>
                      <p className="text-[10px] font-medium text-slate-700">{getPatientName(entry)}</p>
                      <p className="text-[9px] text-slate-400">{formatTimeFromISO(entry.checkedInAt)}</p>
                    </div>
                  </div>
                  <button onClick={() => handleUpdateStatus(entry.id, 'WAITING')} className="text-[9px] px-2 py-0.5 text-blue-600 border border-blue-300 rounded hover:bg-blue-500 hover:text-white transition-colors font-medium">
                    Call →
                  </button>
                </div>
              ))}
              {filterEntries(queueData?.queue || [], queueSearch, true).length === 0 && (
                <div className="text-center py-6 text-slate-400">
                  <p className="text-[10px]">No patients in queue</p>
                </div>
              )}
            </div>
          </div>

          {/* Arrow: Scheduled → Queue */}
          <div className="flex justify-center py-1 z-10">
            <svg className="w-6 h-6 text-[var(--color-primary)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z" transform="rotate(-90 12 12)"/>
            </svg>
          </div>

          {/* SCHEDULED APPOINTMENTS (Bottom Left) */}
          <div className="h-[45%] min-h-[220px] bg-blue-50/30 rounded-lg border border-blue-200/50 flex flex-col">
            <div className="flex-shrink-0 px-3 py-1.5 bg-blue-100/40 border-b border-blue-200/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-700">Today's Scheduled</span>
                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-medium rounded">{queueData?.scheduled?.filter((s: any) => !s.isCheckedIn).length || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <input type="text" placeholder="Search..." value={scheduledSearch} onChange={(e) => setScheduledSearch(e.target.value)} className="text-[10px] px-2 py-0.5 border border-slate-200 rounded w-20 bg-white" />
                <button onClick={() => setShowApptModal(true)} className="text-[10px] px-2 py-0.5 bg-[var(--color-primary)] text-white rounded hover:bg-[var(--color-primary-dark)] transition-colors font-medium">
                  + Book
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filterScheduled(queueData?.scheduled || [], scheduledSearch).filter((s: any) => !s.isCheckedIn).length > 0 ? (
                <div className="p-1.5 space-y-1">
                  {filterScheduled(queueData?.scheduled || [], scheduledSearch).filter((s: any) => !s.isCheckedIn).map((appt: any) => (
                    <div key={appt.id} className="flex items-center justify-between p-1.5 bg-white rounded border border-blue-100 hover:border-blue-200">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-semibold text-blue-600 w-12">{formatTime12h(appt.startTime)}</span>
                        <p className="text-[10px] font-medium text-slate-700">{appt.patientName}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleCheckInAppointment(appt.appointmentId)} className="text-[9px] px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors font-medium">
                          Check In ↑
                        </button>
                        <button onClick={() => handleAppointmentNoShow(appt.appointmentId)} className="text-[9px] text-slate-300 hover:text-red-500 px-0.5">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-slate-400">
                  <p className="text-[10px]">No scheduled appointments</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Arrow: Queue → Waiting (horizontal between columns) */}
        <div className="absolute left-1/2 top-[18%] -translate-x-1/2 z-10">
          <svg className="w-7 h-7 text-[var(--color-primary)]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z"/>
          </svg>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col min-h-0 relative">
          {/* WAITING (Top Right) */}
          <div className="h-[32%] min-h-[140px] bg-amber-50/50 rounded-lg border border-amber-200/60 flex flex-col">
            <div className="flex-shrink-0 px-3 py-1.5 bg-amber-100/50 border-b border-amber-200/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-700">Waiting</span>
                <span className="px-1.5 py-0.5 bg-amber-200 text-amber-800 text-[9px] font-medium rounded">{queueData?.waiting?.length || 0}</span>
              </div>
              <input type="text" placeholder="Search..." value={waitingSearch} onChange={(e) => setWaitingSearch(e.target.value)} className="text-[10px] px-2 py-0.5 border border-slate-200 rounded w-20 bg-white" />
            </div>
            <div className="flex-1 p-1.5 space-y-1 overflow-y-auto">
              {filterEntries(queueData?.waiting || [], waitingSearch).map((entry: any) => (
                <div key={entry.id} className="flex items-center justify-between p-1.5 bg-white rounded border border-amber-100">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[9px] font-semibold">{entry.queueNumber}</span>
                    <p className="text-[10px] font-medium text-slate-700">{getPatientName(entry)}</p>
                  </div>
                  <button onClick={() => handleUpdateStatus(entry.id, 'WITH_DOCTOR')} disabled={!isCheckedIn || queueData?.withDoctor !== null} className="text-[9px] px-2 py-0.5 text-amber-700 border border-amber-300 rounded hover:bg-amber-500 hover:text-white disabled:opacity-40 transition-colors font-medium">
                    Send →
                  </button>
                </div>
              ))}
              {filterEntries(queueData?.waiting || [], waitingSearch).length === 0 && (
                <p className="text-[10px] text-slate-400 text-center py-3">No patients waiting</p>
              )}
            </div>
          </div>

          {/* Arrow: Waiting → With Doctor */}
          <div className="flex justify-center py-1 z-10">
            <svg className="w-6 h-6 text-[var(--color-primary)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z" transform="rotate(90 12 12)"/>
            </svg>
          </div>

          {/* WITH DOCTOR (Middle Right) */}
          <div className="h-[32%] min-h-[140px] bg-slate-100/60 rounded-lg border border-slate-300/60 flex flex-col">
            <div className="flex-shrink-0 px-3 py-1.5 bg-slate-200/50 border-b border-slate-300/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-700">With Doctor</span>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${isCheckedIn ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                {isCheckedIn ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="flex-1 p-2 flex items-center justify-center">
              {!isCheckedIn ? (
                <div className="text-center">
                  <p className="text-[10px] text-slate-400">Doctor not checked in</p>
                  <button onClick={handleDoctorCheckIn} className="mt-1 text-[9px] px-3 py-1 bg-[var(--color-primary)] text-white rounded hover:bg-[var(--color-primary-dark)] font-medium">
                    Check In Doctor
                  </button>
                </div>
              ) : queueData?.withDoctor ? (
                <div className="w-full bg-white rounded p-2 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-[var(--color-primary)] text-white rounded-full flex items-center justify-center text-[11px] font-semibold">
                        {queueData.withDoctor.queueNumber}
                      </span>
                      <div>
                        <p className="text-[11px] font-medium text-slate-700">{getPatientName(queueData.withDoctor)}</p>
                        <p className="text-[9px] text-slate-400">{formatTimeFromISO(queueData.withDoctor.checkedInAt)}</p>
                      </div>
                    </div>
                    <button onClick={() => handleUpdateStatus(queueData.withDoctor!.id, 'COMPLETED')} className="text-[9px] px-3 py-1 bg-emerald-500 text-white rounded hover:bg-emerald-600 transition-colors font-medium">
                      Complete ✓
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-slate-400">Ready for next patient</p>
              )}
            </div>
          </div>

          {/* Arrow: With Doctor → Completed */}
          <div className="flex justify-center py-1 z-10">
            <svg className="w-6 h-6 text-[var(--color-primary)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z" transform="rotate(90 12 12)"/>
            </svg>
          </div>

          {/* COMPLETED (Bottom Right) */}
          <div className="flex-1 min-h-0 bg-emerald-50/50 rounded-lg border border-emerald-200/60 flex flex-col">
            <div className="flex-shrink-0 px-3 py-1.5 bg-emerald-100/50 border-b border-emerald-200/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-700">Completed</span>
                <span className="px-1.5 py-0.5 bg-emerald-200 text-emerald-800 text-[9px] font-medium rounded">{queueData?.completed?.length || 0}</span>
              </div>
              <input type="text" placeholder="Search..." value={completedSearch} onChange={(e) => setCompletedSearch(e.target.value)} className="text-[10px] px-2 py-0.5 border border-slate-200 rounded w-20 bg-white" />
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-[9px]">
                <thead className="bg-emerald-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium text-emerald-700">Patient</th>
                    <th className="px-2 py-1 text-left font-medium text-emerald-700">Wait</th>
                    <th className="px-2 py-1 text-left font-medium text-emerald-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100/50">
                  {filterEntries(queueData?.completed || [], completedSearch).map((entry: any) => (
                    <tr key={entry.id} className="hover:bg-emerald-50/50">
                      <td className="px-2 py-1 font-medium text-emerald-800">{getPatientName(entry)}</td>
                      <td className="px-2 py-1 text-emerald-600">{entry.waitTimeMinutes ? `${entry.waitTimeMinutes}m` : '-'}</td>
                      <td className="px-2 py-1">
                        <span className={`px-1 py-0.5 rounded text-[8px] font-medium ${
                          entry.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-600' :
                          entry.status === 'NO_SHOW' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {entry.status === 'COMPLETED' ? 'Done' : entry.status === 'NO_SHOW' ? 'No Show' : 'Left'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filterEntries(queueData?.completed || [], completedSearch).length === 0 && (
                    <tr><td colSpan={3} className="px-2 py-3 text-center text-slate-400">No completed yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Walk-in Modal */}
      {showWalkInModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-800">Add Walk-in Patient</h3>
              <button onClick={() => setShowWalkInModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleAddWalkIn} className="p-4 space-y-3">
              <div>
                <label className="block text-[10px] font-medium text-slate-600 mb-1">Select Patient</label>
                <div className="flex gap-1">
                  <select value={walkInForm.patientId} onChange={(e) => setWalkInForm({ ...walkInForm, patientId: e.target.value })} className="flex-1 text-xs px-2 py-1.5 border border-slate-200 rounded">
                    <option value="">-- New/Unknown Patient --</option>
                    {patients.map((p: Patient) => (
                      <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                    ))}
                  </select>
                  <button type="button" onClick={onAddPatient} className="text-[10px] px-2 py-1 text-[var(--color-primary)] border border-[var(--color-primary)] rounded hover:bg-[var(--color-primary)] hover:text-white">+ New</button>
                </div>
              </div>
              {!walkInForm.patientId && (
                <>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-600 mb-1">Name</label>
                    <input type="text" value={walkInForm.walkInName} onChange={(e) => setWalkInForm({ ...walkInForm, walkInName: e.target.value })} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded" placeholder="Patient name" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-600 mb-1">Phone</label>
                    <input type="text" value={walkInForm.walkInPhone} onChange={(e) => setWalkInForm({ ...walkInForm, walkInPhone: e.target.value })} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded" placeholder="Phone number" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-[10px] font-medium text-slate-600 mb-1">Reason for Visit</label>
                <input type="text" value={walkInForm.reasonForVisit} onChange={(e) => setWalkInForm({ ...walkInForm, reasonForVisit: e.target.value })} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded" placeholder="e.g., Follow-up" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-600 mb-1">Priority</label>
                <select value={walkInForm.priority} onChange={(e) => setWalkInForm({ ...walkInForm, priority: e.target.value as any })} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded">
                  <option value="NORMAL">Normal</option>
                  <option value="URGENT">Urgent</option>
                  <option value="EMERGENCY">Emergency</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowWalkInModal(false)} className="text-xs px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                <button type="submit" className="text-xs px-3 py-1.5 bg-teal-500 text-white rounded hover:bg-teal-600">Add to Queue</button>
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
              <h3 className="text-sm font-medium text-slate-800">Check In Appointment</h3>
              <button onClick={() => setShowApptModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4">
              <p className="text-xs text-slate-600 mb-3">Select an appointment to check in:</p>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {queueData?.scheduled?.filter((s: any) => !s.isCheckedIn).map((appt: any) => (
                  <button key={appt.id} onClick={() => { handleCheckInAppointment(appt.appointmentId); setShowApptModal(false); }} className="w-full text-left p-2 rounded border border-slate-200 hover:border-purple-300 hover:bg-purple-50">
                    <p className="text-xs font-medium text-slate-800">{appt.patientName}</p>
                    <p className="text-[10px] text-slate-500">{formatTime12h(appt.startTime)}</p>
                  </button>
                ))}
                {(!queueData?.scheduled || queueData.scheduled.filter((s: any) => !s.isCheckedIn).length === 0) && (
                  <p className="text-center text-slate-500 py-4 text-xs">No appointments to check in</p>
                )}
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={() => setShowApptModal(false)} className="text-xs px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PATIENTS TAB
// ============================================================================
function PatientsTab({ patients, setPatients, onAddPatient }: { patients: Patient[]; setPatients: (p: Patient[]) => void; onAddPatient: () => void }) {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '' });

  const filtered = patients.filter(p => {
    const name = `${p.firstName} ${p.lastName}`.toLowerCase();
    return name.includes(search.toLowerCase()) || p.email?.toLowerCase().includes(search.toLowerCase()) || p.phone?.includes(search);
  });

  const activeCount = patients.filter(p => (p as any).status === 'active').length;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editing ? `/v1/patients/${editing.id}` : '/v1/patients';
      const res = await apiFetch(url, { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(form) });
      if (res.ok) {
        setShowModal(false);
        setEditing(null);
        setForm({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '' });
        const r = await apiFetch('/v1/patients');
        if (r.ok) setPatients(await r.json());
      } else {
        const err = await res.json();
        alert(err.message || 'Failed');
      }
    } catch { alert('Failed to save'); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (p: Patient) => {
    const status = (p as any).status === 'active' ? 'inactive' : 'active';
    await apiFetch(`/v1/patients/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    const r = await apiFetch('/v1/patients');
    if (r.ok) setPatients(await r.json());
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patients..." className="pl-7 pr-2 py-1.5 text-[10px] border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] w-48" />
          </div>
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-medium rounded-full">{activeCount} active</span>
          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-medium rounded-full">{patients.length} total</span>
        </div>
        <button onClick={() => { setEditing(null); setForm({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '' }); setShowModal(true); }} className="px-3 py-1.5 text-[10px] font-medium text-[var(--color-primary)] border border-[var(--color-primary)] rounded-lg hover:bg-[var(--color-primary)] hover:text-white transition-colors">
          + Add Patient
        </button>
      </div>
      <div className="max-h-[calc(100vh-280px)] overflow-auto">
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[500px]">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wide">Patient</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wide hidden sm:table-cell">Contact</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wide hidden sm:table-cell">DOB</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wide hidden sm:table-cell">Gender</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-[10px] font-semibold">
                        {p.firstName.charAt(0)}{p.lastName.charAt(0)}
                      </div>
                      <span className="font-medium text-slate-700">{p.firstName} {p.lastName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-500 hidden sm:table-cell">
                    <div>{p.phone || '—'}</div>
                    <div className="text-[9px] text-slate-400 truncate max-w-[140px]">{p.email || '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-500 hidden sm:table-cell">{p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString() : '—'}</td>
                  <td className="px-3 py-2 text-slate-500 capitalize hidden sm:table-cell">{p.gender || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${(p as any).status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {(p as any).status || 'active'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => { setEditing(p); setForm({ firstName: p.firstName, lastName: p.lastName, email: p.email || '', phone: p.phone || '', dateOfBirth: p.dateOfBirth || '', gender: p.gender || '' }); setShowModal(true); }} className="text-[var(--color-primary)] hover:underline mr-3">Edit</button>
                    <button onClick={() => toggleStatus(p)} className={(p as any).status === 'active' ? 'text-amber-600 hover:underline' : 'text-emerald-600 hover:underline'}>
                      {(p as any).status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <div className="py-12 text-center">
            <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <p className="text-xs text-slate-500">{search ? 'No patients found' : 'No patients yet'}</p>
          </div>
        )}
      </div>

      {/* Patient Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">{editing ? 'Edit Patient' : 'Add Patient'}</h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} placeholder="First Name *" required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]" />
                <input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} placeholder="Last Name *" required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]" />
                <PhoneInput value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} placeholder="Phone number" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="date" value={form.dateOfBirth} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]" />
                <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] bg-white">
                  <option value="">Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving || !form.firstName || !form.lastName} className="flex-1 py-2 text-xs font-medium text-white bg-[var(--color-primary)] rounded-lg hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
                  {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SLOT CARD COMPONENT
// ============================================================================
function SlotCard({ slot, onBook, onCancel, onBlock, onUnblock }: { slot: Slot; onBook: () => void; onCancel: () => void; onBlock: () => void; onUnblock: () => void }) {
  const isAvailable = slot.status === 'AVAILABLE';
  const isBooked = slot.status === 'BOOKED';
  const isBlocked = slot.status === 'BLOCKED';

  return (
    <div
      className={`
        px-1.5 py-1 rounded flex items-center justify-between text-[10px]
        ${isAvailable ? 'bg-white border border-slate-200 hover:border-[var(--color-primary)] cursor-pointer' : ''}
        ${isBooked ? 'bg-blue-50 border border-blue-100' : ''}
        ${isBlocked ? 'bg-slate-100 border border-slate-200' : ''}
      `}
      onClick={() => isAvailable && onBook()}
    >
      <div className="flex items-center gap-1">
        <span className="font-medium text-slate-700">{formatTime12h(slot.startTime)}</span>
        {isAvailable && <span className="w-1 h-1 rounded-full bg-green-500" />}
        {isBooked && (
          <>
            <span className="w-1 h-1 rounded-full bg-blue-500" />
            <span className="text-blue-700 font-medium truncate max-w-[60px]">{slot.patientName}</span>
          </>
        )}
        {isBlocked && <span className="text-slate-400">Blocked</span>}
      </div>
      <div className="flex items-center gap-0.5">
        {isAvailable && (
          <button onClick={(e) => { e.stopPropagation(); onBlock(); }} className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600" title="Block">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </button>
        )}
        {isBooked && (
          <button onClick={(e) => { e.stopPropagation(); onCancel(); }} className="text-[9px] text-red-500 hover:text-red-700">Cancel</button>
        )}
        {isBlocked && (
          <button onClick={(e) => { e.stopPropagation(); onUnblock(); }} className="text-[9px] text-green-600 hover:text-green-800">Unblock</button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MODALS
// ============================================================================
function GenerateSlotsModal({ selectedDoctor, generateStartDate, setGenerateStartDate, generateEndDate, setGenerateEndDate, generating, handleGenerateSlots, onClose, formatDateString, getHospitalToday }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-medium text-slate-900 text-sm">Generate Appointment Slots</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">Doctor</label>
            <input type="text" value={selectedDoctor ? `Dr. ${selectedDoctor.name}` : ''} disabled className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded bg-slate-50 text-slate-500" />
            <p className="text-[10px] text-slate-500 mt-0.5">Slot duration: {selectedDoctor?.appointmentDurationMinutes || 30} minutes</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Start Date</label>
              <input type="date" value={generateStartDate} onChange={(e) => setGenerateStartDate(e.target.value)} min={formatDateString(getHospitalToday())} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">End Date</label>
              <input type="date" value={generateEndDate} onChange={(e) => setGenerateEndDate(e.target.value)} min={generateStartDate || formatDateString(getHospitalToday())} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded" />
            </div>
          </div>
          <p className="text-[10px] text-slate-500">Slots will be generated based on the doctor's weekly schedule and skip any time-off periods.</p>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-[11px] text-slate-600 bg-slate-100 rounded hover:bg-slate-200">Cancel</button>
          <button onClick={handleGenerateSlots} disabled={generating || !generateStartDate || !generateEndDate} className="px-3 py-1.5 text-[11px] text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
            {generating ? 'Generating...' : 'Generate Slots'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BookingModal({ selectedSlot, patientSearch, setPatientSearch, filteredPatients, selectedPatient, setSelectedPatient, reasonForVisit, setReasonForVisit, bookingNotes, setBookingNotes, booking, handleBookAppointment, onClose, onAddPatient }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-medium text-slate-900 text-sm">Book Appointment</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-3">
          {/* Slot Info */}
          <div className="bg-slate-50 rounded-lg p-2 flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)] text-white flex items-center justify-center text-[10px] font-medium">
              {formatTime12h(selectedSlot.startTime)}
            </div>
            <div>
              <p className="font-medium text-slate-900 text-xs">Dr. {selectedSlot.doctorName}</p>
              <p className="text-[10px] text-slate-500">
                {new Date(selectedSlot.slotDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {formatTime12h(selectedSlot.startTime)} - {formatTime12h(selectedSlot.endTime)}
              </p>
            </div>
          </div>

          {/* Patient Search */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-slate-700">Select Patient</label>
              <button onClick={onAddPatient} className="text-[10px] text-[var(--color-primary)] hover:underline">+ Add New</button>
            </div>
            <input type="text" placeholder="Search by name, email, or phone..." value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded" />
            {patientSearch && !selectedPatient && (
              <div className="mt-1 max-h-32 overflow-y-auto border border-slate-200 rounded">
                {filteredPatients.length === 0 ? (
                  <p className="p-2 text-[10px] text-slate-500">No patients found</p>
                ) : (
                  filteredPatients.slice(0, 8).map((patient: Patient) => (
                    <button key={patient.id} onClick={() => { setSelectedPatient(patient); setPatientSearch(`${patient.firstName} ${patient.lastName}`); }} className="w-full text-left px-2 py-1.5 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                      <p className="font-medium text-[11px] text-slate-900">{patient.firstName} {patient.lastName}</p>
                      <p className="text-[10px] text-slate-500">{patient.email || patient.phone || 'No contact'}</p>
                    </button>
                  ))
                )}
              </div>
            )}
            {selectedPatient && (
              <div className="mt-1 flex items-center justify-between bg-green-50 rounded p-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[10px] font-medium">{selectedPatient.firstName.charAt(0)}</div>
                  <div>
                    <p className="text-[11px] font-medium text-green-800">{selectedPatient.firstName} {selectedPatient.lastName}</p>
                    <p className="text-[10px] text-green-600">{selectedPatient.phone || selectedPatient.email}</p>
                  </div>
                </div>
                <button onClick={() => { setSelectedPatient(null); setPatientSearch(''); }} className="text-green-600 hover:text-green-800">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Reason & Notes */}
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">Reason for Visit (optional)</label>
            <input type="text" value={reasonForVisit} onChange={(e) => setReasonForVisit(e.target.value)} placeholder="e.g., Follow-up, Consultation" className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">Notes (optional)</label>
            <textarea value={bookingNotes} onChange={(e) => setBookingNotes(e.target.value)} placeholder="Any additional notes..." rows={2} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded" />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-[11px] text-slate-600 bg-slate-100 rounded hover:bg-slate-200">Cancel</button>
          <button onClick={handleBookAppointment} disabled={booking || !selectedPatient} className="px-3 py-1.5 text-[11px] text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
            {booking ? 'Booking...' : 'Book Appointment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddPatientModal({ form, setForm, adding, onAdd, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-medium text-slate-900 text-sm">Add New Patient</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">First Name *</label>
              <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Last Name *</label>
              <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">Phone</label>
            <PhoneInput value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} placeholder="Phone number" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Date of Birth</label>
              <input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Gender</label>
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded">
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-[11px] text-slate-600 bg-slate-100 rounded hover:bg-slate-200">Cancel</button>
          <button onClick={onAdd} disabled={adding || !form.firstName || !form.lastName} className="px-3 py-1.5 text-[11px] text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
            {adding ? 'Adding...' : 'Add Patient'}
          </button>
        </div>
      </div>
    </div>
  );
}
