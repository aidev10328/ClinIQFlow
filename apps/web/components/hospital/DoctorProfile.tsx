'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../AuthProvider';
import { apiFetch } from '../../lib/api';
import { useHospitalTimezone } from '../../hooks/useHospitalTimezone';
import PhoneInput from '../PhoneInput';

interface DoctorProfileData {
  id: string;
  userId: string;
  email: string;
  fullName?: string;
  phone?: string;
  avatarUrl?: string;
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
  bio?: string;
  // Schedule
  appointmentDurationMinutes?: number;
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
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DoctorProfile() {
  const { user, profile } = useAuth();
  const { getCurrentTime, formatShortDate, timezoneLabel } = useHospitalTimezone();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'personal' | 'professional' | 'schedule'>('personal');
  const [doctor, setDoctor] = useState<DoctorProfileData | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<DoctorProfileData>>({});

  // Avatar upload
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Schedule state
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

  // Calendar state
  const [calendarDate, setCalendarDate] = useState(() => getCurrentTime());

  // Appointment duration
  const [appointmentDuration, setAppointmentDuration] = useState(30);
  const [savingDuration, setSavingDuration] = useState(false);

  // Specializations
  const [specializations, setSpecializations] = useState<Specialization[]>([]);

  useEffect(() => {
    fetchSpecializations();
    fetchDoctorProfile();
    fetchTimeOff();
    fetchSchedules();
  }, []);

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
      const res = await apiFetch('/v1/doctors/me/profile');
      if (res.ok) {
        const data = await res.json();
        setDoctor(data);
        setFormData(data);
        if (data.appointmentDurationMinutes) {
          setAppointmentDuration(data.appointmentDurationMinutes);
        }
        if (data.avatarUrl) {
          setAvatarPreview(data.avatarUrl);
        }
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTimeOff() {
    try {
      const res = await apiFetch('/v1/doctors/me/time-off');
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
      const res = await apiFetch('/v1/doctors/me/schedules');
      if (res.ok) {
        const rawData = await res.json();
        const data = Array.isArray(rawData) ? rawData : (rawData.schedules || []);
        if (data && data.length > 0) {
          const newSchedule = DAYS_OF_WEEK.map((_, idx) => {
            const dbSchedule = data.find((s: any) => s.day_of_week === idx);
            if (dbSchedule && dbSchedule.is_working) {
              const startHour = parseInt(dbSchedule.shift_start?.split(':')[0] || '0');
              const endHour = parseInt(dbSchedule.shift_end?.split(':')[0] || '0');
              const morningShift = startHour < 14 && endHour > 6;
              const eveningShift = startHour < 22 && endHour > 14;
              const nightShift = endHour <= 6 || startHour >= 22;
              return {
                dayOfWeek: idx,
                isWorking: true,
                morningShift,
                eveningShift,
                nightShift,
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

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await apiFetch('/v1/doctors/me/avatar', {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set content-type for FormData
      });

      if (res.ok) {
        const data = await res.json();
        setDoctor(prev => prev ? { ...prev, avatarUrl: data.avatarUrl } : null);
      } else {
        alert('Failed to upload avatar');
        setAvatarPreview(doctor?.avatarUrl || null);
      }
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      alert('Failed to upload avatar');
      setAvatarPreview(doctor?.avatarUrl || null);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/v1/doctors/me/profile', {
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
      await apiFetch('/v1/doctors/me/appointment-duration', {
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
        if (!value) {
          return { ...day, isWorking: false, morningShift: false, eveningShift: false, nightShift: false };
        }
        return { ...day, isWorking: value };
      }
      if (field === 'morningShift' || field === 'eveningShift' || field === 'nightShift') {
        const updated = { ...day, [field]: value };
        if (value) updated.isWorking = true;
        if (!updated.morningShift && !updated.eveningShift && !updated.nightShift) {
          updated.isWorking = false;
        }
        return updated;
      }
      return day;
    }));
  }

  const [saveSuccess, setSaveSuccess] = useState(false);

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

        if (day.morningShift) {
          shiftStart = '06:00:00';
          shiftEnd = '14:00:00';
        }
        if (day.eveningShift) {
          if (!shiftStart) shiftStart = '14:00:00';
          shiftEnd = '22:00:00';
        }
        if (day.nightShift) {
          if (!shiftStart) shiftStart = '22:00:00';
          shiftEnd = '06:00:00';
        }

        return { dayOfWeek: day.dayOfWeek, isWorking: true, shiftStart, shiftEnd };
      });

      const res = await apiFetch('/v1/doctors/me/schedules', {
        method: 'PATCH',
        body: JSON.stringify({ schedules: schedulesToSave }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        // Refetch schedules to ensure UI is in sync with database
        await fetchSchedules();
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
      const res = await apiFetch('/v1/doctors/me/time-off', {
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
      const res = await apiFetch(`/v1/doctors/me/time-off/${id}`, {
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

  // Calendar helpers
  function getCalendarDays(date: Date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days: (number | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
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
    const today = getCurrentTime();
    return (
      day === today.getDate() &&
      calendarDate.getMonth() === today.getMonth() &&
      calendarDate.getFullYear() === today.getFullYear()
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const doctorName = doctor?.fullName || profile?.fullName || 'Doctor';

  return (
    <div className="page-fullheight flex flex-col bg-gray-50 overflow-hidden">
      {/* Header with Avatar */}
      <div className="flex-shrink-0 bg-white border-b">
        <div className="px-6 py-5">
          <div className="flex items-center gap-5">
            {/* Avatar Section */}
            <div className="relative">
              <div
                className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--color-primary)] to-[#5a8ac7] flex items-center justify-center overflow-hidden cursor-pointer group"
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-white">
                    {doctorName.charAt(0).toUpperCase()}
                  </span>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </div>
              {uploadingAvatar && (
                <div className="absolute inset-0 bg-white/80 rounded-2xl flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
              {/* Camera badge */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-[var(--color-primary)] rounded-full flex items-center justify-center text-white shadow-lg hover:bg-[var(--color-primary-dark)] transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

            {/* Doctor Info */}
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-gray-900">Dr. {doctorName}</h1>
              <p className="text-sm text-gray-500">{doctor?.email}</p>
              <div className="flex items-center gap-3 mt-2">
                {doctor?.specialization && (
                  <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-100">
                    {doctor.specialization}
                  </span>
                )}
                {doctor?.qualification && (
                  <span className="px-2.5 py-1 bg-cyan-50 text-cyan-700 text-xs font-medium rounded-lg border border-cyan-100">
                    {doctor.qualification}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('personal')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'personal'
                  ? 'bg-gray-50 text-[var(--color-primary)] border-t-2 border-x border-[var(--color-primary)]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Personal
            </button>
            <button
              onClick={() => setActiveTab('professional')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'professional'
                  ? 'bg-gray-50 text-[var(--color-primary)] border-t-2 border-x border-[var(--color-primary)]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Professional
            </button>
            <button
              onClick={() => setActiveTab('schedule')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'schedule'
                  ? 'bg-gray-50 text-[var(--color-primary)] border-t-2 border-x border-[var(--color-primary)]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Schedule
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Personal Tab */}
        {activeTab === 'personal' && (
          <div className="max-w-4xl">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Personal Information</h2>
                  <p className="text-sm text-gray-500">Your contact and personal details</p>
                </div>
                {!editMode && (
                  <button
                    onClick={() => setEditMode(true)}
                    className="px-4 py-2 text-sm font-medium text-[var(--color-primary)] bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
              <div className="p-5">
                {editMode ? (
                  <form onSubmit={handleSaveProfile} className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <input
                          type="text"
                          value={formData.fullName || ''}
                          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                          className="form-input"
                          placeholder="Enter your full name"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Email</label>
                        <input
                          type="email"
                          value={formData.email || ''}
                          disabled
                          className="form-input bg-gray-50"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Phone</label>
                        <PhoneInput
                          value={formData.phone || ''}
                          onChange={(value) => setFormData({ ...formData, phone: value })}
                          placeholder="Phone number"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Date of Birth</label>
                        <input
                          type="date"
                          value={formData.dateOfBirth || ''}
                          onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                          className="form-input"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Gender</label>
                        <select
                          value={formData.gender || ''}
                          onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                          className="form-input"
                        >
                          <option value="">Select</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Address</label>
                        <input
                          type="text"
                          value={formData.address || ''}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          className="form-input"
                          placeholder="Your address"
                        />
                      </div>
                    </div>

                    {/* Emergency Contact */}
                    <div className="pt-4 border-t border-gray-100">
                      <h3 className="text-sm font-medium text-red-600 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Emergency Contact
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="form-group">
                          <label className="form-label">Contact Name</label>
                          <input
                            type="text"
                            value={formData.emergencyContact || ''}
                            onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                            className="form-input"
                            placeholder="Emergency contact name"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Contact Phone</label>
                          <PhoneInput
                            value={formData.emergencyPhone || ''}
                            onChange={(value) => setFormData({ ...formData, emergencyPhone: value })}
                            placeholder="Emergency phone"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setEditMode(false);
                          setFormData(doctor || {});
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Full Name</p>
                        <p className="text-sm font-medium text-gray-900">{doctor?.fullName || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Email</p>
                        <p className="text-sm font-medium text-gray-900 truncate">{doctor?.email || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Phone</p>
                        <p className="text-sm font-medium text-gray-900">{doctor?.phone || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Date of Birth</p>
                        <p className="text-sm font-medium text-gray-900">
                          {doctor?.dateOfBirth
                            ? new Date(doctor.dateOfBirth + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Gender</p>
                        <p className="text-sm font-medium text-gray-900 capitalize">{doctor?.gender || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Address</p>
                        <p className="text-sm font-medium text-gray-900 truncate">{doctor?.address || '—'}</p>
                      </div>
                    </div>

                    {/* Emergency Contact Display */}
                    <div className="pt-4 border-t border-gray-100">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-red-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span className="text-xs font-medium uppercase">Emergency:</span>
                        </div>
                        <span className="text-sm text-gray-700">{doctor?.emergencyContact || '—'}</span>
                        <span className="text-sm text-gray-500">{doctor?.emergencyPhone || ''}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Professional Tab */}
        {activeTab === 'professional' && (
          <div className="max-w-4xl">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Professional Credentials</h2>
                  <p className="text-sm text-gray-500">Your qualifications and expertise</p>
                </div>
                {!editMode && (
                  <button
                    onClick={() => setEditMode(true)}
                    className="px-4 py-2 text-sm font-medium text-[var(--color-primary)] bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
              <div className="p-5">
                {editMode ? (
                  <form onSubmit={handleSaveProfile} className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="form-group">
                        <label className="form-label">Specialization</label>
                        <select
                          value={formData.specialization || ''}
                          onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                          className="form-input"
                        >
                          <option value="">Select specialization</option>
                          {specializations.map((spec) => (
                            <option key={spec.id} value={spec.name}>{spec.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Qualification</label>
                        <input
                          type="text"
                          value={formData.qualification || ''}
                          onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                          className="form-input"
                          placeholder="e.g., MBBS, MD"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">License Number</label>
                        <input
                          type="text"
                          value={formData.licenseNumber || ''}
                          onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                          className="form-input"
                          placeholder="Medical license number"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Years of Experience</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.yearsOfExperience || ''}
                          onChange={(e) => setFormData({ ...formData, yearsOfExperience: parseInt(e.target.value) })}
                          className="form-input"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Consultation Fee</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.consultationFee || ''}
                          onChange={(e) => setFormData({ ...formData, consultationFee: parseFloat(e.target.value) })}
                          className="form-input"
                          placeholder="e.g., 500"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Education</label>
                        <input
                          type="text"
                          value={formData.education || ''}
                          onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                          className="form-input"
                          placeholder="e.g., MD from Stanford"
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Bio</label>
                      <textarea
                        value={formData.bio || ''}
                        onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                        className="form-input"
                        rows={3}
                        placeholder="Brief professional biography..."
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setEditMode(false);
                          setFormData(doctor || {});
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-5">
                    {/* Credentials badges */}
                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-lg border border-indigo-100">
                        <span className="text-xs text-indigo-500 uppercase font-medium">Specialization</span>
                        <span className="text-sm font-semibold text-indigo-700">{doctor?.specialization || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2 px-4 py-2 bg-cyan-50 rounded-lg border border-cyan-100">
                        <span className="text-xs text-cyan-500 uppercase font-medium">Qualification</span>
                        <span className="text-sm font-semibold text-cyan-700">{doctor?.qualification || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
                        <span className="text-xs text-emerald-500 uppercase font-medium">Experience</span>
                        <span className="text-sm font-semibold text-emerald-700">
                          {doctor?.yearsOfExperience ? `${doctor.yearsOfExperience} years` : '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-lg border border-amber-100">
                        <span className="text-xs text-amber-500 uppercase font-medium">License</span>
                        <span className="text-sm font-semibold text-amber-700">{doctor?.licenseNumber || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-lg border border-green-100">
                        <span className="text-xs text-green-500 uppercase font-medium">Fee</span>
                        <span className="text-sm font-semibold text-green-700">
                          {doctor?.consultationFee ? `$${doctor.consultationFee}` : '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg border border-gray-100">
                        <span className="text-xs text-gray-500 uppercase font-medium">Education</span>
                        <span className="text-sm font-semibold text-gray-700">{doctor?.education || '—'}</span>
                      </div>
                    </div>

                    {/* Bio */}
                    <div className="pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Bio</p>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {doctor?.bio || 'No professional biography added.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Schedule Tab */}
        {activeTab === 'schedule' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-6xl">
            {/* Left Column */}
            <div className="space-y-4">
              {/* Weekly Schedule */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">Weekly Schedule</h2>
                    <p className="text-sm text-gray-500">Your working days and shifts</p>
                  </div>
                  <button
                    onClick={handleSaveSchedule}
                    disabled={saving}
                    className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors ${
                      saveSuccess
                        ? 'bg-green-500 hover:bg-green-600'
                        : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)]'
                    }`}
                  >
                    {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save'}
                  </button>
                </div>
                <div className="p-4">
                  <div className="space-y-2">
                    {schedule.map((day, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                          day.isWorking ? 'bg-green-50' : 'bg-gray-50'
                        }`}
                      >
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${day.isWorking ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className={`text-sm font-medium w-20 ${day.isWorking ? 'text-gray-900' : 'text-gray-400'}`}>
                          {DAYS_OF_WEEK[idx]}
                        </span>
                        <div className="flex gap-2 flex-1">
                          <label className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                            day.morningShift ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}>
                            <input
                              type="checkbox"
                              checked={day.morningShift}
                              onChange={(e) => handleScheduleChange(idx, 'morningShift', e.target.checked)}
                              className="sr-only"
                            />
                            Morning
                          </label>
                          <label className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                            day.eveningShift ? 'bg-orange-200 text-orange-800' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}>
                            <input
                              type="checkbox"
                              checked={day.eveningShift}
                              onChange={(e) => handleScheduleChange(idx, 'eveningShift', e.target.checked)}
                              className="sr-only"
                            />
                            Afternoon
                          </label>
                          <label className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                            day.nightShift ? 'bg-navy-700 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}>
                            <input
                              type="checkbox"
                              checked={day.nightShift}
                              onChange={(e) => handleScheduleChange(idx, 'nightShift', e.target.checked)}
                              className="sr-only"
                            />
                            Night
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Appointment Duration */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-base font-semibold text-gray-900">Appointment Duration</h2>
                  <p className="text-sm text-gray-500">Default time slot for appointments</p>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-4">
                    <select
                      value={appointmentDuration}
                      onChange={(e) => handleSaveAppointmentDuration(parseInt(e.target.value))}
                      disabled={savingDuration}
                      className="form-input w-40"
                    >
                      <option value={15}>15 minutes</option>
                      <option value={20}>20 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>60 minutes</option>
                    </select>
                    {savingDuration && (
                      <span className="text-sm text-gray-500">Saving...</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Time Off List */}
              {timeOff.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-base font-semibold text-gray-900">Time Off ({timeOff.length})</h2>
                  </div>
                  <div className="p-3 space-y-2">
                    {timeOff.map((item) => (
                      <div key={item.id} className="flex items-center justify-between px-3 py-2 bg-red-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 bg-red-500 rounded-full" />
                          <span className="text-sm text-gray-700">
                            {parseDateString(item.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {item.startDate !== item.endDate && ` - ${parseDateString(item.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                          </span>
                          {item.reason && (
                            <span className="text-xs text-gray-500">({item.reason})</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveTimeOff(item.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Calendar */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => navigateMonth('prev')} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-base font-semibold text-gray-900">{formatMonthYear(calendarDate)}</span>
                  <button onClick={() => navigateMonth('next')} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                <button
                  onClick={() => setShowTimeOffModal(true)}
                  className="px-4 py-2 text-sm font-medium text-white bg-rose-500 hover:bg-rose-600 rounded-lg transition-colors"
                >
                  + Add Time Off
                </button>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-7 gap-1">
                  {DAYS_SHORT.map((day) => (
                    <div key={day} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase">
                      {day.charAt(0)}
                    </div>
                  ))}
                  {getCalendarDays(calendarDate).map((day, index) => {
                    const isTimeOffDay = day ? isDateInTimeOff(day) : false;
                    const isTodayDay = day ? isToday(day) : false;
                    return (
                      <div
                        key={index}
                        className={`p-2 min-h-[44px] rounded-lg text-center ${
                          !day ? 'bg-gray-50' : isTimeOffDay ? 'bg-red-50' : 'bg-white'
                        }`}
                      >
                        {day && (
                          <span className={`text-sm inline-flex items-center justify-center w-8 h-8 rounded-full ${
                            isTodayDay
                              ? 'bg-[var(--color-primary)] text-white font-bold'
                              : isTimeOffDay
                              ? 'text-red-600 font-medium'
                              : 'text-gray-700'
                          }`}>
                            {day}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[var(--color-primary)]" />
                      <span>Today</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-red-100 border border-red-200" />
                      <span>Time Off</span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{timezoneLabel}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Time Off Modal */}
      {showTimeOffModal && (
        <div className="admin-modal-overlay" onClick={() => setShowTimeOffModal(false)}>
          <div className="admin-modal max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h2 className="admin-modal-title">Add Time Off</h2>
                <p className="admin-modal-subtitle">Schedule unavailable dates</p>
              </div>
              <button onClick={() => setShowTimeOffModal(false)} className="admin-modal-close">
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
                <button type="button" onClick={() => setShowTimeOffModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Adding...' : 'Add Time Off'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
