'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../components/AuthProvider';
import { apiFetch } from '../../../../lib/api';
import { useHospitalTimezone } from '../../../../hooks/useHospitalTimezone';
import PhoneInput from '../../../../components/PhoneInput';

interface DoctorProfile {
  id: string;
  userId: string;
  email: string;
  displayName?: string;
  fullName?: string;
  phone?: string;
  // Personal
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  // Professional
  specialization?: string;
  qualification?: string;
  licenseNumber?: string;
  yearsOfExperience?: number;
  consultationFee?: number;
  education?: string;
  certifications?: string[];
  bio?: string;
  // Schedule defaults
  workingDays?: string[];
  defaultShiftStart?: string;
  defaultShiftEnd?: string;
  appointmentDurationMinutes?: number;
  // Status
  complianceStatus?: 'compliant' | 'pending_signatures' | 'not_logged_in';
  documentsRequired?: number;
  documentsSigned?: number;
  createdAt: string;
}

interface DoctorSchedule {
  dayOfWeek: number;
  isWorking: boolean;
  morningShift: boolean;
  eveningShift: boolean;
  nightShift: boolean;
}

interface TimeOff {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: 'approved' | 'pending';
}

interface Specialization {
  id: string;
  name: string;
  description?: string;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface ShiftTiming {
  label: string;
  start: string;
  end: string;
  color: string;
}

interface ShiftTimings {
  morning: ShiftTiming;
  evening: ShiftTiming;
  night: ShiftTiming;
}

const DEFAULT_SHIFTS: ShiftTimings = {
  morning: { label: 'Morning', start: '06:00', end: '14:00', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  evening: { label: 'Evening', start: '14:00', end: '22:00', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  night: { label: 'Night', start: '22:00', end: '06:00', color: 'bg-purple-100 text-purple-700 border-purple-200' },
};

function formatTime(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export default function DoctorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentHospital, user, profile } = useAuth();
  const { timezone, timezoneLabel, formatShortDate, isToday: isTodayInTz, getCurrentTime } = useHospitalTimezone();

  // Handle "me" route for doctors viewing their own profile
  const paramDoctorId = params.doctorId as string;
  const doctorId = paramDoctorId === 'me' ? user?.id || '' : paramDoctorId;
  const isOwnProfile = paramDoctorId === 'me' || doctorId === user?.id;

  // Get user role
  const userRole = profile?.isSuperAdmin ? 'SUPER_ADMIN' : (currentHospital?.role || 'STAFF');
  const isManager = userRole === 'SUPER_ADMIN' || userRole === 'HOSPITAL_MANAGER';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'personal' | 'professional' | 'schedule'>('personal');
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<DoctorProfile>>({});

  // Schedule state
  const [schedule, setSchedule] = useState<DoctorSchedule[]>(
    DAYS_OF_WEEK.map((_, idx) => ({
      dayOfWeek: idx,
      isWorking: idx >= 1 && idx <= 5, // Mon-Fri default
      morningShift: idx >= 1 && idx <= 5,
      eveningShift: false,
      nightShift: false,
    }))
  );
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [showTimeOffModal, setShowTimeOffModal] = useState(false);
  const [newTimeOff, setNewTimeOff] = useState({ startDate: '', endDate: '', reason: '' });

  // Calendar state
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Shift timings state
  const [shiftTimings, setShiftTimings] = useState<ShiftTimings>(DEFAULT_SHIFTS);
  const [showShiftTimingsModal, setShowShiftTimingsModal] = useState(false);
  const [editingShiftTimings, setEditingShiftTimings] = useState<ShiftTimings>(DEFAULT_SHIFTS);

  // Appointment duration state
  const [appointmentDuration, setAppointmentDuration] = useState(30);
  const [savingDuration, setSavingDuration] = useState(false);

  // Specializations
  const [specializations, setSpecializations] = useState<Specialization[]>([]);

  useEffect(() => {
    fetchSpecializations();
    fetchDoctorProfile();
    fetchTimeOff();
    fetchSchedules();
  }, [doctorId]);

  async function fetchSpecializations() {
    try {
      const res = await apiFetch('/v1/specializations');
      if (res.ok) {
        const data = await res.json();
        setSpecializations(data);
      }
    } catch (error) {
      console.error('Failed to fetch specializations:', error);
    }
  }

  async function fetchDoctorProfile() {
    try {
      // Fetch member info with compliance
      const membersRes = await apiFetch('/v1/hospitals/members/compliance');
      let doctorMember: any = null;
      if (membersRes.ok) {
        const members = await membersRes.json();
        doctorMember = members.find((m: any) => m.userId === doctorId && m.role === 'DOCTOR');
      }

      // Also fetch the doctor profile data
      const profileRes = await apiFetch(`/v1/doctors/${doctorId}/profile`);
      let profileData: any = null;
      if (profileRes.ok) {
        profileData = await profileRes.json();
      }

      if (doctorMember || profileData) {
        const doctorData: DoctorProfile = {
          id: profileData?.id || doctorMember?.id || '',
          userId: doctorId,
          email: doctorMember?.email || profileData?.email || '',
          displayName: doctorMember?.fullName || profileData?.fullName,
          fullName: doctorMember?.fullName || profileData?.fullName,
          phone: profileData?.phone || '',
          dateOfBirth: profileData?.dateOfBirth || '',
          gender: profileData?.gender || '',
          address: profileData?.address || '',
          emergencyContact: profileData?.emergencyContact || '',
          emergencyPhone: profileData?.emergencyPhone || '',
          specialization: profileData?.specialization || '',
          qualification: profileData?.qualification || '',
          licenseNumber: profileData?.licenseNumber || '',
          yearsOfExperience: profileData?.yearsOfExperience,
          consultationFee: profileData?.consultationFee,
          education: profileData?.education || '',
          bio: profileData?.bio || '',
          appointmentDurationMinutes: profileData?.appointmentDurationMinutes || 30,
          complianceStatus: doctorMember?.complianceStatus,
          documentsRequired: doctorMember?.documentsRequired,
          documentsSigned: doctorMember?.documentsSigned,
          createdAt: doctorMember?.createdAt || profileData?.createdAt || '',
        };
        setDoctor(doctorData);
        setFormData(doctorData);
        if (profileData?.appointmentDurationMinutes) {
          setAppointmentDuration(profileData.appointmentDurationMinutes);
        }
      }
    } catch (error) {
      console.error('Failed to fetch doctor profile:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTimeOff() {
    try {
      const res = await apiFetch(`/v1/doctors/${doctorId}/time-off`);
      if (res.ok) {
        const data = await res.json();
        // Map the database format to our frontend format
        setTimeOff(data.map((item: any) => ({
          id: item.id,
          startDate: item.start_date,
          endDate: item.end_date,
          reason: item.reason,
          status: item.status,
        })));
      }
    } catch (error) {
      console.error('Failed to fetch time-off:', error);
    }
  }

  async function fetchSchedules() {
    try {
      const res = await apiFetch(`/v1/doctors/${doctorId}/schedules`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          // Convert database format to frontend format
          const newSchedule = DAYS_OF_WEEK.map((_, idx) => {
            const dbSchedule = data.find((s: any) => s.day_of_week === idx);
            if (dbSchedule && dbSchedule.is_working) {
              // Determine which shifts are active based on shift_start and shift_end
              const startHour = parseInt(dbSchedule.shift_start?.split(':')[0] || '0');
              const endHour = parseInt(dbSchedule.shift_end?.split(':')[0] || '0');

              // Check if shift covers morning (6-14), evening (14-22), night (22-6)
              const morningShift = startHour < 14 && endHour > 6;
              const eveningShift = startHour < 22 && endHour > 14;
              const nightShift = endHour <= 6 || startHour >= 22;

              return {
                dayOfWeek: idx,
                isWorking: true,
                morningShift: morningShift,
                eveningShift: eveningShift,
                nightShift: nightShift,
              };
            }
            return {
              dayOfWeek: idx,
              isWorking: false,
              morningShift: false,
              eveningShift: false,
              nightShift: false,
            };
          });
          setSchedule(newSchedule);
        }
      }
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Save to doctor_profiles table via API
      const res = await apiFetch(`/v1/doctors/${doctorId}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: formData.fullName,
          phone: formData.phone || null,
          dateOfBirth: formData.dateOfBirth || null,
          gender: formData.gender || null,
          address: formData.address || null,
          emergencyContact: formData.emergencyContact || null,
          emergencyPhone: formData.emergencyPhone || null,
          specialization: formData.specialization || null,
          qualification: formData.qualification || null,
          licenseNumber: formData.licenseNumber || null,
          yearsOfExperience: formData.yearsOfExperience || null,
          consultationFee: formData.consultationFee || null,
          education: formData.education || null,
          bio: formData.bio || null,
        }),
      });

      if (res.ok) {
        setDoctor({ ...doctor!, ...formData });
        setEditMode(false);
        alert('Profile saved successfully!');
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.message || 'Failed to save profile');
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAppointmentDuration(newDuration: number) {
    setSavingDuration(true);
    try {
      await apiFetch(`/v1/doctors/${doctorId}/appointment-duration`, {
        method: 'PATCH',
        body: JSON.stringify({ appointmentDurationMinutes: newDuration }),
      });
      setAppointmentDuration(newDuration);
    } catch (error) {
      console.error('Failed to save appointment duration:', error);
      alert('Failed to save appointment duration');
    } finally {
      setSavingDuration(false);
    }
  }

  function handleScheduleChange(dayIndex: number, field: string, value: any) {
    setSchedule(prev => prev.map((day, idx) => {
      if (idx !== dayIndex) return day;
      if (field === 'isWorking') {
        // When toggling off, clear all shifts
        if (!value) {
          return { ...day, isWorking: false, morningShift: false, eveningShift: false, nightShift: false };
        }
        return { ...day, isWorking: value };
      }
      if (field === 'morningShift' || field === 'eveningShift' || field === 'nightShift') {
        const updated = { ...day, [field]: value };
        // Auto-enable isWorking if any shift is selected
        if (value) updated.isWorking = true;
        // Auto-disable isWorking if no shifts selected
        if (!updated.morningShift && !updated.eveningShift && !updated.nightShift) {
          updated.isWorking = false;
        }
        return updated;
      }
      return day;
    }));
  }

  // Calendar helpers
  function getCalendarDays(date: Date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days: (number | null)[] = [];
    // Add empty slots for days before the first day of the month
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    // Add the days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  }

  // Parse date string (YYYY-MM-DD) to Date object in a timezone-safe way
  function parseDateString(dateStr: string): Date {
    // Split the date string and create date using components to avoid UTC conversion
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function isDateInTimeOff(day: number) {
    const date = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
    return timeOff.some(t => {
      const start = parseDateString(t.startDate);
      const end = parseDateString(t.endDate);
      return date >= start && date <= end;
    });
  }

  function getTimeOffForDate(day: number) {
    const date = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
    return timeOff.find(t => {
      const start = parseDateString(t.startDate);
      const end = parseDateString(t.endDate);
      return date >= start && date <= end;
    });
  }

  function navigateMonth(direction: 'prev' | 'next') {
    setCalendarDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  }

  function formatMonthYear(date: Date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function isToday(day: number) {
    // Use hospital timezone to determine if a day is "today"
    const today = getCurrentTime();
    return (
      day === today.getDate() &&
      calendarDate.getMonth() === today.getMonth() &&
      calendarDate.getFullYear() === today.getFullYear()
    );
  }

  function openShiftTimingsModal() {
    setEditingShiftTimings({ ...shiftTimings });
    setShowShiftTimingsModal(true);
  }

  function handleShiftTimingChange(shift: keyof ShiftTimings, field: 'start' | 'end', value: string) {
    setEditingShiftTimings(prev => ({
      ...prev,
      [shift]: { ...prev[shift], [field]: value }
    }));
  }

  function saveShiftTimings() {
    setShiftTimings(editingShiftTimings);
    setShowShiftTimingsModal(false);
  }

  async function handleSaveSchedule() {
    setSaving(true);
    try {
      // Convert frontend schedule (shift flags) to database format (start/end times)
      const schedulesToSave = schedule.map((day) => {
        if (!day.isWorking || (!day.morningShift && !day.eveningShift && !day.nightShift)) {
          return {
            dayOfWeek: day.dayOfWeek,
            isWorking: false,
            shiftStart: null,
            shiftEnd: null,
          };
        }

        // Determine earliest start and latest end based on selected shifts
        let shiftStart: string | null = null;
        let shiftEnd: string | null = null;

        if (day.morningShift) {
          shiftStart = shiftTimings.morning.start + ':00';
          shiftEnd = shiftTimings.morning.end + ':00';
        }
        if (day.eveningShift) {
          if (!shiftStart) {
            shiftStart = shiftTimings.evening.start + ':00';
          }
          shiftEnd = shiftTimings.evening.end + ':00';
        }
        if (day.nightShift) {
          if (!shiftStart) {
            shiftStart = shiftTimings.night.start + ':00';
          }
          shiftEnd = shiftTimings.night.end + ':00';
        }

        return {
          dayOfWeek: day.dayOfWeek,
          isWorking: true,
          shiftStart,
          shiftEnd,
        };
      });

      const res = await apiFetch(`/v1/doctors/${doctorId}/schedules`, {
        method: 'PATCH',
        body: JSON.stringify({ schedules: schedulesToSave }),
      });

      if (res.ok) {
        alert('Schedule saved successfully!');
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to save schedule');
      }
    } catch (error) {
      console.error('Failed to save schedule:', error);
      alert('Failed to save schedule');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddTimeOff(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch(`/v1/doctors/${doctorId}/time-off`, {
        method: 'POST',
        body: JSON.stringify({
          startDate: newTimeOff.startDate,
          endDate: newTimeOff.endDate,
          reason: newTimeOff.reason || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTimeOff(prev => [...prev, {
          id: data.id,
          startDate: data.start_date,
          endDate: data.end_date,
          reason: data.reason,
          status: data.status,
        }]);
        setNewTimeOff({ startDate: '', endDate: '', reason: '' });
        setShowTimeOffModal(false);
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to add time off');
      }
    } catch (error) {
      console.error('Failed to add time-off:', error);
      alert('Failed to add time off');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveTimeOff(id: string) {
    try {
      const res = await apiFetch(`/v1/doctors/${doctorId}/time-off/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setTimeOff(prev => prev.filter(t => t.id !== id));
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to remove time off');
      }
    } catch (error) {
      console.error('Failed to remove time-off:', error);
      alert('Failed to remove time off');
    }
  }

  function getStatusBadge() {
    if (!doctor?.complianceStatus || doctor.complianceStatus === 'compliant') {
      return <span className="status-pill status-pill-active">Active</span>;
    }
    if (doctor.complianceStatus === 'not_logged_in') {
      return <span className="status-pill status-pill-pending">Not Logged In</span>;
    }
    return <span className="status-pill status-pill-warning">Pending Signatures</span>;
  }

  if (loading) {
    return null;
  }

  if (!doctor) {
    return (
      <div className="admin-empty-state">
        <p className="admin-empty-title">Doctor not found</p>
        <Link href="/hospital/doctors" className="btn-primary mt-4">
          Back to Doctors
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1 rounded-md hover:bg-gray-100 transition-colors text-gray-500"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[#5a8ac7] flex items-center justify-center text-base font-bold text-white">
            {doctor.fullName?.charAt(0) || doctor.email.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-gray-900 truncate">
                Dr. {doctor.fullName || doctor.email}
              </h1>
              {getStatusBadge()}
            </div>
            <p className="text-xs text-gray-500 truncate">{doctor.email}</p>
          </div>

          <div className="flex items-center gap-2">
            {doctor.specialization && (
              <span className="hidden sm:inline-flex px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-medium rounded">
                {doctor.specialization}
              </span>
            )}
            {isManager && doctor.complianceStatus === 'compliant' && (
              <Link
                href={`/hospital/licenses?doctor=${doctor.userId}`}
                className="inline-flex items-center gap-1 bg-[var(--color-primary)] text-white px-2.5 py-1 rounded-md font-medium text-xs hover:bg-[var(--color-primary-dark)] transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                License
              </Link>
            )}
            {isManager && doctor.complianceStatus && doctor.complianceStatus !== 'compliant' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium rounded">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {doctor.complianceStatus === 'not_logged_in' ? 'Not logged in' : `${doctor.documentsSigned || 0}/${doctor.documentsRequired || 0} docs`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Compact Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-1">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('personal')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md font-medium text-xs transition-all ${
              activeTab === 'personal'
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Personal
          </button>
          <button
            onClick={() => setActiveTab('professional')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md font-medium text-xs transition-all ${
              activeTab === 'professional'
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            Professional
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md font-medium text-xs transition-all ${
              activeTab === 'schedule'
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Schedule
          </button>
        </div>
      </div>

      {/* Personal Tab */}
      {activeTab === 'personal' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Contact Information</span>
            {!editMode && (isManager || isOwnProfile) && (
              <button
                onClick={() => setEditMode(true)}
                className="text-xs font-medium text-[var(--color-primary)] hover:underline"
              >
                Edit
              </button>
            )}
          </div>
          <div className="p-4">
            {editMode ? (
              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Full Name</label>
                    <input
                      type="text"
                      value={formData.fullName || ''}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="form-input text-sm py-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Email</label>
                    <input
                      type="email"
                      value={formData.email || ''}
                      disabled
                      className="form-input text-sm py-1.5 bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Phone</label>
                    <PhoneInput
                      value={formData.phone || ''}
                      onChange={(value) => setFormData({ ...formData, phone: value })}
                      placeholder="Phone number"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Date of Birth</label>
                    <input
                      type="date"
                      value={formData.dateOfBirth || ''}
                      onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      className="form-input text-sm py-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Gender</label>
                    <select
                      value={formData.gender || ''}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="form-input text-sm py-1.5"
                    >
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Address</label>
                    <input
                      type="text"
                      value={formData.address || ''}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="form-input text-sm py-1.5"
                    />
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-medium text-red-600 mb-2">Emergency Contact</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Contact Name</label>
                      <input
                        type="text"
                        value={formData.emergencyContact || ''}
                        onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                        className="form-input text-sm py-1.5"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Contact Phone</label>
                      <PhoneInput
                        value={formData.emergencyPhone || ''}
                        onChange={(value) => setFormData({ ...formData, emergencyPhone: value })}
                        placeholder="Phone number"
                        className="text-sm"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] rounded-md disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase">Name</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{doctor.fullName || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase">Email</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{doctor.email}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase">Phone</p>
                    <p className="text-sm font-medium text-gray-900">{doctor.phone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase">DOB</p>
                    <p className="text-sm font-medium text-gray-900">
                      {doctor.dateOfBirth ? new Date(doctor.dateOfBirth).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase">Gender</p>
                    <p className="text-sm font-medium text-gray-900 capitalize">{doctor.gender || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase">Address</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{doctor.address || '—'}</p>
                  </div>
                </div>
                {/* Emergency Contact - Inline */}
                <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-xs font-medium text-red-600">Emergency:</span>
                  </div>
                  <span className="text-sm text-gray-700">{doctor.emergencyContact || '—'}</span>
                  <span className="text-sm text-gray-500">{doctor.emergencyPhone || '—'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Professional Tab */}
      {activeTab === 'professional' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Professional Credentials</span>
            {!editMode && (isManager || isOwnProfile) && (
              <button
                onClick={() => setEditMode(true)}
                className="text-xs font-medium text-[var(--color-primary)] hover:underline"
              >
                Edit
              </button>
            )}
          </div>
          <div className="p-4">
            {editMode ? (
              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Specialization</label>
                    <select
                      value={formData.specialization || ''}
                      onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                      className="form-input text-sm py-1.5"
                    >
                      <option value="">Select specialization</option>
                      {specializations.map((spec) => (
                        <option key={spec.id} value={spec.name}>{spec.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Qualification</label>
                    <input
                      type="text"
                      value={formData.qualification || ''}
                      onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                      className="form-input text-sm py-1.5"
                      placeholder="e.g., MBBS, MD"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">License Number</label>
                    <input
                      type="text"
                      value={formData.licenseNumber || ''}
                      onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                      className="form-input text-sm py-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Years of Experience</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.yearsOfExperience || ''}
                      onChange={(e) => setFormData({ ...formData, yearsOfExperience: parseInt(e.target.value) })}
                      className="form-input text-sm py-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Consultation Fee</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.consultationFee || ''}
                      onChange={(e) => setFormData({ ...formData, consultationFee: parseFloat(e.target.value) })}
                      className="form-input text-sm py-1.5"
                      placeholder="e.g., 500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Education</label>
                    <input
                      type="text"
                      value={formData.education || ''}
                      onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                      className="form-input text-sm py-1.5"
                      placeholder="e.g., MD Stanford"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Bio</label>
                  <textarea
                    value={formData.bio || ''}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    className="form-input text-sm py-1.5"
                    rows={2}
                    placeholder="Brief professional biography..."
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] rounded-md disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                {/* Compact Stats Row */}
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg border border-indigo-100">
                    <span className="text-[10px] text-indigo-500 uppercase">Specialization</span>
                    <span className="text-sm font-semibold text-indigo-700">{doctor.specialization || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-50 rounded-lg border border-cyan-100">
                    <span className="text-[10px] text-cyan-500 uppercase">Qualification</span>
                    <span className="text-sm font-semibold text-cyan-700">{doctor.qualification || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                    <span className="text-[10px] text-emerald-500 uppercase">Experience</span>
                    <span className="text-sm font-semibold text-emerald-700">{doctor.yearsOfExperience ? `${doctor.yearsOfExperience} yrs` : '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-lg border border-amber-100">
                    <span className="text-[10px] text-amber-500 uppercase">License</span>
                    <span className="text-sm font-semibold text-amber-700">{doctor.licenseNumber || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg border border-green-100">
                    <span className="text-[10px] text-green-500 uppercase">Fee</span>
                    <span className="text-sm font-semibold text-green-700">{doctor.consultationFee ? `$${doctor.consultationFee}` : '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                    <span className="text-[10px] text-gray-500 uppercase">Education</span>
                    <span className="text-sm font-semibold text-gray-700">{doctor.education || '—'}</span>
                  </div>
                </div>
                {/* Bio - Inline */}
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-[10px] text-gray-400 uppercase mb-1">Bio</p>
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {doctor.bio || 'No professional biography added.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Left Column: Shifts + Weekly Schedule */}
          <div className="space-y-3">
            {/* Shift Timings - Compact */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Shift Timings</span>
                <button onClick={openShiftTimingsModal} className="text-xs font-medium text-[var(--color-primary)] hover:underline">
                  Edit
                </button>
              </div>
              <div className="p-3">
                <div className="flex gap-2">
                  <div className="flex-1 px-2.5 py-2 bg-amber-50 rounded-lg border border-amber-100 text-center">
                    <p className="text-[10px] text-amber-600 uppercase font-medium">Morning</p>
                    <p className="text-xs font-bold text-amber-800">{formatTime(shiftTimings.morning.start)} - {formatTime(shiftTimings.morning.end)}</p>
                  </div>
                  <div className="flex-1 px-2.5 py-2 bg-blue-50 rounded-lg border border-blue-100 text-center">
                    <p className="text-[10px] text-blue-600 uppercase font-medium">Evening</p>
                    <p className="text-xs font-bold text-blue-800">{formatTime(shiftTimings.evening.start)} - {formatTime(shiftTimings.evening.end)}</p>
                  </div>
                  <div className="flex-1 px-2.5 py-2 bg-purple-50 rounded-lg border border-purple-100 text-center">
                    <p className="text-[10px] text-purple-600 uppercase font-medium">Night</p>
                    <p className="text-xs font-bold text-purple-800">{formatTime(shiftTimings.night.start)} - {formatTime(shiftTimings.night.end)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Weekly Schedule - Compact */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Weekly Schedule</span>
                <button
                  onClick={handleSaveSchedule}
                  disabled={saving}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] rounded-md disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
              <div className="p-2">
                <div className="space-y-1">
                  {schedule.map((day, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${day.isWorking ? 'bg-green-50' : 'bg-gray-50'}`}
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${day.isWorking ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                      <span className={`text-xs font-medium w-12 ${day.isWorking ? 'text-gray-900' : 'text-gray-400'}`}>
                        {DAYS_SHORT[idx]}
                      </span>
                      <div className="flex gap-1 flex-1">
                        <label className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-all ${
                          day.morningShift ? 'bg-amber-200 text-amber-800' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}>
                          <input type="checkbox" checked={day.morningShift} onChange={(e) => handleScheduleChange(idx, 'morningShift', e.target.checked)} className="sr-only" />
                          AM
                        </label>
                        <label className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-all ${
                          day.eveningShift ? 'bg-blue-200 text-blue-800' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}>
                          <input type="checkbox" checked={day.eveningShift} onChange={(e) => handleScheduleChange(idx, 'eveningShift', e.target.checked)} className="sr-only" />
                          PM
                        </label>
                        <label className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-all ${
                          day.nightShift ? 'bg-purple-200 text-purple-800' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}>
                          <input type="checkbox" checked={day.nightShift} onChange={(e) => handleScheduleChange(idx, 'nightShift', e.target.checked)} className="sr-only" />
                          NT
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Appointment Duration Setting */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-700">Appointment Duration</span>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-3">
                  <select
                    value={appointmentDuration}
                    onChange={(e) => handleSaveAppointmentDuration(parseInt(e.target.value))}
                    disabled={savingDuration}
                    className="form-input text-sm py-1.5 w-36"
                  >
                    <option value={15}>15 minutes</option>
                    <option value={20}>20 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>60 minutes</option>
                  </select>
                  {savingDuration && (
                    <span className="text-xs text-gray-500">Saving...</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Duration for each appointment slot when generating schedules
                </p>
              </div>
            </div>

            {/* Time Off List - Compact */}
            {timeOff.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-700">Time Off ({timeOff.length})</span>
                </div>
                <div className="p-2 space-y-1">
                  {timeOff.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-2 py-1.5 bg-red-50 rounded-md">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                        <span className="text-xs text-gray-700">
                          {parseDateString(item.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {item.startDate !== item.endDate && ` - ${parseDateString(item.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                        </span>
                        {item.reason && <span className="text-[10px] text-gray-500">({item.reason})</span>}
                      </div>
                      <button onClick={() => handleRemoveTimeOff(item.id)} className="text-gray-400 hover:text-red-500">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Calendar */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => navigateMonth('prev')} className="p-1 rounded hover:bg-gray-100">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm font-medium text-gray-700">{formatMonthYear(calendarDate)}</span>
                <button onClick={() => navigateMonth('next')} className="p-1 rounded hover:bg-gray-100">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <button
                onClick={() => setShowTimeOffModal(true)}
                className="px-2 py-1 text-xs font-medium text-white bg-rose-500 hover:bg-rose-600 rounded-md"
              >
                + Time Off
              </button>
            </div>
            <div className="p-2">
              <div className="grid grid-cols-7 gap-px bg-gray-200 rounded overflow-hidden">
                {DAYS_SHORT.map((day) => (
                  <div key={day} className="bg-gray-50 py-1.5 text-center text-[10px] font-semibold text-gray-500 uppercase">
                    {day.charAt(0)}
                  </div>
                ))}
                {getCalendarDays(calendarDate).map((day, index) => {
                  const isTimeOffDay = day ? isDateInTimeOff(day) : false;
                  const isTodayDay = day ? isToday(day) : false;
                  return (
                    <div
                      key={index}
                      className={`p-1 min-h-[36px] text-center ${!day ? 'bg-gray-50' : 'bg-white'} ${isTimeOffDay ? 'bg-red-50' : ''}`}
                    >
                      {day && (
                        <span className={`text-xs inline-flex items-center justify-center w-6 h-6 rounded-full ${
                          isTodayDay ? 'bg-[var(--color-primary)] text-white font-bold ring-2 ring-[var(--color-primary-light)]' : isTimeOffDay ? 'text-red-600 font-medium' : 'text-gray-700'
                        }`}>
                          {day}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-[var(--color-primary)]"></div>
                    <span>Today</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded bg-red-100 border border-red-200"></div>
                    <span>Time Off</span>
                  </div>
                </div>
                <span className="text-[10px] text-gray-400 font-medium">{timezoneLabel}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Time Off Modal */}
      {showTimeOffModal && (
        <div className="admin-modal-overlay" onClick={() => setShowTimeOffModal(false)}>
          <div className="admin-modal max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h2 className="admin-modal-title">Add Time Off</h2>
                <p className="admin-modal-subtitle">Schedule unavailable dates</p>
              </div>
              <button
                onClick={() => setShowTimeOffModal(false)}
                className="admin-modal-close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddTimeOff}>
              <div className="admin-modal-body space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label form-label-required">Start Date</label>
                    <input
                      type="date"
                      value={newTimeOff.startDate}
                      onChange={(e) => setNewTimeOff({ ...newTimeOff, startDate: e.target.value })}
                      className="form-input"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label form-label-required">End Date</label>
                    <input
                      type="date"
                      value={newTimeOff.endDate}
                      onChange={(e) => setNewTimeOff({ ...newTimeOff, endDate: e.target.value })}
                      className="form-input"
                      min={newTimeOff.startDate}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Reason</label>
                  <select
                    value={newTimeOff.reason}
                    onChange={(e) => setNewTimeOff({ ...newTimeOff, reason: e.target.value })}
                    className="form-input"
                  >
                    <option value="">Select a reason</option>
                    <option value="Vacation">Vacation</option>
                    <option value="Sick Leave">Sick Leave</option>
                    <option value="Personal">Personal</option>
                    <option value="Conference">Conference</option>
                    <option value="Training">Training</option>
                    <option value="Family Emergency">Family Emergency</option>
                    <option value="Medical Leave">Medical Leave</option>
                    <option value="Public Holiday">Public Holiday</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowTimeOffModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Add Time Off
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shift Timings Modal */}
      {showShiftTimingsModal && (
        <div className="admin-modal-overlay" onClick={() => setShowShiftTimingsModal(false)}>
          <div className="admin-modal max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h2 className="admin-modal-title">Edit Shift Timings</h2>
                <p className="admin-modal-subtitle">Customize the start and end times for each shift</p>
              </div>
              <button
                onClick={() => setShowShiftTimingsModal(false)}
                className="admin-modal-close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="admin-modal-body space-y-6">
              {/* Morning Shift */}
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span className="font-semibold text-amber-800">Morning Shift</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label text-amber-700">Start Time</label>
                    <input
                      type="time"
                      value={editingShiftTimings.morning.start}
                      onChange={(e) => handleShiftTimingChange('morning', 'start', e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label text-amber-700">End Time</label>
                    <input
                      type="time"
                      value={editingShiftTimings.morning.end}
                      onChange={(e) => handleShiftTimingChange('morning', 'end', e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              {/* Evening Shift */}
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span className="font-semibold text-blue-800">Evening Shift</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label text-blue-700">Start Time</label>
                    <input
                      type="time"
                      value={editingShiftTimings.evening.start}
                      onChange={(e) => handleShiftTimingChange('evening', 'start', e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label text-blue-700">End Time</label>
                    <input
                      type="time"
                      value={editingShiftTimings.evening.end}
                      onChange={(e) => handleShiftTimingChange('evening', 'end', e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              {/* Night Shift */}
              <div className="p-4 rounded-lg bg-purple-50 border border-purple-200">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                  <span className="font-semibold text-purple-800">Night Shift</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label text-purple-700">Start Time</label>
                    <input
                      type="time"
                      value={editingShiftTimings.night.start}
                      onChange={(e) => handleShiftTimingChange('night', 'start', e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label text-purple-700">End Time</label>
                    <input
                      type="time"
                      value={editingShiftTimings.night.end}
                      onChange={(e) => handleShiftTimingChange('night', 'end', e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>
                <p className="text-xs text-purple-600 mt-2">
                  Note: Night shift can span across midnight (e.g., 10:00 PM to 6:00 AM)
                </p>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button
                type="button"
                onClick={() => setShowShiftTimingsModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveShiftTimings}
                className="btn-primary"
              >
                Save Timings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
