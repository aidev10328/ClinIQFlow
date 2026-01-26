'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../AuthProvider';
import { apiFetch } from '../../lib/api';
import { useHospitalTimezone } from '../../hooks/useHospitalTimezone';

interface Appointment {
  id: string;
  slotId: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  reasonForVisit?: string;
  notes?: string;
}

interface CalendarDay {
  date: string;
  hasAppointments: boolean;
  count: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'SCHEDULED':
      return 'bg-blue-100 text-blue-700';
    case 'CONFIRMED':
      return 'bg-green-100 text-green-700';
    case 'COMPLETED':
      return 'bg-gray-100 text-gray-600';
    case 'CANCELLED':
      return 'bg-red-100 text-red-700';
    case 'NO_SHOW':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

export function DoctorAppointments() {
  const { profile } = useAuth();
  const { getCurrentTime, formatShortDate } = useHospitalTimezone();

  const [loading, setLoading] = useState(true);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(() => getCurrentTime());
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const today = getCurrentTime();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const formatDateString = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Fetch calendar overview for a month
  const fetchCalendar = useCallback(async () => {
    try {
      const year = calendarMonth.getFullYear();
      const month = calendarMonth.getMonth() + 1;
      const res = await apiFetch(`/v1/doctors/me/appointments/calendar/${year}/${month}`);
      if (res.ok) {
        const data = await res.json();
        setCalendarDays(data);
      }
    } catch (error) {
      console.error('Failed to fetch calendar:', error);
    } finally {
      setLoading(false);
    }
  }, [calendarMonth]);

  // Fetch appointments for selected date
  const fetchAppointments = useCallback(async () => {
    setAppointmentsLoading(true);
    try {
      const dateStr = formatDateString(selectedDate);
      const res = await apiFetch(`/v1/doctors/me/appointments?date=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        setAppointments(data.appointments || []);
      }
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
    } finally {
      setAppointmentsLoading(false);
    }
  }, [selectedDate, formatDateString]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Calendar helpers
  const getCalendarGrid = useCallback(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const grid: (number | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      grid.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      grid.push(i);
    }
    return grid;
  }, [calendarMonth]);

  const isToday = (day: number) => {
    const today = getCurrentTime();
    return (
      day === today.getDate() &&
      calendarMonth.getMonth() === today.getMonth() &&
      calendarMonth.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (day: number) => {
    return (
      day === selectedDate.getDate() &&
      calendarMonth.getMonth() === selectedDate.getMonth() &&
      calendarMonth.getFullYear() === selectedDate.getFullYear()
    );
  };

  const getAppointmentCount = (day: number) => {
    const dateStr = formatDateString(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
    const found = calendarDays.find(d => d.date === dateStr);
    return found?.count || 0;
  };

  const handleDayClick = (day: number) => {
    const newDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    setSelectedDate(newDate);
  };

  const navigateMonth = (direction: number) => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
  };

  const doctorName = profile?.fullName || 'Doctor';
  const selectedDateStr = `${DAYS[selectedDate.getDay()]}, ${MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`;

  // Stats for selected date
  const stats = {
    total: appointments.length,
    scheduled: appointments.filter(a => a.status === 'SCHEDULED').length,
    confirmed: appointments.filter(a => a.status === 'CONFIRMED').length,
    completed: appointments.filter(a => a.status === 'COMPLETED').length,
  };

  return (
    <div className="page-fullheight flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 bg-white border-b">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">My Appointments</h1>
            <p className="text-xs text-gray-500">Dr. {doctorName}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded font-medium">
              {stats.scheduled} Scheduled
            </span>
            <span className="px-2 py-1 bg-green-50 text-green-700 rounded font-medium">
              {stats.confirmed} Confirmed
            </span>
            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded font-medium">
              {stats.completed} Completed
            </span>
          </div>
        </div>
      </div>

      {/* Main Content - Calendar Left, Appointments Right */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left - Calendar */}
        <div className="w-[280px] flex-shrink-0 bg-white border-r p-3 overflow-auto">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => navigateMonth(-1)}
              className="p-1 rounded hover:bg-gray-100"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-sm font-semibold text-gray-900">
              {MONTHS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
            </h2>
            <button
              onClick={() => navigateMonth(1)}
              className="p-1 rounded hover:bg-gray-100"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DAYS.map(day => (
              <div key={day} className="text-center text-[10px] font-medium text-gray-500 py-1">
                {day.charAt(0)}
              </div>
            ))}
          </div>

          {/* Calendar Grid with Borders */}
          <div className="grid grid-cols-7 gap-0.5 border border-gray-200 rounded-lg overflow-hidden bg-gray-200">
            {getCalendarGrid().map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="aspect-square bg-gray-50" />;
              }
              const count = getAppointmentCount(day);
              const todayClass = isToday(day) ? 'ring-2 ring-inset ring-[var(--color-primary)]' : '';
              const selectedClass = isSelected(day)
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-white hover:bg-gray-50';

              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={`aspect-square flex flex-col items-center justify-center relative transition-colors ${todayClass} ${selectedClass}`}
                >
                  <span className="text-xs font-medium">{day}</span>
                  {count > 0 && (
                    <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected(day) ? 'bg-white/80' : 'bg-[var(--color-primary)]'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Jump */}
          <div className="mt-3 pt-3 border-t">
            <button
              onClick={() => {
                const today = getCurrentTime();
                setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                setSelectedDate(today);
              }}
              className="w-full py-1.5 text-xs text-[var(--color-primary)] hover:bg-blue-50 rounded-lg transition-colors"
            >
              Go to Today
            </button>
          </div>
        </div>

        {/* Right - Appointments for Selected Date */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Date Header */}
          <div className="flex-shrink-0 px-4 py-2 bg-gray-50 border-b">
            <h3 className="text-sm font-semibold text-gray-900">{selectedDateStr}</h3>
            <p className="text-[11px] text-gray-500">{appointments.length} appointments</p>
          </div>

          {/* Appointments List - Compact */}
          <div className="flex-1 overflow-auto p-3">
            {loading || appointmentsLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : appointments.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-xs font-medium text-gray-900 mb-0.5">No Appointments</p>
                <p className="text-[11px] text-gray-500">No appointments scheduled for this day</p>
              </div>
            ) : (
              <div className="space-y-2">
                {appointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="bg-white rounded-lg border border-gray-200 p-2.5"
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Time */}
                      <div className="w-16 flex-shrink-0 text-center py-1 bg-gray-50 rounded">
                        <p className="text-[11px] font-semibold text-gray-900">
                          {formatTime12h(apt.startTime)}
                        </p>
                      </div>

                      {/* Patient Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-gray-900 truncate">{apt.patientName}</p>
                          <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${getStatusColor(apt.status)}`}>
                            {apt.status}
                          </span>
                        </div>
                        {apt.reasonForVisit && (
                          <p className="text-[11px] text-gray-500 mt-0.5 truncate">{apt.reasonForVisit}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
