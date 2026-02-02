'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../AuthProvider';
import { apiFetch } from '../../lib/api';
import { useHospitalTimezone } from '../../hooks/useHospitalTimezone';

interface DoctorProfile {
  id: string;
  userId: string;
  specialization?: string;
  appointmentDurationMinutes?: number;
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
  isTimeOff?: boolean;
  timeOffReason?: string;
  cancelledAppointments?: {
    appointmentId: string;
    patientName: string;
    startTime: string;
    endTime: string;
    status: string;
  }[];
}

interface CalendarDay {
  date: string;
  hasSlots: boolean;
  availableCount: number;
  bookedCount: number;
}

interface DoctorSchedule {
  dayOfWeek: number;
  isWorking: boolean;
  morningShift: boolean;
  eveningShift: boolean;
  nightShift: boolean;
  shiftStart?: string;
  shiftEnd?: string;
}

interface DoctorTimeOff {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

interface ShiftTimingConfig {
  morning: { start: string; end: string };
  evening: { start: string; end: string };
  night: { start: string; end: string };
}

const DEFAULT_SHIFT_TIMINGS: ShiftTimingConfig = {
  morning: { start: '06:00', end: '14:00' },
  evening: { start: '14:00', end: '22:00' },
  night: { start: '22:00', end: '06:00' },
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'p' : 'a';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')}${period}`;
}

function fmtDateObj(date: Date, opts?: { weekday?: boolean; year?: boolean }): string {
  let result = `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
  if (opts?.weekday) result = `${DAYS[date.getDay()]}, ${result}`;
  if (opts?.year) result += `, ${date.getFullYear()}`;
  return result;
}

function fmtDateStr(dateStr: string | null | undefined): string {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('-')) return dateStr as string || '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

export function DoctorAppointments() {
  const { profile, currentHospital } = useAuth();
  const { getCurrentTime } = useHospitalTimezone();

  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date>(() => getCurrentTime());
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const today = getCurrentTime();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [slotsData, setSlotsData] = useState<SlotsForDate | null>(null);

  // Doctor details (schedules, time-offs)
  const [schedules, setSchedules] = useState<DoctorSchedule[]>([]);
  const [timeOffs, setTimeOffs] = useState<DoctorTimeOff[]>([]);
  const [shiftTimings, setShiftTimings] = useState<ShiftTimingConfig>({ ...DEFAULT_SHIFT_TIMINGS });
  const [appointmentDuration, setAppointmentDuration] = useState(30);

  // Hospital holidays
  const [hospitalHolidays, setHospitalHolidays] = useState<{ month: number; day: number; name: string }[]>([]);

  const formatDateString = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const today = formatDateString(getCurrentTime());
  const selectedDateStr = formatDateString(selectedDate);

  // Fetch doctor profile
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/v1/doctors/me');
        if (res.ok) {
          const data = await res.json();
          if (data.profile) {
            setDoctorProfile({
              id: data.profile.id,
              userId: data.profile.userId,
              specialization: data.profile.specialization,
              appointmentDurationMinutes: data.profile.appointmentDurationMinutes,
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch doctor profile:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fetch hospital holidays
  useEffect(() => {
    if (!currentHospital?.id) return;
    apiFetch(`/v1/hospitals/${currentHospital.id}`).then(async res => {
      if (res.ok) {
        const data = await res.json();
        setHospitalHolidays(data.hospitalHolidays || []);
      }
    }).catch(() => {});
  }, [currentHospital?.id]);

  // Fetch doctor details (schedules, time-offs, duration)
  useEffect(() => {
    if (!doctorProfile?.userId) return;
    (async () => {
      try {
        const [schedulesRes, timeOffsRes, durRes] = await Promise.all([
          apiFetch(`/v1/doctors/${doctorProfile.userId}/schedules`),
          apiFetch(`/v1/doctors/${doctorProfile.userId}/time-off`),
          apiFetch(`/v1/doctors/${doctorProfile.userId}/appointment-duration`),
        ]);

        // Schedules
        const schedulesData = schedulesRes.ok ? await schedulesRes.json() : { schedules: [], shiftTimingConfig: null };
        const rawSchedules = Array.isArray(schedulesData) ? schedulesData : (schedulesData.schedules || []);
        const savedTimingConfig = Array.isArray(schedulesData) ? null : schedulesData.shiftTimingConfig;

        const timings: ShiftTimingConfig = savedTimingConfig ? { ...savedTimingConfig } : { ...DEFAULT_SHIFT_TIMINGS };
        const mappedSchedules: DoctorSchedule[] = DAYS_FULL.map((_, idx) => {
          const dbSched = rawSchedules.find((s: any) => (s.dayOfWeek ?? s.day_of_week) === idx);
          if (dbSched && (dbSched.isWorking ?? dbSched.is_working)) {
            const rawStart = (dbSched.shiftStart || dbSched.shift_start || '06:00:00');
            const rawEnd = (dbSched.shiftEnd || dbSched.shift_end || '14:00:00');
            const startTime = rawStart.slice(0, 5);
            const endTime = rawEnd.slice(0, 5);
            const startHour = parseInt(startTime.split(':')[0]);
            const endHour = parseInt(endTime.split(':')[0]);
            return {
              dayOfWeek: idx,
              isWorking: true,
              morningShift: startHour < 14 && endHour > 6,
              eveningShift: startHour < 22 && endHour > 14,
              nightShift: endHour <= 6 || startHour >= 22,
              shiftStart: startTime,
              shiftEnd: endTime,
            };
          }
          return { dayOfWeek: idx, isWorking: false, morningShift: false, eveningShift: false, nightShift: false };
        });

        if (!savedTimingConfig) {
          for (const sched of mappedSchedules) {
            if (sched.isWorking && sched.shiftStart && sched.shiftEnd) {
              const startHour = parseInt(sched.shiftStart.split(':')[0]);
              const endHour = parseInt(sched.shiftEnd.split(':')[0]);
              if (startHour < 14) timings.morning = { start: sched.shiftStart, end: endHour <= 14 ? sched.shiftEnd : timings.morning.end };
              if (endHour > 14 || (startHour >= 14 && startHour < 22)) timings.evening = { start: startHour >= 14 ? sched.shiftStart : timings.evening.start, end: endHour <= 22 ? sched.shiftEnd : timings.evening.end };
              if (endHour <= 6 || startHour >= 22) timings.night = { start: startHour >= 22 ? sched.shiftStart : timings.night.start, end: endHour <= 6 ? sched.shiftEnd : timings.night.end };
              break;
            }
          }
        }

        setShiftTimings(timings);
        setSchedules(mappedSchedules);

        // Time-offs
        const rawTimeOffs = timeOffsRes.ok ? await timeOffsRes.json() : [];
        setTimeOffs((rawTimeOffs || []).map((t: any) => ({
          id: t.id,
          startDate: t.startDate || t.start_date,
          endDate: t.endDate || t.end_date,
          reason: t.reason,
        })));

        // Duration
        if (durRes.ok) {
          const durData = await durRes.json();
          setAppointmentDuration(durData.appointmentDurationMinutes || 30);
        }
      } catch (error) {
        console.error('Failed to fetch doctor details:', error);
      }
    })();
  }, [doctorProfile?.userId]);

  // Fetch calendar
  const fetchCalendar = useCallback(async () => {
    if (!doctorProfile) return;
    try {
      const year = calendarMonth.getFullYear();
      const month = calendarMonth.getMonth() + 1;
      const res = await apiFetch(`/v1/appointments/calendar/${year}/${month}?doctorProfileId=${doctorProfile.id}`);
      if (res.ok) {
        setCalendarDays(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch calendar:', error);
    }
  }, [doctorProfile, calendarMonth]);

  // Fetch slots for selected date
  const fetchSlots = useCallback(async () => {
    if (!doctorProfile) return;
    setSlotsLoading(true);
    try {
      const dateStr = formatDateString(selectedDate);
      const res = await apiFetch(`/v1/appointments/slots/date/${dateStr}?doctorProfileId=${doctorProfile.id}`);
      if (res.ok) {
        setSlotsData(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch slots:', error);
    } finally {
      setSlotsLoading(false);
    }
  }, [doctorProfile, selectedDate, formatDateString]);

  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);
  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  // Calendar grid with holiday/time-off awareness
  const calTimeOffSet = useMemo(() => {
    const set = new Set<string>();
    timeOffs.forEach((to) => {
      const s = new Date(to.startDate + 'T00:00:00');
      const e = new Date(to.endDate + 'T00:00:00');
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const yr = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const dy = String(d.getDate()).padStart(2, '0');
        set.add(`${yr}-${mo}-${dy}`);
      }
    });
    return set;
  }, [timeOffs]);

  const calendarGrid = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    const cells: { day: number; date: string; isCurrentMonth: boolean; calendarDay?: CalendarDay; isHoliday?: boolean; holidayName?: string }[] = [];

    // Previous month days
    const prevLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevLastDay - i;
      const m = month === 0 ? 12 : month;
      const y = month === 0 ? year - 1 : year;
      cells.push({ day: d, date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const calDay = calendarDays.find(cd => cd.date === dateStr);
      const holiday = hospitalHolidays.find(h => h.month === month + 1 && h.day === d);
      cells.push({
        day: d,
        date: dateStr,
        isCurrentMonth: true,
        calendarDay: calDay,
        isHoliday: !!holiday,
        holidayName: holiday?.name,
      });
    }

    // Next month days
    const remainingCells = 42 - cells.length;
    for (let d = 1; d <= remainingCells; d++) {
      const m = month + 2 > 12 ? 1 : month + 2;
      const y = month + 2 > 12 ? year + 1 : year;
      cells.push({ day: d, date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, isCurrentMonth: false });
    }

    return cells;
  }, [calendarMonth, calendarDays, hospitalHolidays]);

  const prevMonth = () => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const nextMonth = () => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  const goToToday = () => {
    const now = getCurrentTime();
    setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 border-2 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-3 p-2 min-h-0 overflow-hidden">
      {/* Left: Calendar */}
      <div className="w-full lg:w-[280px] flex-shrink-0 flex flex-col">
        <div className="bg-white rounded-lg border border-slate-200 p-2 flex flex-col">
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
              <button onClick={goToToday} className="text-[10px] text-[#1e3a5f] hover:underline px-1">Today</button>
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
            {calendarGrid.map((cell, idx) => {
              const isSelected = cell.date === selectedDateStr;
              const isToday = cell.date === today;
              const availableCount = cell.calendarDay?.availableCount || 0;
              const bookedCount = cell.calendarDay?.bookedCount || 0;
              const isHoliday = cell.isHoliday;
              const isTimeOff = cell.isCurrentMonth && calTimeOffSet.has(cell.date);

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
                  title={isHoliday ? cell.holidayName : isTimeOff ? 'Day Off' : undefined}
                  className={`
                    relative p-1 text-[10px] transition-colors
                    ${isSelected
                      ? 'bg-[#1e3a5f] text-white font-bold'
                      : !cell.isCurrentMonth
                        ? 'text-slate-300 bg-slate-50'
                        : isHoliday
                          ? 'bg-red-50 text-red-700 font-bold hover:bg-red-100'
                          : isTimeOff
                            ? 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            : 'bg-white text-slate-700 hover:bg-slate-50'}
                    ${isToday && !isSelected ? 'ring-1 ring-[#1e3a5f] ring-inset font-bold' : ''}
                  `}
                >
                  <span className={isTimeOff && !isSelected ? 'line-through' : ''}>{cell.day}</span>
                  {isHoliday && !isSelected && (
                    <div className="text-[7px] text-red-500 leading-none mt-0.5 truncate">Holiday</div>
                  )}
                  {isTimeOff && !isHoliday && !isSelected && (
                    <div className="text-[7px] text-slate-400 leading-none mt-0.5">Off</div>
                  )}
                  {!isHoliday && !isTimeOff && cell.isCurrentMonth && cell.calendarDay?.hasSlots && (
                    <div className="text-[8px] text-slate-400 leading-none mt-0.5">
                      {availableCount}/{availableCount + bookedCount}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Doctor Availability */}
          <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-100 space-y-2">
            <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wide">My Schedule</p>

            {/* Duration */}
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-500">Slot Duration</span>
              <span className="text-slate-700 font-medium">{appointmentDuration} min</span>
            </div>

            {/* Weekly Schedule */}
            <div>
              <p className="text-[9px] text-slate-400 mb-1">Weekly Schedule</p>
              <div className="space-y-0.5">
                {DAYS_FULL.map((dayName, idx) => {
                  const schedule = schedules.find((s) => s.dayOfWeek === idx);
                  const isWorking = schedule?.isWorking;
                  const shifts: string[] = [];
                  if (isWorking) {
                    if (schedule?.morningShift) shifts.push(`M: ${formatTime12h(shiftTimings.morning.start)}-${formatTime12h(shiftTimings.morning.end)}`);
                    if (schedule?.eveningShift) shifts.push(`E: ${formatTime12h(shiftTimings.evening.start)}-${formatTime12h(shiftTimings.evening.end)}`);
                    if (schedule?.nightShift) shifts.push(`N: ${formatTime12h(shiftTimings.night.start)}-${formatTime12h(shiftTimings.night.end)}`);
                  }
                  return (
                    <div key={idx} className={`flex items-center justify-between px-1.5 py-0.5 rounded text-[9px] ${isWorking ? 'bg-white' : 'bg-slate-100'}`}>
                      <span className={isWorking ? 'text-slate-700 font-medium' : 'text-slate-400'}>{dayName.slice(0, 3)}</span>
                      {isWorking ? (
                        <span className="text-[8px] text-emerald-600 font-medium">{shifts.join(' · ')}</span>
                      ) : (
                        <span className="text-[8px] text-slate-400">Off</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upcoming Time Off */}
            {timeOffs.length > 0 && (
              <div>
                <p className="text-[9px] text-slate-400 mb-1">Upcoming Days Off</p>
                <div className="space-y-0.5 max-h-[80px] overflow-y-auto">
                  {timeOffs.map((to) => (
                    <div key={to.id} className="flex items-center justify-between px-1.5 py-0.5 bg-slate-100 rounded text-[9px]">
                      <span className="text-slate-600">
                        {fmtDateStr(to.startDate)}
                        {to.startDate !== to.endDate && <> - {fmtDateStr(to.endDate)}</>}
                      </span>
                      {to.reason && <span className="text-slate-400 text-[8px] truncate ml-1 max-w-[80px]">{to.reason}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Slots Grid */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="bg-white rounded-lg border border-slate-200 flex flex-col min-h-0 overflow-hidden flex-1">
          {/* Header */}
          <div className="flex-shrink-0 px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-medium text-xs text-slate-900">
                {fmtDateObj(selectedDate, { weekday: true, year: true })}
              </h2>
              {slotsData?.isTimeOff ? (
                <p className="text-[10px] text-amber-600 font-medium">Day Off{slotsData.timeOffReason && slotsData.timeOffReason !== 'Day Off' ? ` — ${slotsData.timeOffReason}` : ''}</p>
              ) : slotsData && slotsData.stats.total > 0 ? (
                <p className="text-[10px] text-slate-500">{slotsData.stats.available} open · {slotsData.stats.booked} booked</p>
              ) : null}
            </div>
          </div>

          {slotsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : slotsData?.isTimeOff ? (
            <div className="flex-1 flex flex-col p-4 overflow-auto">
              {/* Day Off Banner */}
              <div className="bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
                <svg className="w-8 h-8 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Day Off</p>
                  {slotsData.timeOffReason && slotsData.timeOffReason !== 'Day Off' && (
                    <p className="text-[11px] text-slate-500">{slotsData.timeOffReason}</p>
                  )}
                  <p className="text-[10px] text-slate-400">No appointments scheduled on this day</p>
                </div>
              </div>

              {/* Cancelled Appointments */}
              {slotsData.cancelledAppointments && slotsData.cancelledAppointments.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1.5">
                    Cancelled Appointments ({slotsData.cancelledAppointments.length})
                  </p>
                  <div className="space-y-1">
                    {slotsData.cancelledAppointments.map((appt) => (
                      <div key={appt.appointmentId} className="flex items-center justify-between p-2 bg-red-50 border border-red-100 rounded">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                            <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-[11px] font-medium text-slate-800">{appt.patientName}</p>
                            <p className="text-[9px] text-slate-500">
                              {formatTime12h(appt.startTime)} - {formatTime12h(appt.endTime)}
                            </p>
                          </div>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-100 text-red-600">Cancelled</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : !slotsData || slotsData.stats.total === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-xs">No slots for this date</p>
                <p className="text-[10px] mt-1">Contact the hospital to generate appointment slots</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-2 min-h-0 overflow-auto">
              {/* Morning */}
              <div className="flex flex-col min-h-0 bg-amber-50 rounded border border-amber-100 overflow-hidden">
                <div className="flex-shrink-0 px-2 py-1.5 bg-amber-100/50 border-b border-amber-100 flex items-center gap-1">
                  <span className="text-xs">&#9728;&#65039;</span>
                  <span className="font-medium text-[10px] text-amber-800">Morning</span>
                  <span className="text-[9px] text-amber-600 ml-auto">
                    {slotsData.morning.filter((s) => s.status === 'AVAILABLE').length} open
                  </span>
                </div>
                <div className="flex-1 p-1 overflow-y-auto space-y-0.5">
                  {slotsData.morning.map((slot) => (
                    <ViewOnlySlotCard key={slot.id} slot={slot} />
                  ))}
                  {slotsData.morning.length === 0 && <p className="text-center text-[10px] text-amber-400 py-2">No slots</p>}
                </div>
              </div>

              {/* Evening */}
              <div className="flex flex-col min-h-0 bg-orange-50 rounded border border-orange-100 overflow-hidden">
                <div className="flex-shrink-0 px-2 py-1.5 bg-orange-100/50 border-b border-orange-100 flex items-center gap-1">
                  <span className="text-xs">&#127749;</span>
                  <span className="font-medium text-[10px] text-orange-800">Evening</span>
                  <span className="text-[9px] text-orange-600 ml-auto">
                    {slotsData.evening.filter((s) => s.status === 'AVAILABLE').length} open
                  </span>
                </div>
                <div className="flex-1 p-1 overflow-y-auto space-y-0.5">
                  {slotsData.evening.map((slot) => (
                    <ViewOnlySlotCard key={slot.id} slot={slot} />
                  ))}
                  {slotsData.evening.length === 0 && <p className="text-center text-[10px] text-orange-400 py-2">No slots</p>}
                </div>
              </div>

              {/* Night */}
              <div className="flex flex-col min-h-0 bg-indigo-50 rounded border border-indigo-100 overflow-hidden">
                <div className="flex-shrink-0 px-2 py-1.5 bg-indigo-100/50 border-b border-indigo-100 flex items-center gap-1">
                  <span className="text-xs">&#127769;</span>
                  <span className="font-medium text-[10px] text-indigo-800">Night</span>
                  <span className="text-[9px] text-indigo-600 ml-auto">
                    {slotsData.night.filter((s) => s.status === 'AVAILABLE').length} open
                  </span>
                </div>
                <div className="flex-1 p-1 overflow-y-auto space-y-0.5">
                  {slotsData.night.map((slot) => (
                    <ViewOnlySlotCard key={slot.id} slot={slot} />
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

/** View-only slot card - shows time, status, and patient name but no action buttons */
function ViewOnlySlotCard({ slot }: { slot: Slot }) {
  const isAvailable = slot.status === 'AVAILABLE';
  const isBooked = slot.status === 'BOOKED';
  const isBlocked = slot.status === 'BLOCKED';

  return (
    <div
      className={`
        px-1.5 py-1 rounded flex items-center text-[10px]
        ${isAvailable ? 'bg-white border border-slate-200' : ''}
        ${isBooked ? 'bg-blue-50 border border-blue-100' : ''}
        ${isBlocked ? 'bg-slate-100 border border-slate-200' : ''}
      `}
    >
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <span className="font-medium text-slate-700">{formatTime12h(slot.startTime)}</span>
        {isAvailable && <span className="w-1 h-1 rounded-full bg-green-500" />}
        {isBooked && (
          <>
            <span className="w-1 h-1 rounded-full bg-blue-500" />
            <span className="text-blue-700 font-medium truncate">{slot.patientName}</span>
          </>
        )}
        {isBlocked && <span className="text-slate-400">Blocked</span>}
      </div>
    </div>
  );
}
