'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../../components/AuthProvider';
import { apiFetch } from '../../../../lib/api';
import { useHospitalTimezone } from '../../../../hooks/useHospitalTimezone';
import PhoneInput from '../../../../components/PhoneInput';
import { COUNTRIES, getCountryByCode } from '../../../../lib/countries';
import { getStatesForCountry } from '../../../../lib/countryStateData';

interface DoctorProfile {
  id: string;
  userId: string;
  email: string;
  displayName?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  emergencyRelation?: string;
  specialization?: string;
  qualification?: string;
  licenseNumber?: string;
  yearsOfExperience?: number;
  consultationFee?: number;
  education?: string;
  bio?: string;
  nationalId?: string;
  employmentType?: string;
  department?: string;
  appointmentDurationMinutes?: number;
  complianceStatus?: 'compliant' | 'pending_signatures' | 'not_logged_in';
  documentsRequired?: number;
  documentsSigned?: number;
  createdAt: string;
}

const DEPARTMENTS = [
  'Emergency Medicine', 'Internal Medicine', 'Surgery', 'Pediatrics',
  'Obstetrics & Gynecology', 'Cardiology', 'Neurology', 'Orthopedics',
  'Radiology', 'Pathology', 'Anesthesiology', 'Dermatology',
  'Ophthalmology', 'ENT', 'Urology', 'Psychiatry', 'Oncology',
  'Pulmonology', 'Gastroenterology', 'Nephrology', 'Endocrinology',
  'Rheumatology', 'ICU', 'General Practice', 'Rehabilitation',
];

const EMERGENCY_RELATIONS = [
  'Spouse', 'Parent', 'Sibling', 'Child', 'Friend', 'Relative', 'Other',
];

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
}

interface ShiftTiming {
  label: string;
  start: string;
  end: string;
}

interface ShiftTimings {
  morning: ShiftTiming;
  evening: ShiftTiming;
  night: ShiftTiming;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DEFAULT_SHIFTS: ShiftTimings = {
  morning: { label: 'Morning', start: '06:00', end: '14:00' },
  evening: { label: 'Evening', start: '14:00', end: '22:00' },
  night: { label: 'Night', start: '22:00', end: '06:00' },
};

function formatTime(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function StatusDot({ status }: { status?: string }) {
  if (!status || status === 'compliant') {
    return <span className="w-2 h-2 rounded-full bg-emerald-500" />;
  }
  if (status === 'not_logged_in') {
    return <span className="w-2 h-2 rounded-full bg-slate-400" />;
  }
  return <span className="w-2 h-2 rounded-full bg-amber-500" />;
}

function getStatusLabel(status?: string) {
  if (!status || status === 'compliant') return 'Active';
  if (status === 'not_logged_in') return 'Not Logged In';
  return 'Pending Signatures';
}

export default function DoctorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { currentHospital, user, profile } = useAuth();
  const { timezoneLabel, getCurrentTime } = useHospitalTimezone();

  const paramDoctorId = params.doctorId as string;
  const doctorId = paramDoctorId === 'me' ? user?.id || '' : paramDoctorId;
  const isOwnProfile = paramDoctorId === 'me' || doctorId === user?.id;

  const userRole = profile?.isSuperAdmin ? 'SUPER_ADMIN' : (currentHospital?.role || 'STAFF');
  const isManager = userRole === 'SUPER_ADMIN' || userRole === 'HOSPITAL_MANAGER';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'schedule'>('overview');
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<DoctorProfile>>({});

  const [schedule, setSchedule] = useState<DoctorSchedule[]>(
    DAYS_OF_WEEK.map((_, idx) => ({
      dayOfWeek: idx,
      isWorking: idx >= 1 && idx <= 5,
      morningShift: idx >= 1 && idx <= 5,
      eveningShift: false,
      nightShift: false,
    }))
  );
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [showTimeOffModal, setShowTimeOffModal] = useState(false);
  const [newTimeOff, setNewTimeOff] = useState({ startDate: '', endDate: '', reason: '' });

  const [calendarDate, setCalendarDate] = useState(new Date());
  const [shiftTimings, setShiftTimings] = useState<ShiftTimings>(DEFAULT_SHIFTS);
  const [showShiftTimingsModal, setShowShiftTimingsModal] = useState(false);
  const [editingShiftTimings, setEditingShiftTimings] = useState<ShiftTimings>(DEFAULT_SHIFTS);
  const [appointmentDuration, setAppointmentDuration] = useState(30);
  const [savingDuration, setSavingDuration] = useState(false);
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
      if (res.ok) setSpecializations(await res.json());
    } catch (error) {
      console.error('Failed to fetch specializations:', error);
    }
  }

  async function fetchDoctorProfile() {
    try {
      const membersRes = await apiFetch('/v1/hospitals/members/compliance');
      let doctorMember: any = null;
      if (membersRes.ok) {
        const members = await membersRes.json();
        doctorMember = members.find((m: any) => m.userId === doctorId && m.role === 'DOCTOR');
      }

      const profileRes = await apiFetch(`/v1/doctors/${doctorId}/profile`);
      let profileData: any = null;
      if (profileRes.ok) profileData = await profileRes.json();

      if (doctorMember || profileData) {
        const rawFullName = doctorMember?.fullName || profileData?.fullName || '';
        const nameParts = rawFullName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const doctorData: DoctorProfile = {
          id: profileData?.id || doctorMember?.id || '',
          userId: doctorId,
          email: doctorMember?.email || profileData?.email || '',
          displayName: rawFullName,
          fullName: rawFullName,
          firstName,
          lastName,
          phone: profileData?.phone || '',
          dateOfBirth: profileData?.dateOfBirth || '',
          gender: profileData?.gender || '',
          address: profileData?.address || '',
          addressLine1: profileData?.addressLine1 || '',
          addressLine2: profileData?.addressLine2 || '',
          city: profileData?.city || '',
          state: profileData?.state || '',
          postalCode: profileData?.postalCode || '',
          country: profileData?.country || '',
          emergencyContact: profileData?.emergencyContact || '',
          emergencyPhone: profileData?.emergencyPhone || '',
          emergencyRelation: profileData?.emergencyRelation || '',
          specialization: profileData?.specialization || '',
          qualification: profileData?.qualification || '',
          licenseNumber: profileData?.licenseNumber || '',
          yearsOfExperience: profileData?.yearsOfExperience,
          consultationFee: profileData?.consultationFee,
          education: profileData?.education || '',
          bio: profileData?.bio || '',
          nationalId: profileData?.nationalId || '',
          employmentType: profileData?.employmentType || '',
          department: profileData?.department || '',
          appointmentDurationMinutes: profileData?.appointmentDurationMinutes || 30,
          complianceStatus: doctorMember?.complianceStatus,
          documentsRequired: doctorMember?.documentsRequired,
          documentsSigned: doctorMember?.documentsSigned,
          createdAt: doctorMember?.createdAt || profileData?.createdAt || '',
        };
        setDoctor(doctorData);
        setFormData(doctorData);
        if (profileData?.appointmentDurationMinutes) setAppointmentDuration(profileData.appointmentDurationMinutes);
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
        const rawData = await res.json();
        const data = Array.isArray(rawData) ? rawData : (rawData.schedules || []);
        if (data && data.length > 0) {
          const newSchedule = DAYS_OF_WEEK.map((_, idx) => {
            const dbSchedule = data.find((s: any) => s.day_of_week === idx);
            if (dbSchedule && dbSchedule.is_working) {
              const startHour = parseInt(dbSchedule.shift_start?.split(':')[0] || '0');
              const endHour = parseInt(dbSchedule.shift_end?.split(':')[0] || '0');
              return {
                dayOfWeek: idx,
                isWorking: true,
                morningShift: startHour < 14 && endHour > 6,
                eveningShift: startHour < 22 && endHour > 14,
                nightShift: endHour <= 6 || startHour >= 22,
              };
            }
            return { dayOfWeek: idx, isWorking: false, morningShift: false, eveningShift: false, nightShift: false };
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

    // Validate mandatory fields
    if (!formData.firstName?.trim() || !formData.lastName?.trim()) {
      alert('First Name and Last Name are required');
      return;
    }
    if (!formData.phone?.trim()) {
      alert('Phone number is required');
      return;
    }

    setSaving(true);
    try {
      const fullName = `Dr ${formData.firstName?.trim()} ${formData.lastName?.trim()}`.trim();

      const res = await apiFetch(`/v1/doctors/${doctorId}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName,
          phone: formData.phone || null,
          dateOfBirth: formData.dateOfBirth || null,
          gender: formData.gender || null,
          address: formData.address || null,
          addressLine1: formData.addressLine1 || null,
          addressLine2: formData.addressLine2 || null,
          city: formData.city || null,
          state: formData.state || null,
          postalCode: formData.postalCode || null,
          country: formData.country || null,
          emergencyContact: formData.emergencyContact || null,
          emergencyPhone: formData.emergencyPhone || null,
          emergencyRelation: formData.emergencyRelation || null,
          specialization: formData.specialization || null,
          qualification: formData.qualification || null,
          licenseNumber: formData.licenseNumber || null,
          yearsOfExperience: formData.yearsOfExperience || null,
          consultationFee: formData.consultationFee || null,
          education: formData.education || null,
          bio: formData.bio || null,
          nationalId: formData.nationalId || null,
          employmentType: formData.employmentType || null,
          department: formData.department || null,
        }),
      });

      if (res.ok) {
        const updatedData = { ...formData, fullName, displayName: fullName };
        setDoctor({ ...doctor!, ...updatedData });
        setEditMode(false);
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
    } finally {
      setSavingDuration(false);
    }
  }

  function handleScheduleChange(dayIndex: number, field: string, value: any) {
    setSchedule(prev => prev.map((day, idx) => {
      if (idx !== dayIndex) return day;
      if (field === 'isWorking') {
        if (!value) return { ...day, isWorking: false, morningShift: false, eveningShift: false, nightShift: false };
        return { ...day, isWorking: value };
      }
      if (field === 'morningShift' || field === 'eveningShift' || field === 'nightShift') {
        const updated = { ...day, [field]: value };
        if (value) updated.isWorking = true;
        if (!updated.morningShift && !updated.eveningShift && !updated.nightShift) updated.isWorking = false;
        return updated;
      }
      return day;
    }));
  }

  function getCalendarDays(date: Date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const days: (number | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(i);
    return days;
  }

  function parseDateString(dateStr: string): Date {
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

  function navigateMonth(direction: 'prev' | 'next') {
    setCalendarDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + (direction === 'prev' ? -1 : 1));
      return newDate;
    });
  }

  function isToday(day: number) {
    const today = getCurrentTime();
    return day === today.getDate() && calendarDate.getMonth() === today.getMonth() && calendarDate.getFullYear() === today.getFullYear();
  }

  async function handleSaveSchedule() {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const schedulesToSave = schedule.map((day) => {
        if (!day.isWorking || (!day.morningShift && !day.eveningShift && !day.nightShift)) {
          return { dayOfWeek: day.dayOfWeek, isWorking: false, shiftStart: null, shiftEnd: null };
        }
        let shiftStart: string | null = null;
        let shiftEnd: string | null = null;
        if (day.morningShift) { shiftStart = shiftTimings.morning.start + ':00'; shiftEnd = shiftTimings.morning.end + ':00'; }
        if (day.eveningShift) { if (!shiftStart) shiftStart = shiftTimings.evening.start + ':00'; shiftEnd = shiftTimings.evening.end + ':00'; }
        if (day.nightShift) { if (!shiftStart) shiftStart = shiftTimings.night.start + ':00'; shiftEnd = shiftTimings.night.end + ':00'; }
        return { dayOfWeek: day.dayOfWeek, isWorking: true, shiftStart, shiftEnd };
      });

      const res = await apiFetch(`/v1/doctors/${doctorId}/schedules`, {
        method: 'PATCH',
        body: JSON.stringify({ schedules: schedulesToSave, shiftTimingConfig: shiftTimings }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        // Refetch schedules to ensure UI is in sync
        await fetchSchedules();
        // Invalidate dashboard cache so it shows updated data
        queryClient.invalidateQueries({ queryKey: ['hospital', 'members', 'compliance'] });
        setTimeout(() => setSaveSuccess(false), 2000);
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
        body: JSON.stringify({ startDate: newTimeOff.startDate, endDate: newTimeOff.endDate, reason: newTimeOff.reason || undefined }),
      });

      if (res.ok) {
        const data = await res.json();
        setTimeOff(prev => [...prev, { id: data.id, startDate: data.start_date, endDate: data.end_date, reason: data.reason, status: data.status }]);
        setNewTimeOff({ startDate: '', endDate: '', reason: '' });
        setShowTimeOffModal(false);
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to add time off');
      }
    } catch (error) {
      console.error('Failed to add time-off:', error);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveTimeOff(id: string) {
    try {
      const res = await apiFetch(`/v1/doctors/${doctorId}/time-off/${id}`, { method: 'DELETE' });
      if (res.ok) setTimeOff(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      console.error('Failed to remove time-off:', error);
    }
  }

  function handleShiftTimingChange(shift: keyof ShiftTimings, field: 'start' | 'end', value: string) {
    setEditingShiftTimings(prev => ({ ...prev, [shift]: { ...prev[shift], [field]: value } }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-700">Doctor not found</p>
        <Link href="/hospital/doctors" className="mt-4 px-4 py-2 text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 transition-colors">
          Back to Doctors
        </Link>
      </div>
    );
  }

  const workingDays = schedule.filter(d => d.isWorking).length;

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-start gap-4">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 mt-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="w-14 h-14 rounded-xl bg-navy-100 flex items-center justify-center text-xl font-semibold text-navy-600 flex-shrink-0">
            {doctor.fullName?.charAt(0) || doctor.email.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-slate-900">
                {(doctor.fullName?.startsWith('Dr ') || doctor.fullName?.startsWith('Dr. '))
                  ? doctor.fullName
                  : `Dr. ${doctor.fullName || doctor.email.split('@')[0]}`}
              </h1>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">
                <StatusDot status={doctor.complianceStatus} />
                <span className="text-xs font-medium text-slate-600">{getStatusLabel(doctor.complianceStatus)}</span>
              </div>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{doctor.email}</p>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {doctor.specialization && (
                <span className="text-xs font-medium text-navy-600 bg-navy-50 px-2.5 py-1 rounded-lg">{doctor.specialization}</span>
              )}
              {doctor.qualification && (
                <span className="text-xs text-slate-500">{doctor.qualification}</span>
              )}
              {doctor.yearsOfExperience && (
                <span className="text-xs text-slate-500">{doctor.yearsOfExperience} yrs exp</span>
              )}
              {doctor.consultationFee && (
                <span className="text-xs font-medium text-emerald-600">${doctor.consultationFee}</span>
              )}
            </div>
          </div>

          {isManager && doctor.complianceStatus === 'compliant' && (
            <Link
              href={`/hospital/billing?doctor=${doctor.userId}`}
              className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Assign License
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'overview' ? 'border-navy-600 text-navy-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'schedule' ? 'border-navy-600 text-navy-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Schedule
          <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded-md">{workingDays} days</span>
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Personal Information */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-700">Personal Information</h3>
              {!editMode && (isManager || isOwnProfile) && (
                <button onClick={() => setEditMode(true)} className="text-sm font-medium text-navy-600 hover:text-navy-700">Edit</button>
              )}
            </div>
            <div className="p-4">
              {editMode ? (
                <form onSubmit={handleSaveProfile} className="space-y-3">
                  {/* Name fields with Dr prefix */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">First Name <span className="text-red-500">*</span></label>
                      <div className="flex">
                        <span className="inline-flex items-center px-2.5 text-sm font-medium text-slate-600 bg-slate-100 border border-r-0 border-slate-200 rounded-l-lg">Dr</span>
                        <input type="text" required value={formData.firstName || ''} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" placeholder="First name" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Last Name <span className="text-red-500">*</span></label>
                      <input type="text" required value={formData.lastName || ''} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" placeholder="Last name" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Phone <span className="text-red-500">*</span></label>
                      <PhoneInput value={formData.phone || ''} onChange={(value) => setFormData({ ...formData, phone: value })} placeholder="Phone number" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">National ID</label>
                      <input type="text" value={formData.nationalId || ''} onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" placeholder="SSN / Aadhaar / NIN" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
                      <input type="date" value={formData.dateOfBirth || ''} onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                      <select value={formData.gender || ''} onChange={(e) => setFormData({ ...formData, gender: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 bg-white">
                        <option value="">Select</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Address fields */}
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-sm font-medium text-slate-600 mb-2">Address</p>
                    <div className="space-y-2">
                      <input type="text" placeholder="Address Line 1" value={formData.addressLine1 || ''} onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                      <input type="text" placeholder="Address Line 2 (Apt, Suite, etc.)" value={formData.addressLine2 || ''} onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select value={formData.country || ''} onChange={(e) => setFormData({ ...formData, country: e.target.value, state: '' })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 bg-white">
                          <option value="">Country</option>
                          {COUNTRIES.map((c) => (<option key={c.code} value={c.code}>{c.name}</option>))}
                        </select>
                        {formData.country && getStatesForCountry(formData.country).length > 0 ? (
                          <select value={formData.state || ''} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 bg-white">
                            <option value="">State</option>
                            {getStatesForCountry(formData.country).map((s) => (<option key={s.code} value={s.code}>{s.name}</option>))}
                          </select>
                        ) : (
                          <input type="text" placeholder="State / Province" value={formData.state || ''} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input type="text" placeholder="City" value={formData.city || ''} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                        <input type="text" placeholder="Postal / ZIP Code" value={formData.postalCode || ''} onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                      </div>
                    </div>
                  </div>

                  {/* Emergency Contact */}
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-sm font-medium text-red-600 mb-2">Emergency Contact</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input type="text" placeholder="Contact Name" value={formData.emergencyContact || ''} onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                      <select value={formData.emergencyRelation || ''} onChange={(e) => setFormData({ ...formData, emergencyRelation: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 bg-white">
                        <option value="">Relation</option>
                        {EMERGENCY_RELATIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
                      </select>
                      <PhoneInput value={formData.emergencyPhone || ''} onChange={(value) => setFormData({ ...formData, emergencyPhone: value })} placeholder="Contact Phone" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => { setEditMode(false); setFormData(doctor!); }} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 disabled:opacity-50 transition-colors">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-0.5">Email</p>
                      <p className="text-sm text-slate-900">{doctor.email}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-0.5">Phone</p>
                      <p className="text-sm text-slate-900">{doctor.phone || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-0.5">National ID</p>
                      <p className="text-sm text-slate-900">{doctor.nationalId || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-0.5">Date of Birth</p>
                      <p className="text-sm text-slate-900">{doctor.dateOfBirth ? new Date(doctor.dateOfBirth).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-0.5">Gender</p>
                      <p className="text-sm text-slate-900 capitalize">{doctor.gender || '—'}</p>
                    </div>
                  </div>
                  {/* Address display */}
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-sm font-medium text-slate-500 mb-0.5">Address</p>
                    <p className="text-sm text-slate-900">
                      {doctor.addressLine1 ? (
                        <>
                          {doctor.addressLine1}
                          {doctor.addressLine2 && <>, {doctor.addressLine2}</>}
                          {(doctor.city || doctor.state || doctor.postalCode) && <br />}
                          {doctor.city}{doctor.city && doctor.state ? ', ' : ''}{doctor.state} {doctor.postalCode}
                          {doctor.country && <><br />{getCountryByCode(doctor.country)?.name || doctor.country}</>}
                        </>
                      ) : (
                        doctor.address || '—'
                      )}
                    </p>
                  </div>
                  {/* Emergency Contact display */}
                  {(doctor.emergencyContact || doctor.emergencyPhone) && (
                    <div className="pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="text-sm font-medium text-red-600">Emergency:</span>
                        <span className="text-sm text-slate-700">{doctor.emergencyContact || '—'}</span>
                        {doctor.emergencyRelation && <span className="text-xs text-slate-400">({doctor.emergencyRelation})</span>}
                        <span className="text-sm text-slate-500">{doctor.emergencyPhone}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Professional Information */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-700">Professional Details</h3>
              {!editMode && (isManager || isOwnProfile) && (
                <button onClick={() => setEditMode(true)} className="text-sm font-medium text-navy-600 hover:text-navy-700">Edit</button>
              )}
            </div>
            <div className="p-4">
              {editMode ? (
                <form onSubmit={handleSaveProfile} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Specialization</label>
                      <select value={formData.specialization || ''} onChange={(e) => setFormData({ ...formData, specialization: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 bg-white">
                        <option value="">Select</option>
                        {specializations.map((spec) => (<option key={spec.id} value={spec.name}>{spec.name}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                      <select value={formData.department || ''} onChange={(e) => setFormData({ ...formData, department: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 bg-white">
                        <option value="">Select Department</option>
                        {DEPARTMENTS.map((d) => (<option key={d} value={d}>{d}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Employment Type</label>
                      <select value={formData.employmentType || ''} onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 bg-white">
                        <option value="">Select</option>
                        <option value="Full-time">Full-time</option>
                        <option value="Visiting">Visiting</option>
                        <option value="Consultant">Consultant</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Qualification</label>
                      <input type="text" value={formData.qualification || ''} onChange={(e) => setFormData({ ...formData, qualification: e.target.value })} placeholder="e.g., MBBS, MD" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">License Number</label>
                      <input type="text" value={formData.licenseNumber || ''} onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Experience (years)</label>
                      <input type="number" min="0" value={formData.yearsOfExperience || ''} onChange={(e) => setFormData({ ...formData, yearsOfExperience: parseInt(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Consultation Fee ($)</label>
                      <input type="number" min="0" value={formData.consultationFee || ''} onChange={(e) => setFormData({ ...formData, consultationFee: parseFloat(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Education</label>
                      <input type="text" value={formData.education || ''} onChange={(e) => setFormData({ ...formData, education: e.target.value })} placeholder="e.g., MD Stanford" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Bio</label>
                    <textarea value={formData.bio || ''} onChange={(e) => setFormData({ ...formData, bio: e.target.value })} rows={2} placeholder="Brief professional biography..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 resize-none" />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => { setEditMode(false); setFormData(doctor!); }} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 disabled:opacity-50 transition-colors">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-0.5">Specialization</p>
                      <p className="text-sm text-slate-900">{doctor.specialization || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-0.5">Department</p>
                      <p className="text-sm text-slate-900">{doctor.department || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-0.5">Employment Type</p>
                      <p className="text-sm text-slate-900">{doctor.employmentType || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-0.5">Qualification</p>
                      <p className="text-sm text-slate-900">{doctor.qualification || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-0.5">License Number</p>
                      <p className="text-sm text-slate-900">{doctor.licenseNumber || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-0.5">Experience</p>
                      <p className="text-sm text-slate-900">{doctor.yearsOfExperience ? `${doctor.yearsOfExperience} years` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-0.5">Consultation Fee</p>
                      <p className="text-sm text-slate-900">{doctor.consultationFee ? `$${doctor.consultationFee}` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-0.5">Education</p>
                      <p className="text-sm text-slate-900">{doctor.education || '—'}</p>
                    </div>
                  </div>
                  {doctor.bio && (
                    <div className="pt-3 border-t border-slate-100">
                      <p className="text-sm font-medium text-slate-500 mb-0.5">Bio</p>
                      <p className="text-sm text-slate-600">{doctor.bio}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Header with save button */}
          <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium text-slate-700">Weekly Schedule</h3>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-semibold">AM</span>
                <span className="text-slate-400">{formatTime(shiftTimings.morning.start)}-{formatTime(shiftTimings.morning.end)}</span>
                <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold">AFT</span>
                <span className="text-slate-400">{formatTime(shiftTimings.evening.start)}-{formatTime(shiftTimings.evening.end)}</span>
                <span className="px-1.5 py-0.5 rounded bg-navy-700 text-white font-semibold">NT</span>
                <span className="text-slate-400">{formatTime(shiftTimings.night.start)}-{formatTime(shiftTimings.night.end)}</span>
                <button onClick={() => { setEditingShiftTimings(shiftTimings); setShowShiftTimingsModal(true); }} className="text-navy-600 hover:underline ml-1">Edit</button>
              </div>
            </div>
            <button onClick={handleSaveSchedule} disabled={saving} className={`px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50 transition-colors ${saveSuccess ? 'bg-green-600 hover:bg-green-700' : 'bg-navy-600 hover:bg-navy-700'}`}>
              {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Schedule'}
            </button>
          </div>

          <div className="flex">
            {/* Left: Compact Schedule Grid */}
            <div className="flex-1 p-3 border-r border-slate-200">
              <div className="grid grid-cols-7 gap-1.5">
                {schedule.map((day, idx) => (
                  <div key={idx} className={`rounded-lg p-2 text-center transition-all ${day.isWorking ? 'bg-gradient-to-b from-emerald-50 to-green-50 border border-emerald-200' : 'bg-slate-50 border border-slate-200'}`}>
                    <p className={`text-[11px] font-bold ${day.isWorking ? 'text-emerald-700' : 'text-slate-400'}`}>{DAYS_SHORT[idx]}</p>
                    <div className="mt-1.5 flex flex-col gap-1">
                      {['morning', 'evening', 'night'].map((shift) => {
                        const isActive = day[`${shift}Shift` as keyof DoctorSchedule] as boolean;
                        const shiftConfig = {
                          morning: { label: 'AM', active: 'bg-yellow-100 text-yellow-700 border-yellow-200', inactive: 'bg-white text-slate-300 border-slate-200' },
                          evening: { label: 'AFT', active: 'bg-orange-100 text-orange-700 border-orange-200', inactive: 'bg-white text-slate-300 border-slate-200' },
                          night: { label: 'NT', active: 'bg-navy-700 text-white border-navy-600', inactive: 'bg-white text-slate-300 border-slate-200' },
                        };
                        const cfg = shiftConfig[shift as keyof typeof shiftConfig];
                        return (
                          <label key={shift} className={`px-1.5 py-1 rounded text-[10px] font-bold cursor-pointer transition-all border ${isActive ? cfg.active : cfg.inactive} hover:opacity-80`}>
                            <input type="checkbox" checked={isActive} onChange={(e) => handleScheduleChange(idx, `${shift}Shift`, e.target.checked)} className="sr-only" />
                            {cfg.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Appointment Duration - Inline */}
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span className="text-xs font-medium text-slate-600">Appointment Duration</span>
                </div>
                <select value={appointmentDuration} onChange={(e) => handleSaveAppointmentDuration(parseInt(e.target.value))} disabled={savingDuration} className="px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500">
                  <option value={15}>15 min</option>
                  <option value={20}>20 min</option>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                </select>
              </div>
            </div>

            {/* Right: Compact Calendar + Time Off */}
            <div className="w-64 p-3 flex flex-col">
              {/* Mini Calendar Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1">
                  <button onClick={() => navigateMonth('prev')} className="p-0.5 rounded hover:bg-slate-100 transition-colors">
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="text-xs font-semibold text-slate-700">{calendarDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                  <button onClick={() => navigateMonth('next')} className="p-0.5 rounded hover:bg-slate-100 transition-colors">
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
                <button onClick={() => setShowTimeOffModal(true)} className="px-2 py-0.5 text-[10px] font-medium text-white bg-rose-500 rounded hover:bg-rose-600 transition-colors">+ Leave</button>
              </div>

              {/* Compact Calendar Grid */}
              <div className="grid grid-cols-7 gap-0.5">
                {DAYS_SHORT.map((day) => (
                  <div key={day} className="text-center text-[9px] font-medium text-slate-400 py-0.5">{day.charAt(0)}</div>
                ))}
                {getCalendarDays(calendarDate).map((day, index) => {
                  const isTimeOffDay = day ? isDateInTimeOff(day) : false;
                  const isTodayDay = day ? isToday(day) : false;
                  return (
                    <div key={index} className={`aspect-square flex items-center justify-center text-[10px] ${!day ? '' : isTimeOffDay ? 'bg-red-50 rounded' : ''}`}>
                      {day && (
                        <span className={`w-5 h-5 flex items-center justify-center rounded-full ${
                          isTodayDay ? 'bg-navy-600 text-white font-bold' : isTimeOffDay ? 'text-red-500 font-semibold' : 'text-slate-600'
                        }`}>{day}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100 text-[9px] text-slate-500">
                <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-navy-600" />Today</div>
                <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded bg-red-300" />Leave</div>
                <span className="ml-auto text-slate-400">{timezoneLabel}</span>
              </div>

              {/* Time Off List - Compact */}
              {timeOff.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-100 flex-1">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1.5">Scheduled Leave ({timeOff.length})</p>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {timeOff.map((item) => (
                      <div key={item.id} className="flex items-center justify-between px-2 py-1 bg-red-50/70 rounded text-[10px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-1 h-1 bg-red-500 rounded-full flex-shrink-0" />
                          <span className="text-slate-700 truncate">
                            {parseDateString(item.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {item.startDate !== item.endDate && ` - ${parseDateString(item.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                          </span>
                        </div>
                        <button onClick={() => handleRemoveTimeOff(item.id)} className="p-0.5 text-slate-400 hover:text-red-500 transition-colors">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Time Off Modal */}
      {showTimeOffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowTimeOffModal(false)}>
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Add Time Off</h2>
                <p className="text-xs text-slate-500 mt-0.5">Schedule unavailable dates</p>
              </div>
              <button onClick={() => setShowTimeOffModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleAddTimeOff} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Start Date <span className="text-red-500">*</span></label>
                  <input type="date" value={newTimeOff.startDate} onChange={(e) => setNewTimeOff({ ...newTimeOff, startDate: e.target.value })} required className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">End Date <span className="text-red-500">*</span></label>
                  <input type="date" value={newTimeOff.endDate} onChange={(e) => setNewTimeOff({ ...newTimeOff, endDate: e.target.value })} min={newTimeOff.startDate} required className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Reason</label>
                <select value={newTimeOff.reason} onChange={(e) => setNewTimeOff({ ...newTimeOff, reason: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500">
                  <option value="">Select reason</option>
                  <option value="Vacation">Vacation</option>
                  <option value="Sick Leave">Sick Leave</option>
                  <option value="Personal">Personal</option>
                  <option value="Conference">Conference</option>
                  <option value="Training">Training</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTimeOffModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-rose-500 rounded-lg hover:bg-rose-600 disabled:opacity-50 transition-colors">{saving ? 'Adding...' : 'Add Time Off'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shift Timings Modal */}
      {showShiftTimingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowShiftTimingsModal(false)}>
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Edit Shift Timings</h2>
                <p className="text-xs text-slate-500 mt-0.5">Customize start and end times</p>
              </div>
              <button onClick={() => setShowShiftTimingsModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-5 space-y-4">
              {(['morning', 'evening', 'night'] as const).map((shift) => {
                const colors = { morning: { bg: 'bg-yellow-50', border: 'border-yellow-100', text: 'text-yellow-700' }, evening: { bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-700' }, night: { bg: 'bg-navy-50', border: 'border-navy-100', text: 'text-navy-700' } };
                const labels = { morning: 'Morning', evening: 'Afternoon', night: 'Night' };
                const c = colors[shift];
                return (
                  <div key={shift} className={`p-4 rounded-lg ${c.bg} border ${c.border}`}>
                    <p className={`text-sm font-semibold ${c.text} mb-3`}>{labels[shift]} Shift</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Start Time</label>
                        <input type="time" value={editingShiftTimings[shift].start} onChange={(e) => handleShiftTimingChange(shift, 'start', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">End Time</label>
                        <input type="time" value={editingShiftTimings[shift].end} onChange={(e) => handleShiftTimingChange(shift, 'end', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
              <button onClick={() => setShowShiftTimingsModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={() => { setShiftTimings(editingShiftTimings); setShowShiftTimingsModal(false); }} className="px-4 py-2 text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 transition-colors">Save Timings</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
