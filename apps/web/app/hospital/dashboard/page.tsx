'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '../../../components/AuthProvider';
import { useApiQuery } from '../../../lib/hooks/useApiQuery';
import { useHospitalTimezone } from '../../../hooks/useHospitalTimezone';

const DoctorDashboard = dynamic(
  () => import('../../../components/hospital/DoctorDashboard').then((m) => m.DoctorDashboard),
  { loading: () => null }
);

// Lazy-load recharts — Cell must be imported directly (not dynamic) so Recharts can identify it via React.Children
import { Cell } from 'recharts';
const AreaChart = dynamic(() => import('recharts').then((m) => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then((m) => m.Area), { ssr: false });
const LineChart = dynamic(() => import('recharts').then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import('recharts').then((m) => m.Line), { ssr: false });
const PieChart = dynamic(() => import('recharts').then((m) => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((m) => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────
// API returns snake_case from Supabase
interface DoctorScheduleRaw {
  day_of_week: number;
  is_working: boolean;
  shift_start: string | null;
  shift_end: string | null;
}

interface DoctorSchedule {
  dayOfWeek: number;
  isWorking: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
}

interface DoctorCheckin {
  status: 'CHECKED_IN' | 'CHECKED_OUT' | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
}

function normalizeSchedule(raw: any): DoctorSchedule {
  return {
    dayOfWeek: raw.day_of_week ?? raw.dayOfWeek ?? 0,
    isWorking: raw.is_working ?? raw.isWorking ?? false,
    shiftStart: raw.shift_start ?? raw.shiftStart ?? null,
    shiftEnd: raw.shift_end ?? raw.shiftEnd ?? null,
  };
}

type TimeFilter = 'day' | 'week' | 'month' | 'year';

// ─── Extended blue palette ───────────────────────────────────────────────────
const C = {
  navy:      '#1E3A5F',
  accent:    '#1E40AF',
  primary:   '#2563EB',
  secondary: '#3B82F6',
  bright:    '#60A5FA',
  light:     '#93C5FD',
  pale:      '#BFDBFE',
  wash:      '#DBEAFE',
  ghost:     '#EFF6FF',
  indigo:    '#4F46E5',
  sky:       '#0284C7',
  skyLight:  '#38BDF8',
  cyan:      '#06B6D4',
  teal:      '#0D9488',
  emerald:   '#059669',
  violet:    '#7C3AED',
  fuchsia:   '#C026D3',
  amber:     '#D97706',
  slate:     '#475569',
  muted:     '#94A3B8',
};

// Shift definitions — same as doctor detail page
const SHIFT_DEFS = {
  morning: { label: 'Morning', short: 'AM', start: '06:00', end: '14:00', bg: 'bg-amber-50', border: 'border-amber-100', textLabel: 'text-amber-600', textTime: 'text-amber-800' },
  evening: { label: 'Evening', short: 'PM', start: '14:00', end: '22:00', bg: 'bg-blue-50', border: 'border-blue-100', textLabel: 'text-blue-600', textTime: 'text-blue-800' },
  night:   { label: 'Night',   short: 'NT', start: '22:00', end: '06:00', bg: 'bg-purple-50', border: 'border-purple-100', textLabel: 'text-purple-600', textTime: 'text-purple-800' },
};

function getShiftFlags(shiftStart: string | null, shiftEnd: string | null) {
  const startHour = parseInt(shiftStart?.split(':')[0] || '0');
  const endHour = parseInt(shiftEnd?.split(':')[0] || '0');
  return {
    morning: startHour < 14 && endHour > 6,
    evening: startHour < 22 && endHour > 14,
    night: endHour <= 6 || startHour >= 22,
  };
}

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const p = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${p}`;
}

// Sun / Moon / Star SVG icons for shifts
function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'w-3 h-3'} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 6a6 6 0 100 12 6 6 0 000-12z" />
    </svg>
  );
}
function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'w-3 h-3'} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 3a9 9 0 019 9c0 3.18-1.65 5.98-4.14 7.57A9.996 9.996 0 0112 21 9 9 0 0112 3z" />
    </svg>
  );
}
function SunsetIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'w-3 h-3'} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 0a5 5 0 015 5H7a5 5 0 015-5zm-9 8h2m14 0h2M5.64 5.64l1.41 1.41m9.9 0l1.41-1.41M3 17h18" />
    </svg>
  );
}

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TIME_FILTERS: { value: TimeFilter; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-blue-100 text-sm">
      <p className="text-slate-500 mb-1 font-medium text-xs">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500 text-xs">{p.name}:</span>
          <span className="font-bold text-slate-800 text-xs">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function FilterPills({ value, onChange }: { value: TimeFilter; onChange: (v: TimeFilter) => void }) {
  return (
    <div className="flex gap-0.5 bg-blue-50 rounded-md p-0.5">
      {TIME_FILTERS.map((f) => (
        <button key={f.value} onClick={() => onChange(f.value)}
          className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${value === f.value ? 'bg-blue-600 text-white shadow-sm' : 'text-blue-400 hover:text-blue-600'}`}>
          {f.label}
        </button>
      ))}
    </div>
  );
}

function DoctorSelect({ value, onChange, doctors }: { value: string; onChange: (v: string) => void; doctors: any[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="text-[10px] border border-blue-200 rounded px-1.5 py-0.5 bg-blue-50/50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-300 max-w-[120px] truncate">
      <option value="all">All Hospital</option>
      {doctors.map((d: any) => <option key={d.doctorProfileId} value={d.doctorProfileId}>{d.name}</option>)}
    </select>
  );
}

function ChartLegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="w-2.5 h-0.5 rounded-full" style={{ background: color }} />
      <span className="text-[10px] text-slate-500">{label}</span>
    </span>
  );
}

// ─── Date bucketing ──────────────────────────────────────────────────────────
function getDateRange(filter: TimeFilter) {
  const now = new Date();
  switch (filter) {
    case 'day': { const s = new Date(now); s.setHours(0, 0, 0, 0); return { start: s, count: 24 }; }
    case 'week': { const s = new Date(now); s.setDate(s.getDate() - 6); s.setHours(0, 0, 0, 0); return { start: s, count: 7 }; }
    case 'month': { const s = new Date(now); s.setDate(s.getDate() - 29); s.setHours(0, 0, 0, 0); return { start: s, count: 30 }; }
    case 'year': { const s = new Date(now); s.setMonth(s.getMonth() - 11); s.setDate(1); s.setHours(0, 0, 0, 0); return { start: s, count: 12 }; }
  }
}

function buildBuckets(filter: TimeFilter) {
  const { start, count } = getDateRange(filter);
  const out: { key: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    if (filter === 'day') { d.setHours(d.getHours() + i); const h = d.getHours(); out.push({ key: h.toString(), label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p` }); }
    else if (filter === 'week' || filter === 'month') { d.setDate(d.getDate() + i); out.push({ key: d.toISOString().split('T')[0], label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }); }
    else { d.setMonth(d.getMonth() + i); out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${MONTH_SHORT[d.getMonth()]} '${String(d.getFullYear()).slice(2)}` }); }
  }
  return out;
}

function bKey(date: Date, filter: TimeFilter): string {
  switch (filter) {
    case 'day': return date.getHours().toString();
    case 'week': case 'month': return date.toISOString().split('T')[0];
    case 'year': return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
}

function buildCalendarMonth(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ─── Donut colors — vibrant and distinct ─────────────────────────────────────
const DONUT_COLORS = [C.primary, C.cyan, C.emerald, C.violet, C.amber, C.fuchsia, C.sky, C.teal];

// ═══════════════════════════════════════════════════════════════════════════════
export default function HospitalDashboardPage() {
  const { currentHospital, profile } = useAuth();
  const { getCurrentTime, formatTime24To12 } = useHospitalTimezone();

  const [patientFilter, setPatientFilter] = useState<TimeFilter>('month');
  const [apptFilter, setApptFilter] = useState<TimeFilter>('month');
  const [patientDoctor, setPatientDoctor] = useState('all');
  const [apptDoctor, setApptDoctor] = useState('all');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => getCurrentTime().getMonth());
  const [calYear, setCalYear] = useState(() => getCurrentTime().getFullYear());

  const userRole = profile?.isSuperAdmin ? 'SUPER_ADMIN' : (currentHospital?.role || 'STAFF');
  if (userRole === 'DOCTOR') return <DoctorDashboard />;

  // ─── Data ────────────────────────────────────────────────────────────────
  const { data: members = [], isLoading: ml } = useApiQuery<any[]>(['hospital', 'members', 'compliance'], '/v1/hospitals/members/compliance');
  const { data: staffData = [], isLoading: sl } = useApiQuery<any[]>(['hospital', 'staff'], '/v1/staff');
  const { data: invites = [], isLoading: il } = useApiQuery<any[]>(['hospital', 'invites'], '/v1/invites/pending');
  const { data: patients = [], isLoading: pl } = useApiQuery<any[]>(['hospital', 'patients'], '/v1/patients');
  const { data: licenseStats } = useApiQuery<any>(['hospital', 'license-stats'], '/v1/products/subscription/license-stats');

  const apptStart = useMemo(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0]; }, []);
  const apptEnd = useMemo(() => new Date().toISOString().split('T')[0], []);
  const { data: appointments = [] } = useApiQuery<any[]>(['hospital', 'appointments', 'all', apptStart, apptEnd], `/v1/appointments?startDate=${apptStart}&endDate=${apptEnd}`);

  // Fetch the selected doctor's profile to get the actual doctorProfileId (doctor_profiles.id)
  const { data: selectedDoctorProfileData } = useApiQuery<any>(
    ['hospital', 'doctor-profile', selectedDoctorId || ''],
    selectedDoctorId ? `/v1/doctors/${selectedDoctorId}/profile` : '',
    { enabled: !!selectedDoctorId }
  );
  const actualDoctorProfileId = selectedDoctorProfileData?.id || null;

  const { data: doctorScheduleRaw = [] } = useApiQuery<DoctorScheduleRaw[]>(
    ['hospital', 'doctor-schedule', selectedDoctorId || ''],
    selectedDoctorId ? `/v1/doctors/${selectedDoctorId}/schedules` : '',
    { enabled: !!selectedDoctorId }
  );
  const doctorSchedule = useMemo(() => doctorScheduleRaw.map(normalizeSchedule), [doctorScheduleRaw]);

  // Fetch time-off / leave data for the selected doctor
  interface TimeOffEntry { id: string; start_date: string; end_date: string; reason?: string; status: string; }
  const { data: doctorTimeOff = [] } = useApiQuery<TimeOffEntry[]>(
    ['hospital', 'doctor-timeoff', selectedDoctorId || ''],
    selectedDoctorId ? `/v1/doctors/${selectedDoctorId}/time-off` : '',
    { enabled: !!selectedDoctorId }
  );

  const loading = ml || sl || il || pl;

  // ─── Stats ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const docs = members.filter((m: any) => m.role === 'DOCTOR');
    const active = docs.filter((d: any) => d.complianceStatus === 'compliant').length;
    const pending = docs.filter((d: any) => d.complianceStatus === 'pending_signatures' || d.complianceStatus === 'not_logged_in').length;
    const tStaff = staffData.length;
    const aStaff = staffData.filter((s: any) => s.isActive).length;
    const pInvites = invites.filter((i: any) => i.status === 'PENDING').length;
    const lUsed = licenseStats?.totalUsed ?? active;
    const lTotal = licenseStats?.totalLicenses ?? 10;
    return { totalDoctors: docs.length, activeDoctors: active, pendingDoctors: pending, totalPatients: patients.length, totalStaff: tStaff, activeStaff: aStaff, licensesUsed: lUsed, licensesTotal: lTotal, pendingInvites: pInvites };
  }, [members, staffData, invites, patients, licenseStats]);

  const doctorList = useMemo(() => members.filter((m: any) => m.role === 'DOCTOR').map((d: any) => ({
    userId: d.userId, doctorProfileId: d.doctorProfileId || d.userId, name: d.fullName || d.email || 'Unknown', status: d.complianceStatus, specialty: d.specialty || '',
  })), [members]);

  // Use hospital timezone for "today" calculations
  const hospitalNow = useMemo(() => getCurrentTime(), []);
  const todayStr = useMemo(() => {
    const y = hospitalNow.getFullYear();
    const m = String(hospitalNow.getMonth() + 1).padStart(2, '0');
    const d = String(hospitalNow.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [hospitalNow]);
  const todayPatients = useMemo(() => patients.filter((p: any) => new Date(p.createdAt).toISOString().split('T')[0] === todayStr).length, [patients, todayStr]);
  const todayAppts = useMemo(() => appointments.filter((a: any) => (a.appointmentDate || '').startsWith(todayStr)).length, [appointments, todayStr]);

  // Check-in status via queue endpoint — uses actual doctorProfileId from doctor_profiles table
  const selectedDocProfile = useMemo(() => doctorList.find((d: any) => d.userId === selectedDoctorId), [doctorList, selectedDoctorId]);
  const { data: queueData } = useApiQuery<any>(
    ['hospital', 'doctor-checkin', actualDoctorProfileId || ''],
    actualDoctorProfileId ? `/v1/queue/daily?doctorProfileId=${actualDoctorProfileId}&date=${todayStr}` : '',
    { enabled: !!actualDoctorProfileId }
  );
  const doctorCheckin: DoctorCheckin = useMemo(() => {
    const c = queueData?.doctorCheckin;
    return { status: c?.status || null, checkedInAt: c?.checkedInAt || null, checkedOutAt: c?.checkedOutAt || null };
  }, [queueData]);

  useMemo(() => { if (!selectedDoctorId && doctorList.length > 0) setSelectedDoctorId(doctorList[0].userId); }, [doctorList, selectedDoctorId]);

  // Build chart doctor list from appointments data (has real doctorProfileId)
  const chartDoctorList = useMemo(() => {
    const map = new Map<string, string>();
    appointments.forEach((a: any) => {
      if (a.doctorProfileId && a.doctorName && !map.has(a.doctorProfileId)) {
        map.set(a.doctorProfileId, a.doctorName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ doctorProfileId: id, name }));
  }, [appointments]);

  // ─── Chart data ──────────────────────────────────────────────────────────
  const patientChartData = useMemo(() => {
    const { start } = getDateRange(patientFilter);
    const buckets = buildBuckets(patientFilter);
    const sorted = [...patients].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const relevantIds = patientDoctor !== 'all' ? new Set(appointments.filter((a: any) => a.doctorProfileId === patientDoctor).map((a: any) => a.patientId)) : null;
    const filtered = relevantIds ? sorted.filter((p: any) => relevantIds.has(p.id)) : sorted;
    const before = filtered.filter((p: any) => new Date(p.createdAt) < start).length;
    const nMap: Record<string, number> = {};
    buckets.forEach((b) => (nMap[b.key] = 0));
    filtered.forEach((p: any) => { const d = new Date(p.createdAt); if (d >= start) { const k = bKey(d, patientFilter); if (nMap[k] !== undefined) nMap[k]++; } });
    let tot = before;
    return buckets.map((b) => { const n = nMap[b.key] || 0; tot += n; return { label: b.label, 'New Patients': n, 'Returning (Total)': tot }; });
  }, [patients, patientFilter, patientDoctor, appointments]);

  const apptChartData = useMemo(() => {
    const { start } = getDateRange(apptFilter);
    const buckets = buildBuckets(apptFilter);
    const tM: Record<string, number> = {}, cM: Record<string, number> = {}, xM: Record<string, number> = {};
    buckets.forEach((b) => { tM[b.key] = 0; cM[b.key] = 0; xM[b.key] = 0; });
    appointments.forEach((a: any) => {
      if (apptDoctor !== 'all' && a.doctorProfileId !== apptDoctor) return;
      const d = new Date(a.appointmentDate || a.createdAt);
      if (d < start) return;
      const k = bKey(d, apptFilter);
      if (tM[k] !== undefined) { tM[k]++; if (a.status === 'COMPLETED') cM[k]++; if (a.status === 'CANCELLED' || a.status === 'NO_SHOW') xM[k]++; }
    });
    return buckets.map((b) => ({ label: b.label, Booked: tM[b.key], Completed: cM[b.key], Cancelled: xM[b.key] }));
  }, [appointments, apptFilter, apptDoctor]);

  // License donut
  const licenseDonutData = useMemo(() => {
    const products = licenseStats?.products;
    if (products && products.length > 0) {
      return products.map((p: any, i: number) => ({ name: p.productName || p.name || `Product ${i + 1}`, value: p.assignedCount ?? p.used ?? 0 }));
    }
    return [
      { name: 'Used', value: stats.licensesUsed, color: C.primary },
      { name: 'Available', value: Math.max(0, stats.licensesTotal - stats.licensesUsed), color: C.navy },
    ];
  }, [licenseStats, stats]);

  // Selected doctor info — use actualDoctorProfileId to match appointments correctly
  const selectedDocAppts = useMemo(() => {
    if (!actualDoctorProfileId) return { total: 0, completed: 0, today: 0 };
    const docAppts = appointments.filter((a: any) => a.doctorProfileId === actualDoctorProfileId);
    return {
      total: docAppts.length,
      completed: docAppts.filter((a: any) => a.status === 'COMPLETED').length,
      today: docAppts.filter((a: any) => (a.appointmentDate || '').startsWith(todayStr)).length,
    };
  }, [appointments, actualDoctorProfileId, todayStr]);

  // Doctor-specific metrics cards
  const docMetrics = useMemo(() => {
    if (!actualDoctorProfileId) return null;
    const docAppts = appointments.filter((a: any) => a.doctorProfileId === actualDoctorProfileId);
    const completed = docAppts.filter((a: any) => a.status === 'COMPLETED').length;
    const cancelled = docAppts.filter((a: any) => a.status === 'CANCELLED' || a.status === 'NO_SHOW').length;
    const uniquePatients = new Set(docAppts.map((a: any) => a.patientId)).size;
    const completionRate = docAppts.length > 0 ? Math.round((completed / docAppts.length) * 100) : 0;
    // This week
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0,0,0,0);
    const thisWeek = docAppts.filter((a: any) => new Date(a.appointmentDate || a.createdAt) >= weekStart).length;
    // This month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = docAppts.filter((a: any) => new Date(a.appointmentDate || a.createdAt) >= monthStart).length;
    return { completed, cancelled, uniquePatients, completionRate, thisWeek, thisMonth };
  }, [appointments, actualDoctorProfileId]);

  // Schedule
  const scheduleByDay = useMemo(() => { const m: Record<number, DoctorSchedule> = {}; doctorSchedule.forEach((s) => { m[s.dayOfWeek] = s; }); return m; }, [doctorSchedule]);
  const workingDaysSet = useMemo(() => { const set = new Set<number>(); doctorSchedule.filter(s => s.isWorking).forEach(s => set.add(s.dayOfWeek)); return set; }, [doctorSchedule]);
  const calendarCells = useMemo(() => buildCalendarMonth(calYear, calMonth), [calYear, calMonth]);
  const calWorkDates = useMemo(() => {
    const working = new Set<number>();
    calendarCells.forEach((day, idx) => { if (day !== null && workingDaysSet.has(idx % 7)) working.add(day); });
    return working;
  }, [calendarCells, workingDaysSet]);

  // Time-off dates for the current calendar month
  const timeOffDates = useMemo(() => {
    const offDates = new Set<number>();
    doctorTimeOff.forEach((t: any) => {
      const startParts = (t.start_date || '').split('-').map(Number);
      const endParts = (t.end_date || '').split('-').map(Number);
      if (startParts.length < 3 || endParts.length < 3) return;
      const start = new Date(startParts[0], startParts[1] - 1, startParts[2]);
      const end = new Date(endParts[0], endParts[1] - 1, endParts[2]);
      // Iterate through each day in the time-off range
      const cur = new Date(start);
      while (cur <= end) {
        if (cur.getMonth() === calMonth && cur.getFullYear() === calYear) {
          offDates.add(cur.getDate());
        }
        cur.setDate(cur.getDate() + 1);
      }
    });
    return offDates;
  }, [doctorTimeOff, calMonth, calYear]);

  const licensePct = stats.licensesTotal > 0 ? Math.round((stats.licensesUsed / stats.licensesTotal) * 100) : 0;
  const workDayCount = doctorSchedule.filter(s => s.isWorking).length;
  const offDayCount = 7 - workDayCount;

  if (loading) return null;

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); };

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-bold text-slate-900">Dashboard</h1>
        <p className="text-[10px] text-slate-400">{currentHospital?.name}</p>
      </div>

      {/* ── KPI Strip ──────────────────────────────────────────────── */}
      <div className="flex gap-1.5 flex-shrink-0 overflow-x-auto pb-0.5">
        {[
          { label: 'Doctors', val: stats.activeDoctors, sub: stats.pendingDoctors > 0 ? `+${stats.pendingDoctors} pending` : null, href: '/hospital/doctors', color: C.primary },
          { label: 'Patients', val: stats.totalPatients, sub: todayPatients > 0 ? `+${todayPatients} today` : null, href: '/hospital/patients', color: C.sky },
          { label: 'Staff', val: `${stats.activeStaff}/${stats.totalStaff}`, sub: null, href: '/hospital/staff', color: C.indigo },
          { label: 'Today', val: todayAppts, sub: 'appointments', href: '/hospital/appointments', color: C.cyan },
          { label: 'Licenses', val: `${stats.licensesUsed}/${stats.licensesTotal}`, sub: `${licensePct}% used`, href: '/hospital/billing', color: C.teal },
          { label: 'Invites', val: stats.pendingInvites, sub: 'pending', href: '/hospital/doctors', color: C.bright },
        ].map((kpi) => (
          <Link key={kpi.label} href={kpi.href}
            className="flex-1 min-w-[100px] bg-white rounded-lg border border-blue-100/80 px-2 py-1.5 hover:shadow-sm transition-all group"
            style={{ borderLeftWidth: 3, borderLeftColor: kpi.color }}>
            <p className="text-[7px] uppercase tracking-widest font-bold" style={{ color: kpi.color }}>{kpi.label}</p>
            <p className="text-sm font-bold text-slate-800 leading-none mt-0.5 group-hover:text-blue-700 transition-colors">{kpi.val}</p>
            {kpi.sub && <p className="text-[7px] text-slate-400 mt-px">{kpi.sub}</p>}
          </Link>
        ))}
      </div>

      {/* ── Row 1: Charts ─────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-12 gap-2 flex-shrink-0" style={{ height: '38%' }}>
        {/* Patient Growth */}
        <div className="lg:col-span-5 bg-white rounded-lg border border-blue-100/80 p-2.5 flex flex-col">
          <div className="flex items-center justify-between mb-1.5 gap-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-[11px] font-bold text-slate-800">Patient Growth</h3>
              <DoctorSelect value={patientDoctor} onChange={setPatientDoctor} doctors={chartDoctorList} />
            </div>
            <FilterPills value={patientFilter} onChange={setPatientFilter} />
          </div>
          {/* Legend keys at top */}
          <div className="flex gap-3 mb-1 flex-shrink-0">
            <ChartLegendItem color={C.primary} label="Returning (Total)" />
            <ChartLegendItem color={C.skyLight} label="New Patients" />
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={patientChartData} margin={{ top: 4, right: 4, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="pgFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.primary} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={C.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="pgNew" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.skyLight} stopOpacity={0.1} />
                    <stop offset="95%" stopColor={C.skyLight} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.wash} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={{ stroke: C.pale }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="Returning (Total)" stroke={C.primary} strokeWidth={2} fill="url(#pgFill)" dot={false} activeDot={{ r: 3, fill: '#fff', stroke: C.primary, strokeWidth: 2 }} />
                <Area type="monotone" dataKey="New Patients" stroke={C.skyLight} strokeWidth={2} fill="url(#pgNew)" dot={false} activeDot={{ r: 3, fill: '#fff', stroke: C.skyLight, strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Appointment Trends */}
        <div className="lg:col-span-5 bg-white rounded-lg border border-blue-100/80 p-2.5 flex flex-col">
          <div className="flex items-center justify-between mb-1.5 gap-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-[11px] font-bold text-slate-800">Appointments</h3>
              <DoctorSelect value={apptDoctor} onChange={setApptDoctor} doctors={chartDoctorList} />
            </div>
            <FilterPills value={apptFilter} onChange={setApptFilter} />
          </div>
          {/* Legend keys at top */}
          <div className="flex gap-3 mb-1 flex-shrink-0">
            <ChartLegendItem color={C.primary} label="Booked" />
            <ChartLegendItem color={C.cyan} label="Completed" />
            <ChartLegendItem color={C.muted} label="Cancelled" />
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={apptChartData} margin={{ top: 4, right: 4, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.wash} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={{ stroke: C.pale }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="Booked" stroke={C.primary} strokeWidth={2.5} dot={false} activeDot={{ r: 3, fill: '#fff', stroke: C.primary, strokeWidth: 2 }} />
                <Line type="monotone" dataKey="Completed" stroke={C.cyan} strokeWidth={2} dot={false} activeDot={{ r: 3, fill: '#fff', stroke: C.cyan, strokeWidth: 2 }} />
                <Line type="monotone" dataKey="Cancelled" stroke={C.muted} strokeWidth={1.5} strokeDasharray="4 2" dot={false} activeDot={{ r: 3, fill: '#fff', stroke: C.muted, strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* License Donut */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-blue-100/80 p-2.5 flex flex-col">
          <h3 className="text-[11px] font-bold text-slate-800 flex-shrink-0">Licenses</h3>
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center relative">
            <div style={{ width: '100%', height: '100%', maxHeight: 130 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={licenseDonutData} cx="50%" cy="50%" innerRadius="48%" outerRadius="85%" paddingAngle={3} dataKey="value" stroke="none">
                    {licenseDonutData.map((entry: any, i: number) => <Cell key={i} fill={entry.color || DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: `1px solid ${C.wash}`, fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-bold text-slate-800">{stats.licensesUsed}</span>
              <span className="text-[8px] text-blue-400 font-semibold">/ {stats.licensesTotal}</span>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5 flex-shrink-0">
            {licenseDonutData.map((d: any, i: number) => (
              <span key={i} className="flex items-center gap-1 text-[8px] text-slate-600 font-medium">
                <span className="w-2 h-2 rounded-sm" style={{ background: d.color || DONUT_COLORS[i % DONUT_COLORS.length] }} />{d.name} ({d.value})
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 2: Doctor Schedules + Calendar ────────────────────── */}
      <div className="bg-white rounded-lg border border-blue-100/80 flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Header with doctor dropdown */}
        <div className="px-3 py-2 border-b border-blue-50 flex-shrink-0 flex items-center gap-3">
          <h3 className="text-[11px] font-bold text-slate-800">Doctor Schedule & Availability</h3>
          <select
            value={selectedDoctorId || ''}
            onChange={(e) => setSelectedDoctorId(e.target.value || null)}
            className="text-[10px] border border-blue-200 rounded px-1.5 py-0.5 bg-blue-50/50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-300 font-medium max-w-[150px] truncate"
          >
            <option value="" disabled>Select a doctor...</option>
            {doctorList.map((d: any) => (
              <option key={d.userId} value={d.userId}>
                {d.name}{d.specialty ? ` — ${d.specialty}` : ''} {d.status === 'compliant' ? '' : '(Pending)'}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          {/* Doctor stats + check-in status */}
          {selectedDocProfile && (
            <div className="flex gap-4 items-center">
              {/* Check-in status */}
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                doctorCheckin.status === 'CHECKED_IN'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-slate-50 text-slate-400 border border-slate-200'
              }`}>
                <span className={`w-2 h-2 rounded-full ${doctorCheckin.status === 'CHECKED_IN' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                {doctorCheckin.status === 'CHECKED_IN' ? 'Checked In' : 'Checked Out'}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: C.primary }} />
                <span className="text-[10px] text-slate-500">Appts: <span className="font-bold text-slate-700">{selectedDocAppts.total}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: C.cyan }} />
                <span className="text-[10px] text-slate-500">Done: <span className="font-bold text-slate-700">{selectedDocAppts.completed}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: C.sky }} />
                <span className="text-[10px] text-slate-500">Today: <span className="font-bold text-slate-700">{selectedDocAppts.today}</span></span>
              </div>
            </div>
          )}
        </div>

        {/* Content — no scroll, everything fits */}
        {!selectedDoctorId ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-slate-400">Select a doctor from the dropdown above</p>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left: Calendar */}
            <div className="w-64 border-r border-blue-50 p-3 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <button onClick={prevMonth} className="p-1 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <p className="text-xs font-bold text-slate-700">{MONTH_NAMES[calMonth]} {calYear}</p>
                <button onClick={nextMonth} className="p-1 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
                  <div key={i} className="text-center text-[9px] font-bold text-blue-400 py-0.5">{d}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1 flex-1">
                {calendarCells.map((day, i) => {
                  if (day === null) return <div key={i} />;
                  const isToday = day === hospitalNow.getDate() && calMonth === hospitalNow.getMonth() && calYear === hospitalNow.getFullYear();
                  const isTimeOff = timeOffDates.has(day);
                  const isWork = calWorkDates.has(day) && !isTimeOff;
                  return (
                    <div key={i} className={`text-center py-1.5 rounded-md text-[10px] font-semibold transition-all ${
                      isToday
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                        : isTimeOff
                          ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-200 hover:bg-amber-100'
                          : isWork
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-red-50/70 text-red-300 hover:bg-red-100/50'
                    }`}>
                      {day}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-2 pt-2 border-t border-blue-50 flex items-center justify-center gap-3 flex-shrink-0">
                <span className="flex items-center gap-1 text-[9px] text-slate-500 font-medium">
                  <span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" />Working
                </span>
                <span className="flex items-center gap-1 text-[9px] text-slate-500 font-medium">
                  <span className="w-3 h-3 rounded bg-red-50/70 border border-red-100" />Off
                </span>
                <span className="flex items-center gap-1 text-[9px] text-slate-500 font-medium">
                  <span className="w-3 h-3 rounded bg-amber-50 border border-amber-200" />Leave
                </span>
                <span className="flex items-center gap-1 text-[9px] text-slate-500 font-medium">
                  <span className="w-3 h-3 rounded bg-blue-600 border border-blue-600" />Today
                </span>
              </div>
            </div>

            {/* Right: Weekly schedule + License status */}
            <div className="flex-1 p-3 flex flex-col gap-3">
              {/* Weekly schedule grid */}
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Weekly Schedule</p>
                <div className="grid grid-cols-7 gap-2">
                  {DAY_NAMES_SHORT.map((day, idx) => {
                    const s = scheduleByDay[idx];
                    const on = s?.isWorking;
                    const flags = on ? getShiftFlags(s.shiftStart, s.shiftEnd) : null;
                    return (
                      <div key={day} className={`rounded-lg p-2 text-center transition-all ${
                        on ? 'bg-gradient-to-b from-blue-50 to-sky-50 border border-blue-200 shadow-sm' : 'bg-slate-50/80 border border-slate-100'
                      }`}>
                        <p className={`text-[10px] font-bold ${on ? 'text-blue-700' : 'text-slate-300'}`}>{day}</p>
                        {on && flags ? (
                          <div className="mt-1.5 flex flex-col items-center gap-1">
                            {flags.morning && (
                              <div className="flex items-center gap-0.5">
                                <SunIcon className="w-3 h-3 text-amber-500 flex-shrink-0" />
                                <span className="text-[10px] font-bold text-amber-700">6–2</span>
                              </div>
                            )}
                            {flags.evening && (
                              <div className="flex items-center gap-0.5">
                                <SunsetIcon className="w-3 h-3 text-blue-500 flex-shrink-0" />
                                <span className="text-[10px] font-bold text-blue-700">2–10</span>
                              </div>
                            )}
                            {flags.night && (
                              <div className="flex items-center gap-0.5">
                                <MoonIcon className="w-3 h-3 text-purple-500 flex-shrink-0" />
                                <span className="text-[10px] font-bold text-purple-700">10–6</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-300 mt-1.5 font-medium">Off</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9px]">
                  <span className="flex items-center gap-1 text-blue-600 font-medium"><span className="w-2.5 h-2.5 rounded-full" style={{ background: C.primary }} />{workDayCount} working days</span>
                  <span className="flex items-center gap-1 text-slate-400"><span className="w-2.5 h-2.5 rounded-full bg-slate-200" />{offDayCount} days off</span>
                  {doctorTimeOff.length > 0 && (
                    <span className="flex items-center gap-1 text-amber-600 font-medium"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" />{doctorTimeOff.length} leave(s)</span>
                  )}
                </div>
              </div>

              {/* Doctor metrics cards */}
              {docMetrics && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-teal-50/60 rounded-lg px-2.5 py-2 border border-teal-100/60">
                    <p className="text-[8px] font-bold text-teal-500 uppercase tracking-wider">This Week</p>
                    <p className="text-base font-bold text-slate-800 leading-tight">{docMetrics.thisWeek}</p>
                    <p className="text-[8px] text-slate-400">appointments</p>
                  </div>
                  <div className="bg-teal-50/60 rounded-lg px-2.5 py-2 border border-teal-100/60">
                    <p className="text-[8px] font-bold text-teal-500 uppercase tracking-wider">This Month</p>
                    <p className="text-base font-bold text-slate-800 leading-tight">{docMetrics.thisMonth}</p>
                    <p className="text-[8px] text-slate-400">appointments</p>
                  </div>
                  <div className="bg-teal-50/60 rounded-lg px-2.5 py-2 border border-teal-100/60">
                    <p className="text-[8px] font-bold text-teal-500 uppercase tracking-wider">Completion</p>
                    <p className="text-base font-bold leading-tight" style={{ color: docMetrics.completionRate >= 80 ? C.emerald : docMetrics.completionRate >= 50 ? C.amber : '#EF4444' }}>{docMetrics.completionRate}%</p>
                    <p className="text-[8px] text-slate-400">rate</p>
                  </div>
                  <div className="bg-teal-50/60 rounded-lg px-2.5 py-2 border border-teal-100/60">
                    <p className="text-[8px] font-bold text-teal-500 uppercase tracking-wider">Patients</p>
                    <p className="text-base font-bold text-slate-800 leading-tight">{docMetrics.uniquePatients}</p>
                    <p className="text-[8px] text-slate-400">unique</p>
                  </div>
                  <div className="bg-teal-50/60 rounded-lg px-2.5 py-2 border border-teal-100/60">
                    <p className="text-[8px] font-bold text-teal-500 uppercase tracking-wider">Completed</p>
                    <p className="text-base font-bold text-slate-800 leading-tight">{docMetrics.completed}</p>
                    <p className="text-[8px] text-slate-400">total</p>
                  </div>
                  <div className="bg-teal-50/60 rounded-lg px-2.5 py-2 border border-teal-100/60">
                    <p className="text-[8px] font-bold text-teal-500 uppercase tracking-wider">Cancelled</p>
                    <p className="text-base font-bold leading-tight" style={{ color: docMetrics.cancelled > 0 ? '#EF4444' : C.muted }}>{docMetrics.cancelled}</p>
                    <p className="text-[8px] text-slate-400">no-show</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
