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

// Lazy-load recharts
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

type TimeFilter = 'week' | 'month';

// ─── Design Tokens (Navy Blue Only Palette) ──────────────────────────────────
const colors = {
  navy900: '#050d17',
  navy800: '#0a1a2e',
  navy700: '#0f2744',
  navy600: '#1e3a5f',
  navy500: '#2b5a8a',
  navy400: '#3d7ab8',
  navy300: '#5a9ad4',
  navy200: '#a3cbef',
  navy100: '#d1e5f7',
  navy50: '#e8f4fc',
  slate500: '#64748B',
  slate400: '#94A3B8',
  slate300: '#CBD5E1',
  slate200: '#E2E8F0',
};

// Chart colors - navy palette only
const chartColors = {
  primary: '#1e3a5f',   // navy-600
  secondary: '#3d7ab8', // navy-400
  tertiary: '#2b5a8a',  // navy-500
  light: '#5a9ad4',     // navy-300
  muted: '#94A3B8',     // slate-400
};

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── Components ──────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white px-2 py-1.5 rounded-lg shadow-lg border border-slate-200 text-xs">
      <p className="text-slate-500 mb-0.5 font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-semibold text-slate-800">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function FilterPills({ value, onChange }: { value: TimeFilter; onChange: (v: TimeFilter) => void }) {
  return (
    <div className="flex gap-0.5 bg-slate-100 rounded p-0.5">
      {[{ value: 'week' as TimeFilter, label: 'Week' }, { value: 'month' as TimeFilter, label: 'Month' }].map((f) => (
        <button key={f.value} onClick={() => onChange(f.value)}
          className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${
            value === f.value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}>
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ─── Date helpers ────────────────────────────────────────────────────────────
function getDateRange(filter: TimeFilter) {
  const now = new Date();
  switch (filter) {
    case 'week': { const s = new Date(now); s.setDate(s.getDate() - 6); s.setHours(0, 0, 0, 0); return { start: s, count: 7 }; }
    case 'month': { const s = new Date(now); s.setDate(s.getDate() - 29); s.setHours(0, 0, 0, 0); return { start: s, count: 30 }; }
  }
}

function buildBuckets(filter: TimeFilter) {
  const { start, count } = getDateRange(filter);
  const out: { key: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    out.push({ key: d.toISOString().split('T')[0], label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
  }
  return out;
}

function bKey(date: Date): string {
  return date.toISOString().split('T')[0];
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

function getShiftFlags(shiftStart: string | null, shiftEnd: string | null) {
  const startHour = parseInt(shiftStart?.split(':')[0] || '0');
  const endHour = parseInt(shiftEnd?.split(':')[0] || '0');
  return {
    morning: startHour < 14 && endHour > 6,
    evening: startHour < 22 && endHour > 14,
    night: endHour <= 6 || startHour >= 22,
  };
}

// Donut colors - navy shades only
const DONUT_COLORS = [chartColors.primary, chartColors.secondary, chartColors.light, chartColors.tertiary, chartColors.muted];

// ═══════════════════════════════════════════════════════════════════════════════
export default function HospitalDashboardPage() {
  const { currentHospital, profile } = useAuth();
  const { getCurrentTime } = useHospitalTimezone();

  const [patientFilter, setPatientFilter] = useState<TimeFilter>('month');
  const [apptFilter, setApptFilter] = useState<TimeFilter>('month');
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

  const hospitalNow = useMemo(() => getCurrentTime(), []);
  const todayStr = useMemo(() => {
    const y = hospitalNow.getFullYear();
    const m = String(hospitalNow.getMonth() + 1).padStart(2, '0');
    const d = String(hospitalNow.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [hospitalNow]);
  const todayPatients = useMemo(() => patients.filter((p: any) => new Date(p.createdAt).toISOString().split('T')[0] === todayStr).length, [patients, todayStr]);
  const todayAppts = useMemo(() => appointments.filter((a: any) => (a.appointmentDate || '').startsWith(todayStr)).length, [appointments, todayStr]);

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

  // ─── Chart data ──────────────────────────────────────────────────────────
  const patientChartData = useMemo(() => {
    const { start } = getDateRange(patientFilter);
    const buckets = buildBuckets(patientFilter);
    const sorted = [...patients].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const before = sorted.filter((p: any) => new Date(p.createdAt) < start).length;
    const nMap: Record<string, number> = {};
    buckets.forEach((b) => (nMap[b.key] = 0));
    sorted.forEach((p: any) => { const d = new Date(p.createdAt); if (d >= start) { const k = bKey(d); if (nMap[k] !== undefined) nMap[k]++; } });
    let tot = before;
    return buckets.map((b) => { const n = nMap[b.key] || 0; tot += n; return { label: b.label, 'New': n, 'Total': tot }; });
  }, [patients, patientFilter]);

  const apptChartData = useMemo(() => {
    const { start } = getDateRange(apptFilter);
    const buckets = buildBuckets(apptFilter);
    const tM: Record<string, number> = {}, cM: Record<string, number> = {};
    buckets.forEach((b) => { tM[b.key] = 0; cM[b.key] = 0; });
    appointments.forEach((a: any) => {
      const d = new Date(a.appointmentDate || a.createdAt);
      if (d < start) return;
      const k = bKey(d);
      if (tM[k] !== undefined) { tM[k]++; if (a.status === 'COMPLETED') cM[k]++; }
    });
    return buckets.map((b) => ({ label: b.label, Booked: tM[b.key], Completed: cM[b.key] }));
  }, [appointments, apptFilter]);

  const licenseDonutData = useMemo(() => {
    const products = licenseStats?.products;
    if (products && products.length > 0) {
      return products.map((p: any, i: number) => ({ name: p.productName || p.name || `Product ${i + 1}`, value: p.assignedCount ?? p.used ?? 0 }));
    }
    return [
      { name: 'Used', value: stats.licensesUsed },
      { name: 'Available', value: Math.max(0, stats.licensesTotal - stats.licensesUsed) },
    ];
  }, [licenseStats, stats]);

  // Team Status donut data
  const teamStatusData = useMemo(() => [
    { name: 'Active', value: stats.activeDoctors },
    { name: 'Pending', value: stats.pendingDoctors },
    { name: 'Invites', value: stats.pendingInvites },
  ].filter(d => d.value > 0), [stats]);

  // Appointment Status donut data
  const apptStatusData = useMemo(() => {
    const completed = appointments.filter((a: any) => a.status === 'COMPLETED').length;
    const scheduled = appointments.filter((a: any) => a.status === 'SCHEDULED' || a.status === 'BOOKED').length;
    const cancelled = appointments.filter((a: any) => a.status === 'CANCELLED' || a.status === 'NO_SHOW').length;
    return [
      { name: 'Completed', value: completed },
      { name: 'Scheduled', value: scheduled },
      { name: 'Cancelled', value: cancelled },
    ].filter(d => d.value > 0);
  }, [appointments]);

  const selectedDocAppts = useMemo(() => {
    if (!actualDoctorProfileId) return { total: 0, completed: 0, today: 0 };
    const docAppts = appointments.filter((a: any) => a.doctorProfileId === actualDoctorProfileId);
    return {
      total: docAppts.length,
      completed: docAppts.filter((a: any) => a.status === 'COMPLETED').length,
      today: docAppts.filter((a: any) => (a.appointmentDate || '').startsWith(todayStr)).length,
    };
  }, [appointments, actualDoctorProfileId, todayStr]);

  const docMetrics = useMemo(() => {
    if (!actualDoctorProfileId) return null;
    const docAppts = appointments.filter((a: any) => a.doctorProfileId === actualDoctorProfileId);
    const completed = docAppts.filter((a: any) => a.status === 'COMPLETED').length;
    const cancelled = docAppts.filter((a: any) => a.status === 'CANCELLED' || a.status === 'NO_SHOW').length;
    const uniquePatients = new Set(docAppts.map((a: any) => a.patientId)).size;
    const completionRate = docAppts.length > 0 ? Math.round((completed / docAppts.length) * 100) : 0;
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0,0,0,0);
    const thisWeek = docAppts.filter((a: any) => new Date(a.appointmentDate || a.createdAt) >= weekStart).length;
    return { completed, cancelled, uniquePatients, completionRate, thisWeek };
  }, [appointments, actualDoctorProfileId]);

  const scheduleByDay = useMemo(() => { const m: Record<number, DoctorSchedule> = {}; doctorSchedule.forEach((s) => { m[s.dayOfWeek] = s; }); return m; }, [doctorSchedule]);
  const workingDaysSet = useMemo(() => { const set = new Set<number>(); doctorSchedule.filter(s => s.isWorking).forEach(s => set.add(s.dayOfWeek)); return set; }, [doctorSchedule]);
  const calendarCells = useMemo(() => buildCalendarMonth(calYear, calMonth), [calYear, calMonth]);
  const calWorkDates = useMemo(() => {
    const working = new Set<number>();
    calendarCells.forEach((day, idx) => { if (day !== null && workingDaysSet.has(idx % 7)) working.add(day); });
    return working;
  }, [calendarCells, workingDaysSet]);

  const timeOffDates = useMemo(() => {
    const offDates = new Set<number>();
    doctorTimeOff.forEach((t: any) => {
      const startParts = (t.start_date || '').split('-').map(Number);
      const endParts = (t.end_date || '').split('-').map(Number);
      if (startParts.length < 3 || endParts.length < 3) return;
      const start = new Date(startParts[0], startParts[1] - 1, startParts[2]);
      const end = new Date(endParts[0], endParts[1] - 1, endParts[2]);
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

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); };

  return (
    <div className="page-fullheight flex flex-col gap-2 p-2 overflow-hidden">
      {/* Compact Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-base font-semibold text-slate-900">Dashboard</h1>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{hospitalNow.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        </div>
      </div>

      {/* KPI Cards - Compact Row with Clear Headers */}
      <div className="grid grid-cols-6 gap-2 flex-shrink-0">
        {[
          { label: 'Doctors', value: stats.activeDoctors, sub: stats.pendingDoctors > 0 ? `+${stats.pendingDoctors} pending` : 'active', href: '/hospital/doctors' },
          { label: 'Patients', value: stats.totalPatients, sub: todayPatients > 0 ? `+${todayPatients} today` : 'total', href: '/hospital/patients' },
          { label: 'Staff', value: `${stats.activeStaff}/${stats.totalStaff}`, sub: 'active', href: '/hospital/staff' },
          { label: 'Appointments', value: todayAppts, sub: 'today', href: '/hospital/appointments' },
          { label: 'Licenses', value: `${stats.licensesUsed}/${stats.licensesTotal}`, sub: `${licensePct}%`, href: '/hospital/billing' },
          { label: 'Invites', value: stats.pendingInvites, sub: 'pending', href: '/hospital/doctors?action=invite' },
        ].map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className="bg-white rounded-lg border border-slate-200 p-2.5 hover:border-navy-300 transition-all">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{kpi.label}</p>
            <div className="flex items-center justify-between">
              <span className="text-xl font-bold text-slate-900">{kpi.value}</span>
              <span className="text-[9px] text-navy-600 bg-navy-50 px-1.5 py-0.5 rounded font-medium">{kpi.sub}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
        {/* Left Column - Charts Stacked */}
        <div className="w-1/2 flex flex-col gap-2 min-h-0">
          {/* Donut Charts Row - 3 donuts side by side */}
          <div className="h-28 flex gap-2 flex-shrink-0">
            {/* License Usage Donut */}
            <div className="flex-1 bg-white rounded-lg border border-slate-200 p-2 flex items-center gap-2">
              <div className="relative w-16 h-16 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={licenseDonutData} cx="50%" cy="50%" innerRadius="55%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none">
                      {licenseDonutData.map((_, i: number) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs font-bold text-slate-900">{stats.licensesUsed}</span>
                  <span className="text-[8px] text-slate-400">/{stats.licensesTotal}</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Licenses</p>
                <div className="space-y-0.5">
                  {licenseDonutData.slice(0, 2).map((d: any, i: number) => (
                    <span key={i} className="flex items-center gap-1 text-[9px] text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="truncate">{d.name}: {d.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Team Status Donut */}
            <div className="flex-1 bg-white rounded-lg border border-slate-200 p-2 flex items-center gap-2">
              <div className="relative w-16 h-16 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={teamStatusData.length > 0 ? teamStatusData : [{ name: 'None', value: 1 }]} cx="50%" cy="50%" innerRadius="55%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none">
                      {(teamStatusData.length > 0 ? teamStatusData : [{ name: 'None', value: 1 }]).map((_, i: number) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs font-bold text-slate-900">{stats.totalDoctors}</span>
                  <span className="text-[8px] text-slate-400">total</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Team</p>
                <div className="space-y-0.5">
                  {teamStatusData.slice(0, 3).map((d: any, i: number) => (
                    <span key={i} className="flex items-center gap-1 text-[9px] text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="truncate">{d.name}: {d.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Appointment Status Donut */}
            <div className="flex-1 bg-white rounded-lg border border-slate-200 p-2 flex items-center gap-2">
              <div className="relative w-16 h-16 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={apptStatusData.length > 0 ? apptStatusData : [{ name: 'None', value: 1 }]} cx="50%" cy="50%" innerRadius="55%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none">
                      {(apptStatusData.length > 0 ? apptStatusData : [{ name: 'None', value: 1 }]).map((_, i: number) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs font-bold text-slate-900">{appointments.length}</span>
                  <span className="text-[8px] text-slate-400">appts</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Appts</p>
                <div className="space-y-0.5">
                  {apptStatusData.slice(0, 3).map((d: any, i: number) => (
                    <span key={i} className="flex items-center gap-1 text-[9px] text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="truncate">{d.name}: {d.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Patient Growth Chart */}
          <div className="flex-1 bg-white rounded-lg border border-slate-200 p-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h3 className="text-xs font-semibold text-slate-900">Patient Growth</h3>
              <FilterPills value={patientFilter} onChange={setPatientFilter} />
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={patientChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="patientFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="Total" stroke={chartColors.primary} strokeWidth={2} fill="url(#patientFill)" dot={false} />
                  <Area type="monotone" dataKey="New" stroke={chartColors.secondary} strokeWidth={1.5} fill="none" dot={false} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-shrink-0">
              <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2.5 h-0.5 rounded" style={{ background: chartColors.primary }} />Total</span>
              <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2.5 h-0.5 rounded" style={{ background: chartColors.secondary, borderStyle: 'dashed' }} />New</span>
            </div>
          </div>

          {/* Appointments Chart */}
          <div className="flex-1 bg-white rounded-lg border border-slate-200 p-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h3 className="text-xs font-semibold text-slate-900">Appointments</h3>
              <FilterPills value={apptFilter} onChange={setApptFilter} />
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={apptChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="Booked" stroke={chartColors.primary} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Completed" stroke={chartColors.light} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-shrink-0">
              <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2.5 h-0.5 rounded" style={{ background: chartColors.primary }} />Booked</span>
              <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2.5 h-0.5 rounded" style={{ background: chartColors.light }} />Completed</span>
            </div>
          </div>
        </div>

        {/* Right Column - Doctor Schedule & Calendar */}
        <div className="w-1/2 bg-white rounded-lg border border-slate-200 flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-slate-900">Doctor Schedule</h3>
              <select
                value={selectedDoctorId || ''}
                onChange={(e) => setSelectedDoctorId(e.target.value || null)}
                className="text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 max-w-[120px] truncate"
              >
                <option value="" disabled>Select...</option>
                {doctorList.map((d: any) => (
                  <option key={d.userId} value={d.userId}>{d.name}</option>
                ))}
              </select>
            </div>
            {selectedDocProfile && (
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  doctorCheckin.status === 'CHECKED_IN' ? 'bg-navy-50 text-navy-600' : 'bg-slate-100 text-slate-500'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${doctorCheckin.status === 'CHECKED_IN' ? 'bg-navy-500' : 'bg-slate-400'}`} />
                  {doctorCheckin.status === 'CHECKED_IN' ? 'Online' : 'Offline'}
                </span>
              </div>
            )}
          </div>

          {!selectedDoctorId ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-slate-400">Select a doctor to view schedule</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden p-3 gap-3">
              {/* Calendar Section */}
              <div className="flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <button onClick={prevMonth} className="p-1 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <h4 className="text-sm font-semibold text-slate-800">{MONTH_NAMES[calMonth]} {calYear}</h4>
                  <button onClick={nextMonth} className="p-1 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                    <div key={i} className="text-center text-[10px] font-semibold text-slate-400 py-1">{d}</div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarCells.map((day, i) => {
                    if (day === null) return <div key={i} className="aspect-square" />;
                    const isToday = day === hospitalNow.getDate() && calMonth === hospitalNow.getMonth() && calYear === hospitalNow.getFullYear();
                    const isTimeOff = timeOffDates.has(day);
                    const isWork = calWorkDates.has(day) && !isTimeOff;
                    return (
                      <div key={i} className={`aspect-square flex items-center justify-center rounded-md text-xs font-medium transition-colors ${
                        isToday ? 'bg-navy-600 text-white shadow-sm'
                          : isTimeOff ? 'bg-navy-100 text-navy-500'
                          : isWork ? 'bg-navy-50 text-navy-700 border border-navy-100'
                          : 'text-slate-300'
                      }`}>
                        {day}
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="mt-2 flex items-center justify-center gap-4 text-[10px]">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <span className="w-3 h-3 rounded bg-navy-50 border border-navy-100" />Working
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <span className="w-3 h-3 rounded bg-navy-100" />Leave
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <span className="w-3 h-3 rounded bg-navy-600" />Today
                  </span>
                </div>
              </div>

              {/* Weekly Schedule with Times */}
              <div className="flex-shrink-0 border-t border-slate-100 pt-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Weekly Hours</p>
                <div className="space-y-1">
                  {DAY_NAMES_SHORT.map((day, idx) => {
                    const s = scheduleByDay[idx];
                    const on = s?.isWorking;
                    const formatTime = (t: string | null) => {
                      if (!t) return '--';
                      const [h, m] = t.split(':').map(Number);
                      const ampm = h >= 12 ? 'PM' : 'AM';
                      const h12 = h % 12 || 12;
                      return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
                    };
                    return (
                      <div key={day} className={`flex items-center justify-between py-1.5 px-2 rounded-md ${
                        on ? 'bg-navy-50' : 'bg-slate-50'
                      }`}>
                        <span className={`text-xs font-medium w-10 ${on ? 'text-navy-700' : 'text-slate-400'}`}>{day}</span>
                        {on ? (
                          <span className="text-xs font-semibold text-navy-600">
                            {formatTime(s.shiftStart)} — {formatTime(s.shiftEnd)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Day Off</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Compact Metrics */}
              {docMetrics && (
                <div className="flex-shrink-0 border-t border-slate-100 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    {[
                      { label: 'Week', value: docMetrics.thisWeek },
                      { label: 'Today', value: selectedDocAppts.today },
                      { label: 'Done', value: `${docMetrics.completionRate}%` },
                      { label: 'Patients', value: docMetrics.uniquePatients },
                    ].map((m, i) => (
                      <div key={i} className="flex-1 text-center py-1.5 bg-slate-50 rounded border border-slate-100">
                        <p className="text-sm font-bold text-navy-600">{m.value}</p>
                        <p className="text-[8px] text-slate-400 uppercase">{m.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
