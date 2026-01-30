'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';

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
  shift_type?: string;
}

interface DoctorSchedule {
  dayOfWeek: number;
  isWorking: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
  shiftType: string | null;
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
    shiftType: raw.shift_type ?? raw.shiftType ?? null,
  };
}

type TimeFilter = 'day' | 'week' | 'month' | 'year';

// Chart colors - navy blue palette only
const chartColors = {
  primary: '#1e3a5f',   // navy-600 - dark navy
  secondary: '#2b5a8a', // navy-500
  tertiary: '#3d7ab8',  // navy-400
  accent: '#5a9ad4',    // navy-300 - sky navy
  light: '#a3cbef',     // navy-200
  muted: '#d1e5f7',     // navy-100
};

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
      {[
        { value: 'day' as TimeFilter, label: 'Day' },
        { value: 'week' as TimeFilter, label: 'Week' },
        { value: 'month' as TimeFilter, label: 'Month' },
        { value: 'year' as TimeFilter, label: 'Year' },
      ].map((f) => (
        <button key={f.value} onClick={() => onChange(f.value)}
          className={`w-10 py-0.5 text-[9px] rounded font-medium transition-all text-center ${
            value === f.value ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}>
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ─── Custom Dropdown ─────────────────────────────────────────────────────────
function CustomSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find(o => o.value === value)?.label || placeholder || 'Select...';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 border border-slate-200 bg-white cursor-pointer hover:border-[#2b5a8a] focus:outline-none focus:ring-1 focus:ring-[#a3cbef] transition-all text-[11px] rounded-md px-2.5 py-1 min-w-[100px] ${open ? 'border-[#2b5a8a] ring-1 ring-[#a3cbef]' : ''}`}
      >
        <span className="flex-1 text-left truncate text-slate-900 font-medium">{selectedLabel}</span>
        <svg className={`flex-shrink-0 w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 shadow-lg overflow-hidden rounded-md"
          style={{ maxHeight: '180px', overflowY: 'auto' }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${
                opt.value === value
                  ? 'bg-[#1e3a5f] text-white font-medium'
                  : 'text-slate-700 hover:bg-[#e8f4fc] hover:text-[#1e3a5f]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Date helpers ────────────────────────────────────────────────────────────
function getDateRange(filter: TimeFilter) {
  const now = new Date();
  switch (filter) {
    case 'day': { const s = new Date(now); s.setHours(0, 0, 0, 0); return { start: s, count: 1, type: 'hours' as const }; }
    case 'week': { const s = new Date(now); s.setDate(s.getDate() - 6); s.setHours(0, 0, 0, 0); return { start: s, count: 7, type: 'days' as const }; }
    case 'month': { const s = new Date(now); s.setDate(s.getDate() - 29); s.setHours(0, 0, 0, 0); return { start: s, count: 30, type: 'days' as const }; }
    case 'year': { const s = new Date(now); s.setMonth(s.getMonth() - 11); s.setDate(1); s.setHours(0, 0, 0, 0); return { start: s, count: 12, type: 'months' as const }; }
  }
}

function buildBuckets(filter: TimeFilter) {
  const { start, count, type } = getDateRange(filter);
  const out: { key: string; label: string }[] = [];

  if (type === 'hours') {
    // 24 hour buckets for today
    for (let i = 0; i < 24; i += 2) {
      const h = i.toString().padStart(2, '0');
      out.push({ key: `${start.toISOString().split('T')[0]}-${h}`, label: `${i % 12 || 12}${i < 12 ? 'a' : 'p'}` });
    }
  } else if (type === 'months') {
    for (let i = 0; i < count; i++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ key, label: d.toLocaleDateString('en-US', { month: 'short' }) });
    }
  } else {
    for (let i = 0; i < count; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      out.push({ key: d.toISOString().split('T')[0], label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
    }
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

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Donut colors - navy shades only
const DONUT_COLORS = [chartColors.primary, chartColors.secondary, chartColors.light, chartColors.tertiary, chartColors.muted];

// ═══════════════════════════════════════════════════════════════════════════════
export default function HospitalDashboardPage() {
  const { currentHospital, profile } = useAuth();
  const { getCurrentTime } = useHospitalTimezone();

  const [apptTrendFilter, setApptTrendFilter] = useState<TimeFilter>('week');
  const [patientTrendFilter, setPatientTrendFilter] = useState<TimeFilter>('week');
  const [patientBarFilter, setPatientBarFilter] = useState<'day' | 'week' | 'month' | 'year'>('week');
  const [chartDoctorFilter, setChartDoctorFilter] = useState<string | null>(null); // null = All Hospital
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

  // Queue stats for walk-in trends
  const { data: queueStats = [] } = useApiQuery<{ date: string; walkIns: number; scheduled: number }[]>(
    ['hospital', 'queue-stats', apptStart, apptEnd, chartDoctorFilter || ''],
    `/v1/queue/stats?startDate=${apptStart}&endDate=${apptEnd}${chartDoctorFilter ? `&doctorProfileId=${chartDoctorFilter}` : ''}`
  );

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
    const aStaff = staffData.filter((s: any) => s.status === 'ACTIVE').length;
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

  useEffect(() => { if (!selectedDoctorId && doctorList.length > 0) setSelectedDoctorId(doctorList[0].userId); }, [doctorList, selectedDoctorId]);

  // ─── Chart data ──────────────────────────────────────────────────────────
  const apptTrendData = useMemo(() => {
    const { start, type } = getDateRange(apptTrendFilter);
    const buckets = buildBuckets(apptTrendFilter);

    const scheduledMap: Record<string, number> = {};
    const walkInMap: Record<string, number> = {};
    buckets.forEach((b) => { scheduledMap[b.key] = 0; walkInMap[b.key] = 0; });

    // Count actual scheduled appointments
    const relevantAppts = chartDoctorFilter
      ? appointments.filter((a: any) => a.doctorProfileId === chartDoctorFilter || a.doctorId === chartDoctorFilter)
      : appointments;

    relevantAppts.forEach((a: any) => {
      const d = new Date(a.appointmentDate || a.createdAt);
      if (d < start) return;

      let k: string;
      if (type === 'hours') {
        const h = Math.floor(d.getHours() / 2) * 2;
        k = `${d.toISOString().split('T')[0]}-${h.toString().padStart(2, '0')}`;
      } else if (type === 'months') {
        k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else {
        k = bKey(d);
      }

      if (scheduledMap[k] !== undefined) scheduledMap[k]++;
    });

    // Walk-ins from queue stats
    queueStats.forEach((stat) => {
      const d = new Date(stat.date);
      if (d < start) return;

      let k: string;
      if (type === 'hours') return;
      else if (type === 'months') {
        k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else {
        k = stat.date;
      }

      if (walkInMap[k] !== undefined) walkInMap[k] += stat.walkIns;
    });

    return buckets.map((b) => ({
      label: b.label,
      'Scheduled Appointments': scheduledMap[b.key] || 0,
      'Walk-ins': walkInMap[b.key] || 0,
    }));
  }, [appointments, apptTrendFilter, chartDoctorFilter, queueStats]);

  // New vs Returning patients per time bucket
  const patientNewVsReturningData = useMemo(() => {
    const { start, type } = getDateRange(patientTrendFilter);
    const buckets = buildBuckets(patientTrendFilter);
    const newMap: Record<string, Set<string>> = {};
    const retMap: Record<string, Set<string>> = {};
    buckets.forEach((b) => { newMap[b.key] = new Set(); retMap[b.key] = new Set(); });

    const patientCreated = new Map<string, Date>();
    patients.forEach((p: any) => patientCreated.set(p.id, new Date(p.createdAt)));

    const relevantAppts = chartDoctorFilter
      ? appointments.filter((a: any) => a.doctorProfileId === chartDoctorFilter || a.doctorId === chartDoctorFilter)
      : appointments;

    relevantAppts.forEach((a: any) => {
      const d = new Date(a.appointmentDate || a.createdAt);
      if (d < start) return;
      const pid = a.patientId;
      if (!pid) return;

      let k: string;
      if (type === 'hours') {
        const h = Math.floor(d.getHours() / 2) * 2;
        k = `${d.toISOString().split('T')[0]}-${h.toString().padStart(2, '0')}`;
      } else if (type === 'months') {
        k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else {
        k = bKey(d);
      }
      if (!newMap[k]) return;

      const created = patientCreated.get(pid);
      if (created && created >= start) {
        newMap[k].add(pid);
      } else {
        retMap[k].add(pid);
      }
    });

    return buckets.map((b) => ({
      label: b.label,
      'New Patients': newMap[b.key].size,
      'Returning Patients': retMap[b.key].size,
    }));
  }, [patients, appointments, patientTrendFilter, chartDoctorFilter]);

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

  // Patient Bar Chart data (new vs existing)
  const patientBarData = useMemo(() => {
    const now = new Date();
    let periodStart: Date;
    let periodLabel: string;

    switch (patientBarFilter) {
      case 'day':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodLabel = 'Today';
        break;
      case 'week':
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - now.getDay());
        periodStart.setHours(0, 0, 0, 0);
        periodLabel = 'This Week';
        break;
      case 'year':
        periodStart = new Date(now.getFullYear(), 0, 1);
        periodLabel = 'This Year';
        break;
      default: // month
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodLabel = 'This Month';
    }

    // New patients: created within the period
    const newPatients = patients.filter((p: any) => new Date(p.createdAt) >= periodStart).length;

    // Existing patients: created before the period but had appointments within the period
    const existingPatientIds = new Set(
      appointments
        .filter((a: any) => {
          const apptDate = new Date(a.appointmentDate || a.createdAt);
          return apptDate >= periodStart;
        })
        .map((a: any) => a.patientId)
    );

    const existingPatients = patients.filter((p: any) => {
      const created = new Date(p.createdAt);
      return created < periodStart && existingPatientIds.has(p.id);
    }).length;

    return { newPatients, existingPatients, periodLabel };
  }, [patients, appointments, patientBarFilter]);

  // Derive shift types (AM/PM/NT) from the time range
  const scheduleByDay = useMemo(() => {
    const m: Record<number, { shiftType: string; shiftStart: string; shiftEnd: string }[]> = {};

    doctorSchedule.forEach((s) => {
      if (!s.isWorking) return;
      if (!m[s.dayOfWeek]) m[s.dayOfWeek] = [];

      const startHour = parseInt(s.shiftStart?.split(':')[0] || '0');
      const endHour = parseInt(s.shiftEnd?.split(':')[0] || '0');

      // Derive which shifts are active based on time range overlap
      const hasMorning = startHour < 14 && endHour > 6;
      const hasEvening = startHour < 22 && endHour > 14;
      const hasNight = endHour <= 6 || startHour >= 22;

      // Add individual shift entries with their standard times
      if (hasMorning) {
        m[s.dayOfWeek].push({ shiftType: 'AM', shiftStart: '06:00', shiftEnd: '14:00' });
      }
      if (hasEvening) {
        m[s.dayOfWeek].push({ shiftType: 'AFT', shiftStart: '14:00', shiftEnd: '22:00' });
      }
      if (hasNight) {
        m[s.dayOfWeek].push({ shiftType: 'NT', shiftStart: '22:00', shiftEnd: '06:00' });
      }
    });
    return m;
  }, [doctorSchedule]);
  const upcomingLeave = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return doctorTimeOff
      .filter((t: any) => {
        const ep = (t.end_date || '').split('-').map(Number);
        if (ep.length < 3) return false;
        return new Date(ep[0], ep[1] - 1, ep[2]) >= today;
      })
      .sort((a: any, b: any) => (a.start_date || '').localeCompare(b.start_date || ''))
      .slice(0, 4);
  }, [doctorTimeOff]);

  const totalUpcomingLeaves = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return doctorTimeOff.filter((t: any) => {
      const ep = (t.end_date || '').split('-').map(Number);
      if (ep.length < 3) return false;
      return new Date(ep[0], ep[1] - 1, ep[2]) >= today;
    }).length;
  }, [doctorTimeOff]);

  const workingDaysPerWeek = useMemo(() => Object.keys(scheduleByDay).length, [scheduleByDay]);

  const doctorPatientsThisWeek = useMemo(() => {
    if (!actualDoctorProfileId) return 0;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const seen = new Set<string>();
    appointments.forEach((a: any) => {
      if ((a.doctorProfileId === actualDoctorProfileId || a.doctorId === actualDoctorProfileId) && a.patientId) {
        const d = new Date(a.appointmentDate || a.createdAt);
        if (d >= weekStart) seen.add(a.patientId);
      }
    });
    return seen.size;
  }, [appointments, actualDoctorProfileId]);

  const workingDaysSet = useMemo(() => {
    const set = new Set<number>();
    doctorSchedule.filter(s => s.isWorking).forEach(s => set.add(s.dayOfWeek));
    return set;
  }, [doctorSchedule]);

  const calendarMonth = useMemo(() => {
    const cells = buildCalendarMonth(calYear, calMonth);
    const workDates = new Set<number>();
    cells.forEach((day, idx) => { if (day !== null && workingDaysSet.has(idx % 7)) workDates.add(day); });
    const offDates = new Set<number>();
    doctorTimeOff.forEach((t: any) => {
      const sp = (t.start_date || '').split('-').map(Number);
      const ep = (t.end_date || '').split('-').map(Number);
      if (sp.length < 3 || ep.length < 3) return;
      const s = new Date(sp[0], sp[1] - 1, sp[2]);
      const e = new Date(ep[0], ep[1] - 1, ep[2]);
      const c = new Date(s);
      while (c <= e) {
        if (c.getMonth() === calMonth && c.getFullYear() === calYear) {
          offDates.add(c.getDate());
        }
        c.setDate(c.getDate() + 1);
      }
    });
    return { month: calMonth, year: calYear, cells, workDates, offDates };
  }, [calMonth, calYear, workingDaysSet, doctorTimeOff]);

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); };

  const licensePct = stats.licensesTotal > 0 ? Math.round((stats.licensesUsed / stats.licensesTotal) * 100) : 0;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="page-fullheight flex flex-col gap-1.5 p-2 overflow-y-auto lg:overflow-hidden">
      {/* Compact Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-base font-semibold text-slate-900">Dashboard</h1>
      </div>

      {/* KPI Cards - Responsive Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 sm:gap-2 flex-shrink-0">
        {[
          { label: 'Doctors', value: stats.activeDoctors, sub: stats.pendingDoctors > 0 ? `+${stats.pendingDoctors} pending` : 'active' },
          { label: 'Patients', value: stats.totalPatients, sub: todayPatients > 0 ? `+${todayPatients} today` : 'total' },
          { label: 'Staff', value: stats.activeStaff, sub: 'active' },
          { label: 'Appointments', value: todayAppts, sub: 'today' },
          { label: 'Licenses', value: `${stats.licensesUsed}/${stats.licensesTotal}`, sub: `${licensePct}%` },
          { label: 'Invites', value: stats.pendingInvites, sub: 'pending' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-lg border border-slate-200 p-1.5 sm:p-2.5">
            <p className="text-[8px] sm:text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-0.5 sm:mb-1">{kpi.label}</p>
            <div className="flex items-center justify-between">
              <span className="text-sm sm:text-xl font-bold text-slate-900">{kpi.value}</span>
              <span className="text-[7px] sm:text-[9px] text-navy-600 bg-navy-50 px-1 sm:px-1.5 py-px sm:py-0.5 rounded font-medium">{kpi.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content - Two Column Layout (stacks on mobile) */}
      <div className="lg:flex-1 flex flex-col lg:flex-row gap-1.5 lg:min-h-0 lg:overflow-hidden">
        {/* Left Column - Charts Stacked */}
        <div className="w-full lg:w-1/2 flex flex-col gap-1.5 lg:min-h-0">
          {/* Donut Charts Row - 2 donuts side by side */}
          <div className="flex flex-row gap-1.5 sm:gap-2 flex-shrink-0 sm:h-32">
            {/* License Usage Donut */}
            <div className="w-2/5 bg-white rounded-lg border border-slate-200 p-2 sm:p-3 flex flex-col">
              <h3 className="text-[9px] sm:text-xs font-semibold text-slate-900 mb-1 sm:mb-1.5 uppercase tracking-wide">LICENSES</h3>
              <div className="flex items-center gap-2 sm:gap-3 flex-1">
                <div className="relative flex-shrink-0 w-[55px] h-[55px] sm:w-[80px] sm:h-[80px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={licenseDonutData} cx="50%" cy="50%" innerRadius="55%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none">
                        {licenseDonutData.map((_, i: number) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[9px] sm:text-base font-bold text-slate-900">{stats.licensesUsed}</span>
                    <span className="text-[6px] sm:text-[10px] text-slate-700 font-semibold">/{stats.licensesTotal}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
                  {licenseDonutData.slice(0, 2).map((d: any, i: number) => (
                    <span key={i} className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-xs text-slate-700 font-medium">
                      <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="truncate">{d.name}: {d.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Patient Donut (New vs Existing) */}
            <div className="w-3/5 bg-white rounded-lg border border-slate-200 p-2 sm:p-3 flex flex-col">
              <div className="flex items-center justify-between mb-1 sm:mb-1.5">
                <h3 className="text-[9px] sm:text-xs font-semibold text-slate-900 uppercase tracking-wide">PATIENTS</h3>
                <FilterPills value={patientBarFilter} onChange={setPatientBarFilter} />
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-1">
                <div className="relative flex-shrink-0 w-[55px] h-[55px] sm:w-[80px] sm:h-[80px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'New', value: patientBarData.newPatients || 0 },
                          { name: 'Returning', value: patientBarData.existingPatients || 0 }
                        ].filter(d => d.value > 0)}
                        cx="50%" cy="50%" innerRadius="55%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none"
                      >
                        <Cell fill={chartColors.accent} />
                        <Cell fill={chartColors.primary} />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[9px] sm:text-base font-bold text-slate-900">{patientBarData.newPatients + patientBarData.existingPatients}</span>
                    <span className="text-[6px] sm:text-[10px] text-slate-700 font-semibold">total</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-4">
                  <span className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-xs text-slate-700 font-medium">
                    <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm flex-shrink-0" style={{ background: chartColors.accent }} />
                    New: <span className="font-bold text-slate-900">{patientBarData.newPatients}</span>
                  </span>
                  <span className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-xs text-slate-700 font-medium">
                    <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm flex-shrink-0" style={{ background: chartColors.primary }} />
                    Returning: <span className="font-bold text-slate-900">{patientBarData.existingPatients}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Appointments Trends Chart */}
          <div className="min-h-[200px] lg:min-h-0 lg:flex-1 bg-white rounded-lg border border-slate-200 p-3 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 flex-shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wide">APPOINTMENTS TRENDS</h3>
                <CustomSelect
                  value={chartDoctorFilter || ''}
                  onChange={(v) => setChartDoctorFilter(v || null)}
                  options={[
                    { value: '', label: 'All Hospital' },
                    ...doctorList.map((d: any) => ({ value: d.doctorProfileId || d.userId, label: `Dr. ${d.name}` }))
                  ]}
                />
              </div>
              <FilterPills value={apptTrendFilter} onChange={setApptTrendFilter} />
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={apptTrendData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="newPatientFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="returningFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColors.accent} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={chartColors.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="Scheduled Appointments" stroke={chartColors.primary} strokeWidth={2} fill="url(#newPatientFill)" dot={false} />
                  <Area type="monotone" dataKey="Walk-ins" stroke={chartColors.accent} strokeWidth={2} fill="url(#returningFill)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-shrink-0">
              <span className="flex items-center gap-1.5 text-xs text-slate-700 font-medium"><span className="w-2.5 h-2.5 rounded-full" style={{ background: chartColors.primary }} />Scheduled Appointments</span>
              <span className="flex items-center gap-1.5 text-xs text-slate-700 font-medium"><span className="w-2.5 h-2.5 rounded-full" style={{ background: chartColors.accent }} />Walk-ins</span>
            </div>
          </div>

          {/* Patients Trends Chart */}
          <div className="min-h-[200px] lg:min-h-0 lg:flex-1 bg-white rounded-lg border border-slate-200 p-3 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 flex-shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wide">PATIENTS TRENDS</h3>
                <CustomSelect
                  value={chartDoctorFilter || ''}
                  onChange={(v) => setChartDoctorFilter(v || null)}
                  options={[
                    { value: '', label: 'All Hospital' },
                    ...doctorList.map((d: any) => ({ value: d.doctorProfileId || d.userId, label: `Dr. ${d.name}` }))
                  ]}
                />
              </div>
              <FilterPills value={patientTrendFilter} onChange={setPatientTrendFilter} />
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={patientNewVsReturningData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="New Patients" stroke={chartColors.accent} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Returning Patients" stroke={chartColors.primary} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-shrink-0">
              <span className="flex items-center gap-1.5 text-xs text-slate-700 font-medium"><span className="w-2.5 h-2.5 rounded-full" style={{ background: chartColors.accent }} />New Patients</span>
              <span className="flex items-center gap-1.5 text-xs text-slate-700 font-medium"><span className="w-2.5 h-2.5 rounded-full" style={{ background: chartColors.primary }} />Returning Patients</span>
            </div>
          </div>
        </div>

        {/* Right Column - Doctor Schedule */}
        <div className="w-full lg:w-1/2 bg-white rounded-lg border border-slate-200 flex flex-col lg:min-h-0 lg:overflow-hidden">
          {/* Header — Title + Dropdown + Status Badge */}
          <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap items-center gap-1.5 flex-shrink-0">
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wide">DOCTOR SCHEDULE</h3>
            <CustomSelect
              value={selectedDoctorId || ''}
              onChange={(v) => setSelectedDoctorId(v || null)}
              placeholder="Select Doctor..."
              options={doctorList.map((d: any) => ({ value: d.userId, label: `Dr. ${d.name}` }))}
            />
            {selectedDocProfile && (
              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                doctorCheckin.status === 'CHECKED_IN'
                  ? 'bg-lime-100 text-lime-700 border-lime-300'
                  : 'bg-amber-100 text-amber-700 border-amber-300'
              }`}>
                <span className={`w-2 h-2 rounded-full ${doctorCheckin.status === 'CHECKED_IN' ? 'bg-lime-500 animate-pulse' : 'bg-amber-500'}`} />
                {doctorCheckin.status === 'CHECKED_IN' ? 'ONLINE' : 'OFFLINE'}
              </span>
            )}
          </div>

          {!selectedDoctorId ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-slate-400">Select a doctor to view schedule</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col lg:overflow-hidden p-2 gap-2">
              {/* Weekly Shifts — full width top */}
              <div className="flex-shrink-0">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Weekly Shifts</p>
                <div className="space-y-1">
                  {DAY_NAMES_SHORT.map((day, idx) => {
                    const shifts = scheduleByDay[idx] || [];
                    const on = shifts.length > 0;
                    const isCurrentDay = idx === hospitalNow.getDay();
                    const formatTime = (t: string | null) => {
                      if (!t) return '--';
                      const [h, m] = t.split(':').map(Number);
                      const ampm = h >= 12 ? 'PM' : 'AM';
                      const h12 = h % 12 || 12;
                      return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
                    };
                    return (
                      <div key={day} className={`flex items-center gap-2 py-1 px-2 rounded-md transition-all ${
                        isCurrentDay ? 'bg-navy-50 border-2 border-navy-600 shadow-sm' : on ? 'bg-white border border-slate-300' : 'bg-slate-50 border border-slate-200'
                      }`}>
                        <span className="text-[10px] font-bold w-8 flex-shrink-0 text-navy-700">{day}</span>
                        {on ? (
                          <div className="flex items-center gap-3 flex-wrap flex-1">
                            {shifts.map((shift, i) => (
                              <div key={i} className="flex items-center gap-1">
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-white border border-navy-200">
                                  {shift.shiftType === 'AM' && (
                                    <svg className="w-3 h-3 text-navy-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                      <circle cx="12" cy="12" r="4" />
                                      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                                    </svg>
                                  )}
                                  {shift.shiftType === 'AFT' && (
                                    <svg className="w-3 h-3 text-navy-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                      <path d="M12 10a4 4 0 0 0-4 4h8a4 4 0 0 0-4-4z" />
                                      <path d="M12 2v4M4.93 4.93l2.83 2.83M2 14h4M17.24 7.76l2.83-2.83M18 14h4" />
                                      <line x1="2" y1="18" x2="22" y2="18" />
                                    </svg>
                                  )}
                                  {shift.shiftType === 'NT' && (
                                    <svg className="w-3 h-3 text-navy-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                                    </svg>
                                  )}
                                </span>
                                <span className="text-[9px] font-medium text-navy-600">
                                  {formatTime(shift.shiftStart)}-{formatTime(shift.shiftEnd)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[10px] italic text-slate-400">Off</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Time Off + Doctor Metrics — below, fills remaining height */}
              <div className="flex-1 flex min-h-0 border-t border-slate-100 pt-2 gap-2">
                {/* Left: Upcoming Time Off + Calendar Button */}
                <div className="w-1/2 flex flex-col min-h-0">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex-shrink-0">Upcoming Time Off</p>
                  {upcomingLeave.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-[11px] text-slate-400 italic">No upcoming leave</p>
                    </div>
                  ) : (
                    <div className="space-y-0.5 flex-shrink-0">
                      {upcomingLeave.map((t: any, i: number) => {
                        const sp = (t.start_date || '').split('-').map(Number);
                        const startDate = sp.length >= 3 ? new Date(sp[0], sp[1] - 1, sp[2]) : null;
                        const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        let relativeLabel = '';
                        let dayName = '';
                        let dateStr = '';
                        if (startDate) {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const diffDays = Math.round((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                          dayName = DAY_FULL[startDate.getDay()];
                          dateStr = `${MONTH_SHORT[startDate.getMonth()]} ${startDate.getDate()}`;
                          if (diffDays === 0) relativeLabel = 'Today';
                          else if (diffDays === 1) relativeLabel = 'Tomorrow';
                          else if (diffDays > 1 && diffDays <= 7) relativeLabel = 'This Week';
                          else if (diffDays > 7 && diffDays <= 14) relativeLabel = 'Next Week';
                          else if (startDate.getMonth() === today.getMonth() && startDate.getFullYear() === today.getFullYear()) relativeLabel = 'This Month';
                          else if ((startDate.getMonth() === today.getMonth() + 1 && startDate.getFullYear() === today.getFullYear()) || (today.getMonth() === 11 && startDate.getMonth() === 0 && startDate.getFullYear() === today.getFullYear() + 1)) relativeLabel = 'Next Month';
                          else relativeLabel = `${MONTH_SHORT[startDate.getMonth()]} ${startDate.getFullYear()}`;
                        }
                        return (
                          <div key={t.id || i} className="flex items-center gap-1.5 py-1 px-2 rounded-md bg-slate-50 border border-slate-200">
                            <svg className="w-3.5 h-3.5 text-navy-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                              <line x1="9" y1="14" x2="15" y2="18" />
                              <line x1="15" y1="14" x2="9" y2="18" />
                            </svg>
                            <span className="text-[10px] font-bold text-slate-900">{relativeLabel}</span>
                            <span className="text-[10px] font-bold text-slate-900">{dayName},</span>
                            <span className="text-[9px] font-medium text-slate-600">{dateStr}</span>
                            {t.start_date !== t.end_date && (
                              <span className="text-[8px] text-slate-400 ml-auto">— {(() => { const ep = (t.end_date || '').split('-').map(Number); return ep.length >= 3 ? `${MONTH_SHORT[ep[1]-1]} ${ep[2]}` : t.end_date; })()}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Calendar Button below leaves */}
                  <div className="mt-2 flex-shrink-0 relative group/cal">
                    <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-navy-200 bg-navy-50 text-navy-700 text-[11px] font-semibold hover:bg-navy-100 transition-colors cursor-pointer w-full justify-center">
                      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      View Dr. {selectedDocProfile?.name?.split(' ')[0] || ''} Time Off Calendar
                    </button>

                    {/* Calendar Hover Popover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[280px] bg-white rounded-xl shadow-2xl border border-slate-200 p-3 opacity-0 invisible group-hover/cal:opacity-100 group-hover/cal:visible transition-all duration-200 z-50">
                      {/* Month Nav */}
                      <div className="flex items-center justify-between mb-2">
                        <button onClick={prevMonth} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <span className="text-xs font-bold text-slate-900">{MONTH_SHORT[calendarMonth.month]} {calendarMonth.year}</span>
                        <button onClick={nextMonth} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </div>
                      {/* Day Headers */}
                      <div className="grid grid-cols-7 gap-px mb-1">
                        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                          <span key={d} className="text-center text-[8px] font-bold text-slate-400 uppercase">{d}</span>
                        ))}
                      </div>
                      {/* Calendar Grid */}
                      <div className="grid grid-cols-7 gap-px">
                        {calendarMonth.cells.map((day, idx) => {
                          if (day === null) return <span key={idx} className="w-full aspect-square" />;
                          const isWork = calendarMonth.workDates.has(day);
                          const isOff = calendarMonth.offDates.has(day);
                          const isToday = day === hospitalNow.getDate() && calendarMonth.month === hospitalNow.getMonth() && calendarMonth.year === hospitalNow.getFullYear();
                          return (
                            <span key={idx} className={`w-full aspect-square flex items-center justify-center text-[9px] font-medium rounded ${
                              isOff ? 'bg-[#0a1a2e] text-white font-bold' :
                              isWork ? 'bg-navy-50 text-navy-700' :
                              'text-slate-400'
                            } ${isToday ? 'ring-1 ring-navy-600' : ''}`}>
                              {day}
                            </span>
                          );
                        })}
                      </div>
                      {/* Legend */}
                      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100">
                        <span className="flex items-center gap-1 text-[8px] text-slate-500 font-medium">
                          <span className="w-2.5 h-2.5 rounded-sm bg-navy-50 border border-navy-200" />Work
                        </span>
                        <span className="flex items-center gap-1 text-[8px] text-slate-500 font-medium">
                          <span className="w-2.5 h-2.5 rounded-sm bg-[#0a1a2e]" />Leave
                        </span>
                        <span className="flex items-center gap-1 text-[8px] text-slate-500 font-medium">
                          <span className="w-2.5 h-2.5 rounded-sm border border-navy-600" />Today
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Doctor Metrics Cards */}
                <div className="w-1/2 flex flex-col min-h-0 border-l border-slate-100 pl-2">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex-shrink-0">Doctor Metrics</p>
                  <div className="grid grid-cols-2 gap-1.5 flex-shrink-0">
                    {/* Work Days */}
                    <div className="bg-white rounded-lg border border-slate-200 p-1.5 sm:p-2.5">
                      <p className="text-[8px] sm:text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-0.5 sm:mb-1">Work Days</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm sm:text-xl font-bold text-slate-900">{workingDaysPerWeek}</span>
                        <span className="text-[7px] sm:text-[9px] text-navy-600 bg-navy-50 px-1 sm:px-1.5 py-px sm:py-0.5 rounded font-medium">per week</span>
                      </div>
                    </div>
                    {/* Upcoming Leaves */}
                    <div className="bg-white rounded-lg border border-slate-200 p-1.5 sm:p-2.5">
                      <p className="text-[8px] sm:text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-0.5 sm:mb-1">Upcoming Leaves</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm sm:text-xl font-bold text-slate-900">{totalUpcomingLeaves}</span>
                        <span className="text-[7px] sm:text-[9px] text-navy-600 bg-navy-50 px-1 sm:px-1.5 py-px sm:py-0.5 rounded font-medium">scheduled</span>
                      </div>
                    </div>
                    {/* Licenses Assigned */}
                    <div className="bg-white rounded-lg border border-slate-200 p-1.5 sm:p-2.5">
                      <p className="text-[8px] sm:text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-0.5 sm:mb-1">Licenses</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm sm:text-xl font-bold text-slate-900">{stats.licensesUsed}/{stats.licensesTotal}</span>
                        <span className="text-[7px] sm:text-[9px] text-navy-600 bg-navy-50 px-1 sm:px-1.5 py-px sm:py-0.5 rounded font-medium">assigned</span>
                      </div>
                    </div>
                    {/* Patients Seen This Week */}
                    <div className="bg-white rounded-lg border border-slate-200 p-1.5 sm:p-2.5">
                      <p className="text-[8px] sm:text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-0.5 sm:mb-1">Patients Seen</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm sm:text-xl font-bold text-slate-900">{doctorPatientsThisWeek}</span>
                        <span className="text-[7px] sm:text-[9px] text-navy-600 bg-navy-50 px-1 sm:px-1.5 py-px sm:py-0.5 rounded font-medium">this week</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
