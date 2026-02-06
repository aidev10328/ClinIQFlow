'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch, invalidateApiCache } from '../../../lib/api';
import PhoneInput from '../../../components/PhoneInput';
import { useHospitalTimezone } from '../../../hooks/useHospitalTimezone';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Doctor {
  id: string;
  userId: string;
  email: string;
  fullName?: string;
  phone?: string;
  specialty?: string;
  licenseNumber?: string;
  complianceStatus?: 'compliant' | 'pending_signatures' | 'not_logged_in';
  createdAt: string;
}

interface DoctorScheduleDay {
  dayOfWeek: number;
  isWorking: boolean;
  morningShift: boolean;
  eveningShift: boolean;
  nightShift: boolean;
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

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDateStr(dateStr: string | null | undefined, opts?: { weekday?: boolean }): string {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('-')) return dateStr as string || '';
  const [y, m, d] = dateStr.split('-').map(Number);
  let result = `${MONTHS_SHORT[m - 1]} ${d}`;
  if (opts?.weekday) {
    const dow = new Date(y, m - 1, d).getDay();
    result = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow] + ', ' + result;
  }
  return result;
}

function formatTime12(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TIME_OPTIONS = (() => {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 30) opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  return opts;
})();

function shortTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const h12 = h % 12 || 12;
  const p = h >= 12 ? 'PM' : 'AM';
  return m === 0 ? `${h12}${p}` : `${h12}:${String(m).padStart(2, '0')}${p}`;
}

const APPT_DURATIONS = [10, 15, 20, 30, 45, 60];

function ScheduleSelect({ value, onChange, options }: { value: string; onChange: (val: string) => void; options: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedLabel = options.find(o => o.value === value)?.label || '';

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className={`w-full flex items-center justify-between px-2 py-1.5 text-[11px] bg-white border rounded-md font-medium cursor-pointer transition-all ${open ? 'border-[#2b5a8a] ring-1 ring-[#a3cbef]' : 'border-slate-200 hover:border-[#2b5a8a]'} text-[#1e3a5f]`}>
        <span>{selectedLabel}</span>
        <svg className={`w-3 h-3 text-[#1e3a5f]/40 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-auto">
          {options.map(opt => (
            <button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${opt.value === value ? 'bg-[#1e3a5f] text-white font-medium' : 'text-slate-700 hover:bg-[#e8f4fc] hover:text-[#1e3a5f]'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const DEPARTMENTS = [
  'Emergency Medicine', 'Internal Medicine', 'Surgery', 'Pediatrics',
  'Obstetrics & Gynecology', 'Cardiology', 'Neurology', 'Orthopedics',
  'Radiology', 'Pathology', 'Anesthesiology', 'Dermatology',
  'Ophthalmology', 'ENT', 'Urology', 'Psychiatry', 'Oncology',
  'Pulmonology', 'Gastroenterology', 'Nephrology', 'Endocrinology',
  'Rheumatology', 'ICU', 'General Practice', 'Rehabilitation',
];

interface DoctorTimeOffRaw {
  id: string;
  start_date: string;
  end_date: string;
  reason?: string;
}

interface DoctorTimeOff {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

interface Invite {
  id: string;
  invitedEmail: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface Subscription {
  id: string;
  status: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
  items: { productCode: string; productName: string; doctorLimit: number; pricePerDoctor: number; currency: string; monthlyTotal: number }[];
  totalMonthly: number;
}

interface License {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorEmail: string;
  productCode: string;
  productName: string;
  status: string;
  assignedAt: string;
}

const ROWS_PER_PAGE = 10;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function DoctorsContent() {
  const { currentHospital, currentHospitalId, profile } = useAuth();
  const { getCurrentTime, formatShortDate } = useHospitalTimezone();
  const isManager = profile?.isSuperAdmin || currentHospital?.role === 'HOSPITAL_MANAGER';

  // ─── STATE ───────────────────────────────────────────────────────────────────
  const [dataLoaded, setDataLoaded] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void; destructive?: boolean } | null>(null);

  // Doctors
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviting, setInviting] = useState(false);

  // Doctor Edit Modal
  const [showDoctorEditModal, setShowDoctorEditModal] = useState(false);
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [doctorFormData, setDoctorFormData] = useState<Record<string, any>>({});
  const [doctorEditSaving, setDoctorEditSaving] = useState(false);
  const [doctorEditLoading, setDoctorEditLoading] = useState(false);
  const [doctorAvatarPreview, setDoctorAvatarPreview] = useState<string | null>(null);
  const [uploadingDoctorAvatar, setUploadingDoctorAvatar] = useState(false);
  const doctorAvatarInputRef = useRef<HTMLInputElement>(null);

  // Doctor Schedule Modal
  const [showDoctorScheduleModal, setShowDoctorScheduleModal] = useState(false);
  const [scheduleDoctorId, setScheduleDoctorId] = useState<string | null>(null);
  const [scheduleDoctorProfileId, setScheduleDoctorProfileId] = useState<string | null>(null);
  const [scheduleDoctorName, setScheduleDoctorName] = useState('');
  const [scheduleOrigDuration, setScheduleOrigDuration] = useState(30);
  const [doctorSchedule, setDoctorSchedule] = useState<DoctorScheduleDay[]>([]);
  const [doctorScheduleSaving, setDoctorScheduleSaving] = useState(false);
  const [doctorScheduleLoading, setDoctorScheduleLoading] = useState(false);
  const [scheduleShiftTimings, setScheduleShiftTimings] = useState<ShiftTimingConfig>({ ...DEFAULT_SHIFT_TIMINGS });
  const [scheduleApptDuration, setScheduleApptDuration] = useState(30);
  const [doctorCheckins, setDoctorCheckins] = useState<Record<string, string>>({});

  // Conflict Detection
  const [conflictData, setConflictData] = useState<{
    conflicts: { appointmentId: string; patientName: string; appointmentDate: string; startTime: string; endTime: string; status: string; hasQueueEntry: boolean; queueEntryId?: string }[];
    summary: { totalAppointments: number; totalQueueEntries: number; dateRange: { from: string; to: string }; slotsToDelete: number };
  } | null>(null);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [pendingSaveAction, setPendingSaveAction] = useState<(() => Promise<void>) | null>(null);
  const [conflictResolving, setConflictResolving] = useState(false);

  // Time Off Modal
  const [showTimeOffModal, setShowTimeOffModal] = useState(false);
  const [timeOffDoctorId, setTimeOffDoctorId] = useState<string | null>(null);
  const [timeOffDoctorProfileId, setTimeOffDoctorProfileId] = useState<string | null>(null);
  const [timeOffDoctorName, setTimeOffDoctorName] = useState('');
  const [doctorTimeOffs, setDoctorTimeOffs] = useState<DoctorTimeOff[]>([]);
  const [timeOffForm, setTimeOffForm] = useState({ startDate: '', endDate: '', reason: '' });
  const [addingTimeOff, setAddingTimeOff] = useState(false);
  const [timeOffLoading, setTimeOffLoading] = useState(false);
  const [timeOffCalMonth, setTimeOffCalMonth] = useState<Date>(() => {
    const t = getCurrentTime();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [timeOffSelClickCount, setTimeOffSelClickCount] = useState(0);

  // Revoke License Modal
  const [showRevokeLicenseModal, setShowRevokeLicenseModal] = useState(false);
  const [revokeDoctorName, setRevokeDoctorName] = useState('');
  const [revokeDoctorLicenses, setRevokeDoctorLicenses] = useState<License[]>([]);
  const [revokingLicenseId, setRevokingLicenseId] = useState<string | null>(null);

  // Licenses & Subscription
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ doctorId: '', productCode: 'APPOINTMENTS' });
  const [assigning, setAssigning] = useState(false);
  const [assignProductOpen, setAssignProductOpen] = useState(false);
  const [assignDoctorOpen, setAssignDoctorOpen] = useState(false);
  const [assignDoctorSearch, setAssignDoctorSearch] = useState('');
  const assignProductRef = useRef<HTMLDivElement>(null);
  const assignDoctorRef = useRef<HTMLDivElement>(null);

  // Search & Pagination
  const [doctorSearch, setDoctorSearch] = useState('');
  const [doctorPage, setDoctorPage] = useState(1);

  // Specializations
  const [specializations, setSpecializations] = useState<{ id: string; name: string }[]>([]);

  // ─── AUTO-DISMISS BANNERS ──────────────────────────────────────────────────
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 10000);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (assignProductRef.current && !assignProductRef.current.contains(e.target as Node)) setAssignProductOpen(false);
      if (assignDoctorRef.current && !assignDoctorRef.current.contains(e.target as Node)) setAssignDoctorOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── ACCESS CHECK ────────────────────────────────────────────────────────────
  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-600">Access Restricted</p>
        <p className="text-xs text-slate-400">Only hospital managers can access this page.</p>
      </div>
    );
  }

  // ─── DATA FETCHING ───────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchAll() {
      if (!currentHospitalId) return;
      try {
        const [membersRes, invitesRes, subRes, licRes, specRes] = await Promise.all([
          apiFetch('/v1/hospitals/members/compliance'),
          apiFetch('/v1/invites/pending'),
          apiFetch('/v1/products/subscription'),
          apiFetch('/v1/products/licenses'),
          apiFetch('/v1/specializations'),
        ]);
        if (membersRes.ok) {
          const m = await membersRes.json();
          setDoctors(m.filter((x: any) => x.role === 'DOCTOR'));
        }
        if (invitesRes.ok) {
          const inv = await invitesRes.json();
          setPendingInvites(inv.filter((i: Invite) => i.status === 'PENDING' && i.role === 'DOCTOR'));
        }
        if (subRes.ok) setSubscription(await subRes.json());
        if (licRes.ok) setLicenses(await licRes.json());
        if (specRes.ok) setSpecializations(await specRes.json());
      } catch (e) {
        console.error('Fetch error:', e);
      } finally {
        setDataLoaded(true);
      }
    }
    fetchAll();
  }, [currentHospitalId]);

  // Fetch doctor checkin statuses
  useEffect(() => {
    if (doctors.length === 0) return;
    const now = getCurrentTime();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    Promise.all(
      doctors.map(d => apiFetch(`/v1/queue/daily?doctorProfileId=${d.id}&date=${today}`).then(r => r.ok ? r.json() : null).catch(() => null))
    ).then(results => {
      const statuses: Record<string, string> = {};
      results.forEach((r, i) => {
        if (r?.doctorCheckin?.status) statuses[doctors[i].id] = r.doctorCheckin.status;
      });
      setDoctorCheckins(statuses);
    });
  }, [doctors]);

  // ─── HANDLERS ──────────────────────────────────────────────────────────────────

  async function inviteDoctor(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await apiFetch('/v1/invites/create-doctor', { method: 'POST', body: JSON.stringify({ email: inviteEmail, firstName: inviteFirstName, lastName: inviteLastName }) });
      if (res.ok) {
        setShowInviteModal(false);
        setInviteEmail(''); setInviteFirstName(''); setInviteLastName('');
        const inv = await apiFetch('/v1/invites/pending');
        if (inv.ok) {
          const data = await inv.json();
          setPendingInvites(data.filter((i: Invite) => i.status === 'PENDING' && i.role === 'DOCTOR'));
        }
        setMessage({ type: 'success', text: 'Invite sent' });
      } else {
        const err = await res.json();
        alert(err.message || 'Failed');
      }
    } catch { alert('Failed'); }
    finally { setInviting(false); }
  }

  async function openDoctorEditModal(d: Doctor) {
    setEditingDoctorId(d.userId);
    setDoctorEditLoading(true);
    try {
      const res = await apiFetch(`/v1/doctors/${d.userId}/profile`);
      if (res.ok) {
        const p = await res.json();
        // Parse fullName from API response, falling back to doctor list data
        const rawFullName = p.fullName || d.fullName || '';
        // Strip "Dr" or "Dr." prefix and split into parts
        const nameWithoutPrefix = rawFullName.replace(/^Dr\.?\s+/i, '').trim();
        const nameParts = nameWithoutPrefix.split(' ').filter(Boolean);
        const parsedFirstName = nameParts[0] || '';
        const parsedLastName = nameParts.slice(1).join(' ') || '';
        setDoctorFormData({
          firstName: parsedFirstName, lastName: parsedLastName,
          phone: p.phone || d.phone || '', dateOfBirth: p.dateOfBirth || '', gender: p.gender || '',
          nationalId: p.nationalId || '', specialization: p.specialization || d.specialty || '',
          licenseNumber: p.licenseNumber || d.licenseNumber || '', department: p.department || '',
          qualification: p.qualification || '', yearsOfExperience: p.yearsOfExperience || '',
          consultationFee: p.consultationFee || '', employmentType: p.employmentType || '',
          education: p.education || '', bio: p.bio || '',
          addressLine1: p.addressLine1 || '', addressLine2: p.addressLine2 || '',
          city: p.city || '', state: p.state || '', postalCode: p.postalCode || '', country: p.country || '',
          emergencyContact: p.emergencyContact || '', emergencyPhone: p.emergencyPhone || '', emergencyRelation: p.emergencyRelation || '',
        });
        setDoctorAvatarPreview(p.avatarUrl || null);
      } else {
        // Strip "Dr" or "Dr." prefix and split into parts
        const nameWithoutPrefix = (d.fullName || '').replace(/^Dr\.?\s+/i, '').trim();
        const nameParts = nameWithoutPrefix.split(' ').filter(Boolean);
        setDoctorFormData({ firstName: nameParts[0] || '', lastName: nameParts.slice(1).join(' ') || '', phone: d.phone || '', specialization: d.specialty || '', licenseNumber: d.licenseNumber || '' });
        setDoctorAvatarPreview(null);
      }
    } catch { setDoctorFormData({}); setDoctorAvatarPreview(null); }
    finally { setDoctorEditLoading(false); setShowDoctorEditModal(true); }
  }

  async function saveDoctorEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDoctorId) return;
    setDoctorEditSaving(true);
    try {
      // Strip any existing "Dr" prefix from firstName to avoid "Dr Dr" duplication
      const cleanFirstName = (doctorFormData.firstName?.trim() || '').replace(/^Dr\.?\s*/i, '').trim();
      const cleanLastName = doctorFormData.lastName?.trim() || '';
      const fullName = `Dr ${cleanFirstName} ${cleanLastName}`.replace(/\s+/g, ' ').trim();
      const res = await apiFetch(`/v1/doctors/${editingDoctorId}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName, phone: doctorFormData.phone || null, dateOfBirth: doctorFormData.dateOfBirth || null,
          gender: doctorFormData.gender || null, nationalId: doctorFormData.nationalId || null,
          specialization: doctorFormData.specialization || null, licenseNumber: doctorFormData.licenseNumber || null,
          department: doctorFormData.department || null, qualification: doctorFormData.qualification || null,
          yearsOfExperience: doctorFormData.yearsOfExperience ? Number(doctorFormData.yearsOfExperience) : null,
          consultationFee: doctorFormData.consultationFee ? Number(doctorFormData.consultationFee) : null,
          employmentType: doctorFormData.employmentType || null, education: doctorFormData.education || null,
          bio: doctorFormData.bio || null, addressLine1: doctorFormData.addressLine1 || null,
          addressLine2: doctorFormData.addressLine2 || null, city: doctorFormData.city || null,
          state: doctorFormData.state || null, postalCode: doctorFormData.postalCode || null,
          country: doctorFormData.country || null, emergencyContact: doctorFormData.emergencyContact || null,
          emergencyPhone: doctorFormData.emergencyPhone || null, emergencyRelation: doctorFormData.emergencyRelation || null,
        }),
      });
      if (res.ok) {
        setShowDoctorEditModal(false); setEditingDoctorId(null);
        const membersRes = await apiFetch('/v1/hospitals/members/compliance');
        if (membersRes.ok) {
          const m = await membersRes.json();
          setDoctors(m.filter((x: any) => x.role === 'DOCTOR'));
        }
        setMessage({ type: 'success', text: 'Doctor profile updated' });
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Failed to save');
      }
    } catch { alert('Failed to save'); }
    finally { setDoctorEditSaving(false); }
  }

  async function handleDoctorAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editingDoctorId) return;

    // Preview immediately
    const reader = new FileReader();
    reader.onloadend = () => setDoctorAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);

    // Upload
    setUploadingDoctorAvatar(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('avatar', file);
      const res = await apiFetch(`/v1/doctors/${editingDoctorId}/avatar`, {
        method: 'POST',
        body: formDataUpload,
        headers: {},
      });
      if (res.ok) {
        // Invalidate /v1/me cache so the doctor sees their new avatar on next login
        invalidateApiCache('/v1/me');
        setMessage({ type: 'success', text: 'Avatar uploaded successfully' });
      } else {
        alert('Failed to upload avatar');
        setDoctorAvatarPreview(null);
      }
    } catch {
      alert('Failed to upload avatar');
      setDoctorAvatarPreview(null);
    } finally {
      setUploadingDoctorAvatar(false);
    }
  }

  async function openDoctorScheduleModal(d: Doctor) {
    setScheduleDoctorId(d.userId);
    setScheduleDoctorProfileId(null); // will be set after profile fetch
    setScheduleDoctorName(d.fullName || d.email);
    setDoctorScheduleLoading(true);
    try {
      const [res, durRes, profileRes] = await Promise.all([
        apiFetch(`/v1/doctors/${d.userId}/schedules`),
        apiFetch(`/v1/doctors/${d.userId}/appointment-duration`),
        apiFetch(`/v1/doctors/${d.userId}/profile`),
      ]);
      // Get the real doctor_profiles.id
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setScheduleDoctorProfileId(profileData.id);
      }
      if (res.ok) {
        const rawData = await res.json();
        const data = Array.isArray(rawData) ? rawData : (rawData.schedules || []);
        const savedTimingConfig = Array.isArray(rawData) ? null : rawData.shiftTimingConfig;
        // Use saved shift timing config if available, otherwise extract from first working day
        const timings: ShiftTimingConfig = savedTimingConfig ? { ...savedTimingConfig } : { ...DEFAULT_SHIFT_TIMINGS };
        if (!savedTimingConfig) for (const dbSched of data) {
          if (dbSched.is_working && dbSched.shift_start && dbSched.shift_end) {
            const start = dbSched.shift_start.slice(0, 5); // "HH:MM:SS" → "HH:MM"
            const end = dbSched.shift_end.slice(0, 5);
            const startHour = parseInt(start.split(':')[0]);
            const endHour = parseInt(end.split(':')[0]);
            // Determine which shift period this covers and populate timings
            if (startHour < 14) timings.morning = { start, end: endHour <= 14 ? end : timings.morning.end };
            if (endHour > 14 || (startHour >= 14 && startHour < 22)) timings.evening = { start: startHour >= 14 ? start : timings.evening.start, end: endHour <= 22 ? end : timings.evening.end };
            if (endHour <= 6 || startHour >= 22) timings.night = { start: startHour >= 22 ? start : timings.night.start, end: endHour <= 6 ? end : timings.night.end };
            break; // Use first working day's timings as representative
          }
        }
        setScheduleShiftTimings(timings);

        const sched = DAYS_OF_WEEK.map((_, idx) => {
          const dbSched = data.find((s: any) => s.day_of_week === idx);
          if (dbSched && dbSched.is_working) {
            const startHour = parseInt(dbSched.shift_start?.split(':')[0] || '0');
            const endHour = parseInt(dbSched.shift_end?.split(':')[0] || '0');
            return { dayOfWeek: idx, isWorking: true, morningShift: startHour < 14 && endHour > 6, eveningShift: startHour < 22 && endHour > 14, nightShift: endHour <= 6 || startHour >= 22 };
          }
          return { dayOfWeek: idx, isWorking: false, morningShift: false, eveningShift: false, nightShift: false };
        });
        setDoctorSchedule(sched);
      } else {
        setDoctorSchedule(DAYS_OF_WEEK.map((_, idx) => ({ dayOfWeek: idx, isWorking: idx >= 1 && idx <= 5, morningShift: idx >= 1 && idx <= 5, eveningShift: false, nightShift: false })));
      }
      if (durRes.ok) {
        const durData = await durRes.json();
        const dur = durData.appointmentDurationMinutes || 30;
        setScheduleApptDuration(dur);
        setScheduleOrigDuration(dur);
      } else {
        setScheduleApptDuration(30);
        setScheduleOrigDuration(30);
      }
    } catch {
      setDoctorSchedule(DAYS_OF_WEEK.map((_, idx) => ({ dayOfWeek: idx, isWorking: idx >= 1 && idx <= 5, morningShift: idx >= 1 && idx <= 5, eveningShift: false, nightShift: false })));
      setScheduleApptDuration(30);
      setScheduleOrigDuration(30);
    } finally { setDoctorScheduleLoading(false); setShowDoctorScheduleModal(true); }
  }

  function handleDoctorScheduleChange(dayIndex: number, field: string, value: boolean) {
    setDoctorSchedule(prev => prev.map((day, idx) => {
      if (idx !== dayIndex) return day;
      if (field === 'isWorking') {
        if (!value) return { ...day, isWorking: false, morningShift: false, eveningShift: false, nightShift: false };
        return { ...day, isWorking: value };
      }
      const updated = { ...day, [field]: value };
      if (value) updated.isWorking = true;
      if (!updated.morningShift && !updated.eveningShift && !updated.nightShift) updated.isWorking = false;
      return updated;
    }));
  }

  function buildSchedulesToSave() {
    return doctorSchedule.map(day => {
      if (!day.isWorking || (!day.morningShift && !day.eveningShift && !day.nightShift)) {
        return { dayOfWeek: day.dayOfWeek, isWorking: false, shiftStart: null, shiftEnd: null };
      }
      let shiftStart: string | null = null;
      let shiftEnd: string | null = null;
      if (day.morningShift) { shiftStart = scheduleShiftTimings.morning.start + ':00'; shiftEnd = scheduleShiftTimings.morning.end + ':00'; }
      if (day.eveningShift) { if (!shiftStart) shiftStart = scheduleShiftTimings.evening.start + ':00'; shiftEnd = scheduleShiftTimings.evening.end + ':00'; }
      if (day.nightShift) { if (!shiftStart) shiftStart = scheduleShiftTimings.night.start + ':00'; shiftEnd = scheduleShiftTimings.night.end + ':00'; }
      return { dayOfWeek: day.dayOfWeek, isWorking: true, shiftStart, shiftEnd };
    });
  }

  async function executeSaveSchedule(cancelAppointmentIds: string[]) {
    if (!scheduleDoctorId || !scheduleDoctorProfileId) return;
    const schedulesToSave = buildSchedulesToSave();
    console.log('[executeSaveSchedule] Saving schedules:', JSON.stringify(schedulesToSave.filter((s: any) => s.isWorking).map((s: any) => ({ day: s.dayOfWeek, start: s.shiftStart, end: s.shiftEnd }))));
    console.log('[executeSaveSchedule] doctorProfileId:', scheduleDoctorProfileId);
    const [res] = await Promise.all([
      apiFetch(`/v1/doctors/${scheduleDoctorId}/schedules`, { method: 'PATCH', body: JSON.stringify({ schedules: schedulesToSave, shiftTimingConfig: scheduleShiftTimings }) }),
      apiFetch(`/v1/doctors/${scheduleDoctorId}/appointment-duration`, { method: 'PATCH', body: JSON.stringify({ appointmentDurationMinutes: scheduleApptDuration }) }),
    ]);
    if (res.ok) {
      // Regenerate slots (handles cancellations + deletion + regeneration)
      let regenOk = false;
      let regenMsg = '';
      try {
        const regenRes = await apiFetch('/v1/appointments/slots/regenerate', {
          method: 'POST',
          body: JSON.stringify({ doctorProfileId: scheduleDoctorProfileId, cancelAppointmentIds }),
        });
        regenOk = regenRes.ok;
        if (regenOk) {
          const regenData = await regenRes.json();
          regenMsg = `Deleted ${regenData.slotsDeleted} old, generated ${regenData.slotsGenerated} new slots`;
          console.log('[executeSaveSchedule] Regeneration result:', regenData);
        } else {
          const errText = await regenRes.text();
          regenMsg = 'Slot regeneration failed';
          console.error('[executeSaveSchedule] Regeneration error:', errText);
        }
      } catch (e) {
        regenMsg = 'Slot regeneration timed out or failed';
        console.error('[executeSaveSchedule] Regeneration exception:', e);
      }
      setShowDoctorScheduleModal(false); setScheduleDoctorId(null); setScheduleDoctorProfileId(null);
      setMessage({ type: 'success', text: regenOk ? `Schedule updated. ${regenMsg}` : `Schedule saved — ${regenMsg}` });
    } else { alert('Failed to save schedule'); }
  }

  async function saveDoctorSchedule() {
    if (!scheduleDoctorId || !scheduleDoctorProfileId) return;
    setDoctorScheduleSaving(true);
    try {
      const schedulesToSave = buildSchedulesToSave();
      const durationChanged = scheduleApptDuration !== scheduleOrigDuration;

      // Check for conflicts before saving
      const conflictRes = await apiFetch('/v1/appointments/slots/check-conflicts', {
        method: 'POST',
        body: JSON.stringify({
          doctorProfileId: scheduleDoctorProfileId,
          changeType: durationChanged ? 'duration' : 'schedule',
          payload: durationChanged
            ? { durationMinutes: scheduleApptDuration }
            : { schedules: schedulesToSave },
        }),
      });

      if (conflictRes.ok) {
        const data = await conflictRes.json();
        if (data.conflicts && data.conflicts.length > 0) {
          // Show conflict modal — defer save
          setConflictData(data);
          const appointmentIds = data.conflicts.map((c: any) => c.appointmentId);
          setPendingSaveAction(() => async () => { await executeSaveSchedule(appointmentIds); });
          setShowConflictModal(true);
          return; // Don't clear saving state — modal controls this
        }
      }

      // No conflicts — save directly
      await executeSaveSchedule([]);
    } catch (error: any) {
      alert(error.message || 'Failed to save schedule');
    } finally {
      setDoctorScheduleSaving(false);
    }
  }

  function revokeInvite(id: string) {
    setConfirmDialog({
      title: 'Revoke Invite', message: 'Are you sure you want to revoke this invitation?', destructive: true,
      onConfirm: async () => {
        await apiFetch(`/v1/invites/${id}`, { method: 'DELETE' });
        const inv = await apiFetch('/v1/invites/pending');
        if (inv.ok) {
          const data = await inv.json();
          setPendingInvites(data.filter((i: Invite) => i.status === 'PENDING' && i.role === 'DOCTOR'));
        }
      },
    });
  }

  async function openTimeOffModal(d: Doctor) {
    setTimeOffDoctorId(d.userId);
    setTimeOffDoctorProfileId(null); // will be set after profile fetch
    setTimeOffDoctorName(d.fullName || d.email);
    setTimeOffLoading(true);
    setTimeOffForm({ startDate: '', endDate: '', reason: '' });
    setTimeOffSelClickCount(0);
    const t = getCurrentTime();
    setTimeOffCalMonth(new Date(t.getFullYear(), t.getMonth(), 1));
    try {
      const [res, profileRes] = await Promise.all([
        apiFetch(`/v1/doctors/${d.userId}/time-off`),
        apiFetch(`/v1/doctors/${d.userId}/profile`),
      ]);
      // Get the real doctor_profiles.id
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setTimeOffDoctorProfileId(profileData.id);
      }
      if (res.ok) {
        const raw: DoctorTimeOffRaw[] = await res.json();
        setDoctorTimeOffs(raw.map(t => ({ id: t.id, startDate: t.start_date, endDate: t.end_date, reason: t.reason })));
      } else {
        setDoctorTimeOffs([]);
      }
    } catch {
      setDoctorTimeOffs([]);
    } finally {
      setTimeOffLoading(false);
      setShowTimeOffModal(true);
    }
  }

  async function executeAddTimeOff(cancelAppointmentIds: string[]) {
    if (!timeOffDoctorId || !timeOffDoctorProfileId) return;
    const res = await apiFetch(`/v1/doctors/${timeOffDoctorId}/time-off`, {
      method: 'POST',
      body: JSON.stringify(timeOffForm),
    });
    if (res.ok) {
      setTimeOffForm({ startDate: '', endDate: '', reason: '' });
      setTimeOffSelClickCount(0);
      // Regenerate slots to remove those on time-off dates
      try {
        await apiFetch('/v1/appointments/slots/regenerate', {
          method: 'POST',
          body: JSON.stringify({ doctorProfileId: timeOffDoctorProfileId, cancelAppointmentIds }),
        });
      } catch (e) {
        console.error('Slot regeneration after time-off failed:', e);
      }
      // Refresh time-offs
      const toRes = await apiFetch(`/v1/doctors/${timeOffDoctorId}/time-off`);
      if (toRes.ok) {
        const raw: DoctorTimeOffRaw[] = await toRes.json();
        setDoctorTimeOffs(raw.map(t => ({ id: t.id, startDate: t.start_date, endDate: t.end_date, reason: t.reason })));
      }
      setMessage({ type: 'success', text: 'Time off added & slots updated' });
    } else {
      const err = await res.json();
      alert(err.message || 'Failed to add time off');
    }
  }

  async function handleAddTimeOff() {
    if (!timeOffDoctorId || !timeOffDoctorProfileId || !timeOffForm.startDate || !timeOffForm.endDate) return;
    setAddingTimeOff(true);
    try {
      // Check for conflicts on the time-off dates
      const conflictRes = await apiFetch('/v1/appointments/slots/check-conflicts', {
        method: 'POST',
        body: JSON.stringify({
          doctorProfileId: timeOffDoctorProfileId,
          changeType: 'timeoff',
          payload: { startDate: timeOffForm.startDate, endDate: timeOffForm.endDate },
        }),
      });

      if (conflictRes.ok) {
        const data = await conflictRes.json();
        if (data.conflicts && data.conflicts.length > 0) {
          // Show conflict modal — defer save
          setConflictData(data);
          const appointmentIds = data.conflicts.map((c: any) => c.appointmentId);
          setPendingSaveAction(() => async () => { await executeAddTimeOff(appointmentIds); });
          setShowConflictModal(true);
          return; // Don't clear adding state — modal controls this
        }
      }

      // No conflicts — save directly
      await executeAddTimeOff([]);
    } catch (error: any) {
      alert(error.message || 'Failed to add time off');
    } finally {
      setAddingTimeOff(false);
    }
  }

  async function handleDeleteTimeOff(timeOffId: string) {
    if (!timeOffDoctorId || !timeOffDoctorProfileId || !confirm('Remove this time off?')) return;
    try {
      const res = await apiFetch(`/v1/doctors/${timeOffDoctorId}/time-off/${timeOffId}`, { method: 'DELETE' });
      if (res.ok) {
        setDoctorTimeOffs(prev => prev.filter(t => t.id !== timeOffId));
        // Auto-regenerate slots to fill the reopened dates
        try {
          await apiFetch('/v1/appointments/slots/regenerate', {
            method: 'POST',
            body: JSON.stringify({ doctorProfileId: timeOffDoctorProfileId, cancelAppointmentIds: [] }),
          });
        } catch (e) {
          console.error('Slot regeneration after time-off delete failed:', e);
        }
        setMessage({ type: 'success', text: 'Time off removed & slots regenerated' });
      }
    } catch {
      alert('Failed to delete time off');
    }
  }

  async function handleRevokeLicense(licenseId: string) {
    setRevokingLicenseId(licenseId);
    try {
      const res = await apiFetch(`/v1/products/licenses/${licenseId}`, { method: 'DELETE' });
      if (res.ok) {
        setRevokeDoctorLicenses(prev => prev.filter(l => l.id !== licenseId));
        const [licRes] = await Promise.all([apiFetch('/v1/products/licenses')]);
        if (licRes.ok) setLicenses(await licRes.json());
        setMessage({ type: 'success', text: 'License revoked' });
        if (revokeDoctorLicenses.length <= 1) setShowRevokeLicenseModal(false);
      } else { alert('Failed to revoke license'); }
    } catch { alert('Failed to revoke license'); }
    finally { setRevokingLicenseId(null); }
  }

  async function assignLicense(e: React.FormEvent) {
    e.preventDefault();
    setAssigning(true);
    try {
      const res = await apiFetch('/v1/products/licenses/assign', { method: 'POST', body: JSON.stringify(assignForm) });
      if (res.ok) {
        setShowAssignModal(false);
        setAssignForm({ doctorId: '', productCode: 'APPOINTMENTS' });
        const licRes = await apiFetch('/v1/products/licenses');
        if (licRes.ok) setLicenses(await licRes.json());
        setMessage({ type: 'success', text: 'License assigned' });
      } else {
        const err = await res.json();
        alert(err.message || 'Failed');
      }
    } catch { alert('Failed'); }
    finally { setAssigning(false); }
  }

  // ─── COMPUTED ──────────────────────────────────────────────────────────────────
  const activeDoctors = doctors.filter(d => d.complianceStatus === 'compliant' || !d.complianceStatus).length;
  const availableDoctorsForLicense = doctors.filter(d => !licenses.some(l => l.doctorId === d.userId && l.productCode === assignForm.productCode && l.status === 'ACTIVE'));
  const assignTargetDoctor = assignForm.doctorId ? doctors.find(d => d.userId === assignForm.doctorId) : null;
  const assignTargetLicenses = assignForm.doctorId ? licenses.filter(l => l.doctorId === assignForm.doctorId && l.status === 'ACTIVE') : [];
  const unassignedProducts = subscription ? subscription.items.filter(i => !assignTargetLicenses.some(l => l.productCode === i.productCode)) : [];

  const filteredDoctors = doctors.filter(d => {
    if (!doctorSearch) return true;
    const q = doctorSearch.toLowerCase();
    return (d.fullName || '').toLowerCase().includes(q) || d.email.toLowerCase().includes(q) || (d.specialty || '').toLowerCase().includes(q);
  });
  const pagedDoctors = filteredDoctors.slice((doctorPage - 1) * ROWS_PER_PAGE, doctorPage * ROWS_PER_PAGE);
  const doctorTotalPages = Math.max(1, Math.ceil(filteredDoctors.length / ROWS_PER_PAGE));

  // ─── HELPER COMPONENTS ─────────────────────────────────────────────────────────
  const Pagination = ({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) => totalPages <= 1 ? null : (
    <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-100 bg-slate-50/50 shrink-0">
      <span className="text-[10px] text-slate-400">Page {page} of {totalPages}</span>
      <div className="flex gap-1">
        <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-2 py-0.5 text-[10px] rounded border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">Prev</button>
        <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-2 py-0.5 text-[10px] rounded border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
      </div>
    </div>
  );

  const SearchInput = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
    <div className="relative">
      <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="pl-7 pr-2 py-1 text-[10px] border border-slate-300 rounded bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#a3cbef] w-40" />
    </div>
  );

  const TableSkeleton = ({ cols, rows = 3 }: { cols: number; rows?: number }) => (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-3 py-1.5"><div className="h-3 bg-slate-100 rounded animate-pulse w-3/4" /></td>
          ))}
        </tr>
      ))}
    </tbody>
  );

  // ─── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div className="page-fullheight flex flex-col overflow-auto lg:overflow-hidden p-2 gap-1">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-sm font-semibold text-slate-800">Doctors</h1>
      </div>

      {/* Doctors Table */}
      <div className="flex-1 lg:min-h-0 bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-2 py-1.5 bg-[#f0f7ff] shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-semibold text-slate-800">Doctors</h3>
            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-medium rounded">{activeDoctors} active</span>
            <SearchInput value={doctorSearch} onChange={v => { setDoctorSearch(v); setDoctorPage(1); }} placeholder="Search doctors..." />
            {message && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${message.type === 'success' ? 'bg-sky-50 text-sky-700' : 'bg-red-50 text-red-700'}`}>{message.text}</span>
            )}
          </div>
          <button onClick={() => setShowInviteModal(true)} className="px-2 py-1 text-[10px] font-medium text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d]">+ Invite Doctor</button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {!dataLoaded ? (
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Doctor</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Specialty</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Phone</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">License</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Status</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <TableSkeleton cols={6} rows={3} />
            </table>
          ) : (pagedDoctors.length > 0 || pendingInvites.length > 0) ? (
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Doctor</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Specialty</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Phone</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">License</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Status</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedDoctors.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium text-slate-700">Dr. {d.fullName || d.email.split('@')[0]}</div>
                          <div className="text-[10px] text-slate-400">{d.email}</div>
                        </div>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-semibold ${doctorCheckins[d.id] === 'CHECKED_IN' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${doctorCheckins[d.id] === 'CHECKED_IN' ? 'bg-[#4d7c43]' : 'bg-slate-300'}`} />
                          {doctorCheckins[d.id] === 'CHECKED_IN' ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-slate-500 hidden sm:table-cell">{d.specialty || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500 hidden sm:table-cell">{d.phone || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500 hidden sm:table-cell">{d.licenseNumber || '—'}</td>
                    <td className="px-3 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                        d.complianceStatus === 'compliant' || !d.complianceStatus ? 'bg-emerald-50 text-emerald-700' :
                        d.complianceStatus === 'pending_signatures' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {d.complianceStatus === 'compliant' || !d.complianceStatus ? 'Active' : d.complianceStatus === 'pending_signatures' ? 'Pending' : 'Not Logged In'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => openDoctorEditModal(d)} className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold rounded border border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100 transition-colors"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>Edit</button>
                        <button onClick={() => openDoctorScheduleModal(d)} className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold rounded border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>Weekly Shifts</button>
                        <button onClick={() => openTimeOffModal(d)} className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold rounded border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>Time Off</button>
                        <button onClick={() => { const dl = licenses.filter(l => l.doctorId === d.userId && l.status === 'ACTIVE'); const fp = subscription?.items.find(i => !dl.some(l => l.productCode === i.productCode)); setAssignForm({ doctorId: d.userId, productCode: fp?.productCode || '' }); setShowAssignModal(true); }} className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold rounded border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>Licenses</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {doctorPage === doctorTotalPages && pendingInvites.map(inv => (
                  <tr key={inv.id} className="hover:bg-amber-50/30 bg-amber-50/20">
                    <td className="px-3 py-1.5"><div className="font-medium text-slate-500">{inv.invitedEmail}</div></td>
                    <td className="px-3 py-1.5 text-slate-400 hidden sm:table-cell">—</td>
                    <td className="px-3 py-1.5 text-slate-400 hidden sm:table-cell">—</td>
                    <td className="px-3 py-1.5 text-slate-400 hidden sm:table-cell">—</td>
                    <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 text-amber-700">PENDING INVITE</span></td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => revokeInvite(inv.id)} className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold rounded border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>Revoke</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-8 text-center">
              <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-xs text-slate-500">{doctorSearch ? 'No doctors match your search' : 'No doctors yet'}</p>
              <p className="text-[10px] text-slate-400">{doctorSearch ? 'Try a different search' : 'Invite doctors to join your hospital'}</p>
            </div>
          )}
        </div>
        <Pagination page={doctorPage} totalPages={doctorTotalPages} setPage={setDoctorPage} />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODALS */}
      {/* ══════════════════════════════════════════════════════════════════════ */}

      {/* Invite Doctor Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowInviteModal(false)}>
          <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Invite Doctor</h2>
            <form onSubmit={inviteDoctor} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={inviteFirstName} onChange={e => setInviteFirstName(e.target.value)} placeholder="First Name" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                <input type="text" value={inviteLastName} onChange={e => setInviteLastName(e.target.value)} placeholder="Last Name" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
              </div>
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Email *" required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowInviteModal(false)} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={inviting} className="flex-1 py-2 text-xs font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 disabled:opacity-50">{inviting ? 'Sending...' : 'Send Invite'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Doctor Profile Modal */}
      {showDoctorEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setShowDoctorEditModal(false); setEditingDoctorId(null); }}>
          <div className="w-full max-w-5xl bg-white rounded-xl shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-4">
                {/* Avatar Upload */}
                <div className="relative">
                  <div
                    className="w-14 h-14 rounded-xl bg-navy-100 flex items-center justify-center text-xl font-semibold text-navy-600 overflow-hidden cursor-pointer group"
                    onClick={() => doctorAvatarInputRef.current?.click()}
                  >
                    {doctorAvatarPreview ? (
                      <img src={doctorAvatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span>{doctorFormData.firstName?.charAt(0) || 'D'}</span>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  </div>
                  {uploadingDoctorAvatar && (
                    <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  <input ref={doctorAvatarInputRef} type="file" accept="image/*" onChange={handleDoctorAvatarChange} className="hidden" />
                  <button
                    type="button"
                    onClick={() => doctorAvatarInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-6 h-6 bg-navy-600 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-navy-700 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Edit Doctor Profile</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{doctorFormData.firstName ? `Dr. ${doctorFormData.firstName} ${doctorFormData.lastName || ''}` : 'Loading...'}</p>
                </div>
              </div>
              <button onClick={() => { setShowDoctorEditModal(false); setEditingDoctorId(null); }} className="p-1.5 rounded-lg hover:bg-slate-100">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {doctorEditLoading ? (
              <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 border-slate-200 border-t-navy-600 rounded-full animate-spin" /></div>
            ) : (
              <form onSubmit={saveDoctorEdit}>
                <div className="grid grid-cols-3 gap-6 px-6 py-5">
                  {/* Column 1: Personal Information */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">Personal Information</p>
                    <div><label className="block text-[10px] text-slate-500 mb-1">First Name *</label><input type="text" value={doctorFormData.firstName || ''} onChange={e => setDoctorFormData({ ...doctorFormData, firstName: e.target.value })} required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                    <div><label className="block text-[10px] text-slate-500 mb-1">Last Name *</label><input type="text" value={doctorFormData.lastName || ''} onChange={e => setDoctorFormData({ ...doctorFormData, lastName: e.target.value })} required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                    <div><label className="block text-[10px] text-slate-500 mb-1">Phone</label><PhoneInput value={doctorFormData.phone || ''} onChange={(value) => setDoctorFormData({ ...doctorFormData, phone: value })} placeholder="Phone number" /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="block text-[10px] text-slate-500 mb-1">Date of Birth</label><input type="date" value={doctorFormData.dateOfBirth || ''} onChange={e => setDoctorFormData({ ...doctorFormData, dateOfBirth: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                      <div><label className="block text-[10px] text-slate-500 mb-1">Gender</label><select value={doctorFormData.gender || ''} onChange={e => setDoctorFormData({ ...doctorFormData, gender: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white"><option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></div>
                    </div>
                    <div><label className="block text-[10px] text-slate-500 mb-1">National ID</label><input type="text" value={doctorFormData.nationalId || ''} onChange={e => setDoctorFormData({ ...doctorFormData, nationalId: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                    <div><label className="block text-[10px] text-slate-500 mb-1">Bio</label><textarea value={doctorFormData.bio || ''} onChange={e => setDoctorFormData({ ...doctorFormData, bio: e.target.value })} rows={3} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 resize-none" /></div>
                  </div>
                  {/* Column 2: Professional Details */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">Professional Details</p>
                    <div><label className="block text-[10px] text-slate-500 mb-1">Specialization</label><select value={doctorFormData.specialization || ''} onChange={e => setDoctorFormData({ ...doctorFormData, specialization: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white"><option value="">Select</option>{specializations.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select></div>
                    <div><label className="block text-[10px] text-slate-500 mb-1">Department</label><select value={doctorFormData.department || ''} onChange={e => setDoctorFormData({ ...doctorFormData, department: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white"><option value="">Select</option>{DEPARTMENTS.map(dep => <option key={dep} value={dep}>{dep}</option>)}</select></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="block text-[10px] text-slate-500 mb-1">License Number</label><input type="text" value={doctorFormData.licenseNumber || ''} onChange={e => setDoctorFormData({ ...doctorFormData, licenseNumber: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                      <div><label className="block text-[10px] text-slate-500 mb-1">Qualification</label><input type="text" value={doctorFormData.qualification || ''} onChange={e => setDoctorFormData({ ...doctorFormData, qualification: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="block text-[10px] text-slate-500 mb-1">Years of Experience</label><input type="number" value={doctorFormData.yearsOfExperience || ''} onChange={e => setDoctorFormData({ ...doctorFormData, yearsOfExperience: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                      <div><label className="block text-[10px] text-slate-500 mb-1">Employment Type</label><select value={doctorFormData.employmentType || ''} onChange={e => setDoctorFormData({ ...doctorFormData, employmentType: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white"><option value="">Select</option><option value="full-time">Full-Time</option><option value="part-time">Part-Time</option><option value="contract">Contract</option><option value="visiting">Visiting</option></select></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="block text-[10px] text-slate-500 mb-1">Consultation Fee</label><input type="number" value={doctorFormData.consultationFee || ''} onChange={e => setDoctorFormData({ ...doctorFormData, consultationFee: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                      <div><label className="block text-[10px] text-slate-500 mb-1">Education</label><input type="text" value={doctorFormData.education || ''} onChange={e => setDoctorFormData({ ...doctorFormData, education: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                    </div>
                  </div>
                  {/* Column 3: Address & Emergency Contact */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">Address</p>
                    <div><label className="block text-[10px] text-slate-500 mb-1">Address Line 1</label><input type="text" value={doctorFormData.addressLine1 || ''} onChange={e => setDoctorFormData({ ...doctorFormData, addressLine1: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                    <div><label className="block text-[10px] text-slate-500 mb-1">Address Line 2</label><input type="text" value={doctorFormData.addressLine2 || ''} onChange={e => setDoctorFormData({ ...doctorFormData, addressLine2: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                    <div className="grid grid-cols-3 gap-2">
                      <div><label className="block text-[10px] text-slate-500 mb-1">City</label><input type="text" value={doctorFormData.city || ''} onChange={e => setDoctorFormData({ ...doctorFormData, city: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                      <div><label className="block text-[10px] text-slate-500 mb-1">State</label><input type="text" value={doctorFormData.state || ''} onChange={e => setDoctorFormData({ ...doctorFormData, state: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                      <div><label className="block text-[10px] text-slate-500 mb-1">Postal Code</label><input type="text" value={doctorFormData.postalCode || ''} onChange={e => setDoctorFormData({ ...doctorFormData, postalCode: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                    </div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1 pt-2">Emergency Contact</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="block text-[10px] text-slate-500 mb-1">Contact Name</label><input type="text" value={doctorFormData.emergencyContact || ''} onChange={e => setDoctorFormData({ ...doctorFormData, emergencyContact: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" /></div>
                      <div><label className="block text-[10px] text-slate-500 mb-1">Relation</label><select value={doctorFormData.emergencyRelation || ''} onChange={e => setDoctorFormData({ ...doctorFormData, emergencyRelation: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white"><option value="">Select</option>{['Spouse', 'Parent', 'Sibling', 'Child', 'Friend', 'Relative', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                    </div>
                    <div><label className="block text-[10px] text-slate-500 mb-1">Emergency Phone</label><PhoneInput value={doctorFormData.emergencyPhone || ''} onChange={(value) => setDoctorFormData({ ...doctorFormData, emergencyPhone: value })} placeholder="Emergency phone" /></div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
                  <button type="button" onClick={() => { setShowDoctorEditModal(false); setEditingDoctorId(null); }} className="px-5 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100">Cancel</button>
                  <button type="submit" disabled={doctorEditSaving} className="px-5 py-2 text-xs font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 disabled:opacity-50">{doctorEditSaving ? 'Saving...' : 'Save Profile'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Doctor Schedule Modal */}
      {showDoctorScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setShowDoctorScheduleModal(false); setScheduleDoctorId(null); }}>
          <div className="w-full max-w-6xl bg-white rounded-xl shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Weekly Schedule</h2>
                <p className="text-xs text-slate-400 mt-0.5">{scheduleDoctorName}</p>
              </div>
              <button onClick={() => { setShowDoctorScheduleModal(false); setScheduleDoctorId(null); }} className="p-1.5 rounded-lg hover:bg-slate-100">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {doctorScheduleLoading ? (
              <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 border-slate-200 border-t-navy-600 rounded-full animate-spin" /></div>
            ) : (
              <>
                <div className="px-6 py-4">
                  <div className="flex gap-4">
                    <div className="w-[220px] flex-shrink-0 flex flex-col gap-3">
                      {([
                        { key: 'morning' as const, label: 'Morning', icon: <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M12 1v2m0 18v2m11-11h-2M3 12H1m16.36-7.36l-1.41 1.41M7.05 16.95l-1.41 1.41m12.72 0l-1.41-1.41M7.05 7.05L5.64 5.64" /></svg> },
                        { key: 'evening' as const, label: 'Afternoon', icon: <svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-13.66l-.71.71M4.05 19.95l-.71.71M21 12h-1M4 12H3m16.66 7.66l-.71-.71M4.05 4.05l-.71-.71" /><path strokeWidth={2} d="M16 12a4 4 0 11-8 0" /></svg> },
                        { key: 'night' as const, label: 'Night', icon: <svg className="w-3.5 h-3.5 text-[#1e3a5f]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg> },
                      ]).map(shift => (
                        <div key={shift.key} className={`p-3 rounded-lg border ${shift.key === 'morning' ? 'bg-amber-100 border-amber-200' : shift.key === 'evening' ? 'bg-orange-100 border-orange-200' : 'bg-[#e2eaf3] border-[#1e3a5f]/15'}`}>
                          <div className="flex items-center gap-1.5 mb-2">{shift.icon}<span className="text-[11px] font-semibold text-slate-700">{shift.label}</span></div>
                          <div className="grid grid-cols-2 gap-2">
                            <div><label className="block text-[9px] font-medium text-slate-700 mb-0.5">Start</label><ScheduleSelect value={scheduleShiftTimings[shift.key].start} onChange={val => setScheduleShiftTimings(prev => ({ ...prev, [shift.key]: { ...prev[shift.key], start: val } }))} options={TIME_OPTIONS.map(t => ({ value: t, label: formatTime12(t) }))} /></div>
                            <div><label className="block text-[9px] font-medium text-slate-700 mb-0.5">End</label><ScheduleSelect value={scheduleShiftTimings[shift.key].end} onChange={val => setScheduleShiftTimings(prev => ({ ...prev, [shift.key]: { ...prev[shift.key], end: val } }))} options={TIME_OPTIONS.map(t => ({ value: t, label: formatTime12(t) }))} /></div>
                          </div>
                        </div>
                      ))}
                      <div className="p-3 bg-white border border-slate-200 rounded-lg">
                        <div className="flex items-center gap-1.5 mb-2">
                          <svg className="w-3.5 h-3.5 text-[#1e3a5f]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          <span className="text-[11px] font-semibold text-slate-700">Appointment Duration</span>
                        </div>
                        <ScheduleSelect value={String(scheduleApptDuration)} onChange={val => setScheduleApptDuration(Number(val))} options={APPT_DURATIONS.map(d => ({ value: String(d), label: `${d} minutes` }))} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="py-2 text-left text-[10px] font-semibold text-slate-500 uppercase w-28">Day</th>
                            <th className="py-2 text-center text-[10px] font-semibold text-slate-500 uppercase"><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-300"></span>Morning</span></th>
                            <th className="py-2 text-center text-[10px] font-semibold text-slate-500 uppercase"><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-300"></span>Afternoon</span></th>
                            <th className="py-2 text-center text-[10px] font-semibold text-slate-500 uppercase"><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#1e3a5f]"></span>Night</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {doctorSchedule.map((day, idx) => (
                            <tr key={idx} className="border-b border-slate-100">
                              <td className="py-2.5"><span className={`text-xs font-medium ${day.isWorking ? 'text-slate-800' : 'text-slate-500'}`}>{DAYS_OF_WEEK[idx]}</span></td>
                              {(['morning', 'evening', 'night'] as const).map(shift => {
                                const isActive = day[`${shift}Shift` as keyof DoctorScheduleDay] as boolean;
                                const timings = scheduleShiftTimings[shift];
                                return (
                                  <td key={shift} className="py-2.5 text-center">
                                    <label className={`inline-flex items-center justify-center min-w-[100px] px-3 py-1.5 rounded-md text-[10px] font-semibold cursor-pointer transition-all border ${isActive ? shift === 'night' ? 'bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-sm' : shift === 'morning' ? 'bg-amber-200 text-amber-800 border-amber-200 shadow-sm' : 'bg-orange-200 text-orange-800 border-orange-200 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-500'}`}>
                                      <input type="checkbox" checked={isActive} onChange={e => handleDoctorScheduleChange(idx, `${shift}Shift`, e.target.checked)} className="sr-only" />
                                      {isActive ? `${shortTime(timings.start)}-${shortTime(timings.end)}` : '+'}
                                    </label>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl">
                  <button type="button" onClick={() => { setShowDoctorScheduleModal(false); setScheduleDoctorId(null); }} className="px-5 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100">Cancel</button>
                  <button onClick={saveDoctorSchedule} disabled={doctorScheduleSaving} className="px-5 py-2 text-xs font-medium text-white bg-[#1e3a5f] rounded-lg hover:bg-[#162f4d] disabled:opacity-50">{doctorScheduleSaving ? 'Saving...' : 'Save Schedule'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Time Off Modal */}
      {showTimeOffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setShowTimeOffModal(false); setTimeOffDoctorId(null); }}>
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Time Off</h2>
                <p className="text-[10px] text-slate-400 mt-0.5">{timeOffDoctorName}</p>
              </div>
              <button onClick={() => { setShowTimeOffModal(false); setTimeOffDoctorId(null); }} className="p-1.5 rounded-lg hover:bg-slate-100">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {timeOffLoading ? (
              <div className="py-12 flex justify-center"><div className="w-6 h-6 border-2 border-slate-200 border-t-navy-600 rounded-full animate-spin" /></div>
            ) : (
              <div className="px-5 py-4">
                {/* Calendar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => setTimeOffCalMonth(new Date(timeOffCalMonth.getFullYear(), timeOffCalMonth.getMonth() - 1, 1))} className="p-1 rounded hover:bg-slate-100">
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <span className="text-xs font-semibold text-slate-700">
                      {['January','February','March','April','May','June','July','August','September','October','November','December'][timeOffCalMonth.getMonth()]} {timeOffCalMonth.getFullYear()}
                    </span>
                    <button onClick={() => setTimeOffCalMonth(new Date(timeOffCalMonth.getFullYear(), timeOffCalMonth.getMonth() + 1, 1))} className="p-1 rounded hover:bg-slate-100">
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 text-center">
                    {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                      <div key={d} className="text-[9px] font-medium text-slate-400 py-1">{d}</div>
                    ))}
                    {(() => {
                      const year = timeOffCalMonth.getFullYear(), month = timeOffCalMonth.getMonth();
                      const firstDay = new Date(year, month, 1).getDay();
                      const daysInMonth = new Date(year, month + 1, 0).getDate();
                      const daysInPrev = new Date(year, month, 0).getDate();
                      const fmt = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      const now = getCurrentTime();
                      const todayStr = fmt(now.getFullYear(), now.getMonth(), now.getDate());
                      const cells: React.ReactNode[] = [];

                      // Build time-off set for highlighting
                      const toSet = new Set<string>();
                      doctorTimeOffs.forEach(to => {
                        const s = new Date(to.startDate + 'T00:00:00');
                        const e = new Date(to.endDate + 'T00:00:00');
                        for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
                          toSet.add(fmt(d.getFullYear(), d.getMonth(), d.getDate()));
                        }
                      });

                      // Selection range
                      const isInSelection = (ds: string) => {
                        if (!timeOffForm.startDate) return false;
                        const end = timeOffForm.endDate || timeOffForm.startDate;
                        return ds >= timeOffForm.startDate && ds <= end;
                      };

                      const handleCalClick = (dateStr: string) => {
                        if (dateStr < todayStr) return;
                        if (timeOffSelClickCount === 0 || !timeOffForm.startDate) {
                          setTimeOffForm({ ...timeOffForm, startDate: dateStr, endDate: dateStr });
                          setTimeOffSelClickCount(1);
                        } else {
                          const end = dateStr >= timeOffForm.startDate ? dateStr : timeOffForm.startDate;
                          const start = dateStr < timeOffForm.startDate ? dateStr : timeOffForm.startDate;
                          setTimeOffForm({ ...timeOffForm, startDate: start, endDate: end });
                          setTimeOffSelClickCount(0);
                        }
                      };

                      // Previous month padding
                      const pM = month === 0 ? 11 : month - 1, pY = month === 0 ? year - 1 : year;
                      for (let i = firstDay - 1; i >= 0; i--) {
                        const d = daysInPrev - i;
                        cells.push(<div key={`p${d}`} className="text-[10px] text-slate-300 py-1.5">{d}</div>);
                      }
                      // Current month
                      for (let d = 1; d <= daysInMonth; d++) {
                        const ds = fmt(year, month, d);
                        const isPast = ds < todayStr;
                        const isTimeOff = toSet.has(ds);
                        const isSel = isInSelection(ds);
                        const isToday = ds === todayStr;
                        cells.push(
                          <button key={d} type="button" disabled={isPast}
                            onClick={() => handleCalClick(ds)}
                            className={`text-[10px] py-1.5 rounded transition-all ${
                              isTimeOff ? 'bg-red-100 text-red-700 font-semibold' :
                              isSel ? 'bg-purple-200 text-purple-800 font-semibold' :
                              isToday ? 'bg-[#1e3a5f] text-white font-semibold' :
                              isPast ? 'text-slate-300 cursor-not-allowed' :
                              'text-slate-700 hover:bg-purple-50 cursor-pointer'
                            }`}
                          >{d}</button>
                        );
                      }
                      // Next month padding
                      const rem = 42 - cells.length;
                      const nM = month === 11 ? 0 : month + 1, nY = month === 11 ? year + 1 : year;
                      for (let d = 1; d <= rem; d++) {
                        cells.push(<div key={`n${d}`} className="text-[10px] text-slate-300 py-1.5">{d}</div>);
                      }
                      return cells;
                    })()}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[9px] text-slate-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-100 border border-red-200" />Existing time off</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-purple-200 border border-purple-300" />Selected</span>
                  </div>
                </div>

                {/* Add time off form */}
                <div className="flex items-end gap-2 mb-4">
                  <div className="flex-1">
                    <label className="block text-[9px] font-medium text-slate-500 mb-0.5">Start</label>
                    <input type="date" value={timeOffForm.startDate} onChange={e => setTimeOffForm({ ...timeOffForm, startDate: e.target.value })} className="w-full px-2 py-1.5 text-[11px] border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-300" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[9px] font-medium text-slate-500 mb-0.5">End</label>
                    <input type="date" value={timeOffForm.endDate} onChange={e => setTimeOffForm({ ...timeOffForm, endDate: e.target.value })} className="w-full px-2 py-1.5 text-[11px] border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-300" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[9px] font-medium text-slate-500 mb-0.5">Reason</label>
                    <input type="text" value={timeOffForm.reason} onChange={e => setTimeOffForm({ ...timeOffForm, reason: e.target.value })} placeholder="Optional" className="w-full px-2 py-1.5 text-[11px] border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-300" />
                  </div>
                  <button onClick={handleAddTimeOff} disabled={addingTimeOff || !timeOffForm.startDate || !timeOffForm.endDate} className="px-3 py-1.5 text-[10px] font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap">
                    {addingTimeOff ? 'Adding...' : '+ Add'}
                  </button>
                </div>

                {/* Existing time-offs list */}
                {doctorTimeOffs.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Scheduled Time Off</p>
                    <div className="space-y-1 max-h-32 overflow-auto">
                      {doctorTimeOffs.map(to => {
                        const startParts = to.startDate.split('-').map(Number);
                        const endParts = to.endDate.split('-').map(Number);
                        const startStr = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][startParts[1]-1]} ${startParts[2]}`;
                        const endStr = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][endParts[1]-1]} ${endParts[2]}, ${endParts[0]}`;
                        return (
                          <div key={to.id} className="flex items-center justify-between px-2.5 py-1.5 bg-red-50 rounded-md border border-red-100">
                            <div className="flex items-center gap-2">
                              <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                              <span className="text-[10px] font-medium text-slate-700">{startStr} — {endStr}</span>
                              {to.reason && <span className="text-[9px] text-slate-400">({to.reason})</span>}
                            </div>
                            <button onClick={() => handleDeleteTimeOff(to.id)} className="text-[9px] font-medium text-red-500 hover:text-red-700">Remove</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end px-5 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl">
              <button onClick={() => { setShowTimeOffModal(false); setTimeOffDoctorId(null); }} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict Warning Modal */}
      {showConflictModal && conflictData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 rounded-t-lg flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <h3 className="font-semibold text-amber-900 text-sm">Schedule Change Conflicts</h3>
                <p className="text-[11px] text-amber-700">This change will affect existing appointments</p>
              </div>
            </div>
            {/* Summary */}
            <div className="px-4 py-2 bg-amber-50/50 border-b border-slate-200">
              <div className="flex items-center gap-4 text-[11px]">
                <div className="flex items-center gap-1">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-700 font-bold text-[10px]">{conflictData.summary.totalAppointments}</span>
                  <span className="text-slate-600">appointment{conflictData.summary.totalAppointments !== 1 ? 's' : ''} to cancel</span>
                </div>
                {conflictData.summary.totalQueueEntries > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-100 text-orange-700 font-bold text-[10px]">{conflictData.summary.totalQueueEntries}</span>
                    <span className="text-slate-600">queue entr{conflictData.summary.totalQueueEntries !== 1 ? 'ies' : 'y'}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 ml-auto">
                  <span className="text-slate-500">{conflictData.summary.slotsToDelete} slots to regenerate</span>
                </div>
              </div>
            </div>
            {/* Conflict Table */}
            <div className="flex-1 overflow-auto px-4 py-2">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200 text-slate-500 text-left">
                    <th className="py-1.5 font-medium">Date</th>
                    <th className="py-1.5 font-medium">Time</th>
                    <th className="py-1.5 font-medium">Patient</th>
                    <th className="py-1.5 font-medium">Status</th>
                    <th className="py-1.5 font-medium text-center">Queue</th>
                  </tr>
                </thead>
                <tbody>
                  {conflictData.conflicts.map((c) => (
                    <tr key={c.appointmentId} className={`border-b border-slate-100 ${c.hasQueueEntry ? 'bg-amber-50/50' : ''}`}>
                      <td className="py-1.5 text-slate-700">{fmtDateStr(c.appointmentDate, { weekday: true })}</td>
                      <td className="py-1.5 text-slate-700">{formatTime12(c.startTime)} - {formatTime12(c.endTime)}</td>
                      <td className="py-1.5 font-medium text-slate-800">{c.patientName}</td>
                      <td className="py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${c.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{c.status}</span>
                      </td>
                      <td className="py-1.5 text-center">
                        {c.hasQueueEntry ? (
                          <span className="inline-block w-4 h-4 rounded-full bg-orange-200 text-orange-700 text-[9px] leading-4 text-center font-bold">Q</span>
                        ) : (
                          <span className="text-slate-300">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Warning note */}
            <div className="px-4 py-2 border-t border-slate-100">
              <p className="text-[10px] text-red-600">Confirming will cancel the above appointments, remove related queue entries, and regenerate all future slots based on the new schedule.</p>
            </div>
            {/* Footer */}
            <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2 bg-slate-50 rounded-b-lg">
              <button
                onClick={() => { setShowConflictModal(false); setConflictData(null); setPendingSaveAction(null); setDoctorScheduleSaving(false); setAddingTimeOff(false); }}
                disabled={conflictResolving}
                className="px-4 py-1.5 text-[11px] text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-100 disabled:opacity-50"
              >Cancel</button>
              <button
                onClick={async () => {
                  if (!pendingSaveAction) return;
                  setConflictResolving(true);
                  try {
                    await pendingSaveAction();
                  } catch (e) {
                    console.error('Conflict resolution failed:', e);
                    alert('Failed to apply changes');
                  } finally {
                    setConflictResolving(false);
                    setShowConflictModal(false);
                    setConflictData(null);
                    setPendingSaveAction(null);
                    setDoctorScheduleSaving(false);
                    setAddingTimeOff(false);
                  }
                }}
                disabled={conflictResolving}
                className="px-4 py-1.5 text-[11px] text-white bg-[#1e3a5f] rounded-md hover:bg-[#2b5a8a] disabled:opacity-50 flex items-center gap-1"
              >
                {conflictResolving ? (
                  <><svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>Resolving...</>
                ) : 'Confirm & Regenerate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke License Modal */}
      {showRevokeLicenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowRevokeLicenseModal(false)}>
          <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-1">Revoke License</h2>
            <p className="text-[10px] text-slate-400 mb-3">Select a license to revoke for {revokeDoctorName}</p>
            {revokeDoctorLicenses.length > 0 ? (
              <div className="space-y-2">
                {revokeDoctorLicenses.map(l => (
                  <div key={l.id} className="flex items-center justify-between p-2 border border-slate-200 rounded-lg hover:bg-slate-50">
                    <div>
                      <p className="text-xs font-medium text-slate-700">{l.productName}</p>
                      <p className="text-[10px] text-slate-400">Assigned {formatShortDate(l.assignedAt)}</p>
                    </div>
                    <button onClick={() => handleRevokeLicense(l.id)} disabled={revokingLicenseId === l.id} className="px-2.5 py-1 text-[10px] font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50">{revokingLicenseId === l.id ? 'Revoking...' : 'Revoke'}</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center"><p className="text-xs text-slate-500">No active licenses found for this doctor.</p></div>
            )}
            <div className="mt-3"><button type="button" onClick={() => setShowRevokeLicenseModal(false)} className="w-full py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Close</button></div>
          </div>
        </div>
      )}

      {/* Assign License Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowAssignModal(false); setAssignDoctorSearch(''); setAssignProductOpen(false); setAssignDoctorOpen(false); }}>
          <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-5" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-4">{assignTargetDoctor ? 'License Management' : 'Assign License'}</h2>
            {assignTargetDoctor && (
              <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="w-9 h-9 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{(assignTargetDoctor.fullName || assignTargetDoctor.email || '?').charAt(0).toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate">Dr. {assignTargetDoctor.fullName || 'Unknown'}</div>
                  <div className="text-[10px] text-slate-400 truncate">{assignTargetDoctor.email}</div>
                  {assignTargetDoctor.specialty && <div className="text-[10px] text-[#1e3a5f]/60 truncate">{assignTargetDoctor.specialty}</div>}
                </div>
              </div>
            )}
            {assignTargetDoctor && assignTargetLicenses.length > 0 && (
              <div className="mb-4">
                <label className="block text-[11px] font-medium text-slate-600 mb-1.5">Active Licenses</label>
                <div className="space-y-1">
                  {assignTargetLicenses.map(l => (
                    <div key={l.id} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-md border border-emerald-200/60">
                      <svg className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      <span className="text-xs font-medium text-emerald-700 flex-1">{l.productName}</span>
                      <button type="button" onClick={() => handleRevokeLicense(l.id)} disabled={revokingLicenseId === l.id} className="text-[9px] font-medium text-red-500 hover:text-red-700 disabled:opacity-50">{revokingLicenseId === l.id ? '...' : 'Revoke'}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {assignTargetDoctor ? (
              unassignedProducts.length > 0 ? (
                <form onSubmit={assignLicense} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Assign New Product</label>
                    <div className="relative" ref={assignProductRef}>
                      <button type="button" onClick={() => setAssignProductOpen(!assignProductOpen)} className={`flex items-center w-full border bg-white cursor-pointer hover:border-[#2b5a8a] focus:outline-none focus:ring-1 focus:ring-[#a3cbef] transition-all text-xs rounded-lg px-3 py-2 ${assignProductOpen ? 'border-[#2b5a8a] ring-1 ring-[#a3cbef]' : 'border-slate-200'}`}>
                        <span className="flex-1 text-left truncate text-slate-900 font-medium">{unassignedProducts.find(i => i.productCode === assignForm.productCode)?.productName || unassignedProducts[0]?.productName || 'Select product...'}</span>
                        <svg className={`flex-shrink-0 w-3.5 h-3.5 text-slate-400 transition-transform ${assignProductOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      {assignProductOpen && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                          {unassignedProducts.map(item => (
                            <button type="button" key={item.productCode} onClick={() => { setAssignForm({ ...assignForm, productCode: item.productCode }); setAssignProductOpen(false); }} className={`w-full text-left px-3 py-2 text-xs transition-colors ${item.productCode === assignForm.productCode ? 'bg-[#1e3a5f] text-white font-medium' : 'text-slate-700 hover:bg-[#e8f4fc] hover:text-[#1e3a5f]'}`}>{item.productName}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => setShowAssignModal(false)} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                    <button type="submit" disabled={assigning || !assignForm.productCode} className="flex-1 py-2 text-xs font-medium text-white bg-[#1e3a5f] rounded-lg hover:bg-[#162f4d] disabled:opacity-50">{assigning ? 'Assigning...' : 'Assign'}</button>
                  </div>
                </form>
              ) : (
                <div className="text-center py-3">
                  <p className="text-xs text-slate-400 mb-3">All available products have been assigned to this doctor.</p>
                  <button type="button" onClick={() => setShowAssignModal(false)} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Close</button>
                </div>
              )
            ) : (
              <form onSubmit={assignLicense} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Product</label>
                  <div className="relative" ref={assignProductRef}>
                    <button type="button" onClick={() => { setAssignProductOpen(!assignProductOpen); setAssignDoctorOpen(false); }} className={`flex items-center w-full border bg-white cursor-pointer hover:border-[#2b5a8a] focus:outline-none focus:ring-1 focus:ring-[#a3cbef] transition-all text-xs rounded-lg px-3 py-2 ${assignProductOpen ? 'border-[#2b5a8a] ring-1 ring-[#a3cbef]' : 'border-slate-200'}`}>
                      <span className="flex-1 text-left truncate text-slate-900 font-medium">{subscription?.items.find(i => i.productCode === assignForm.productCode)?.productName || 'Select product...'}</span>
                      <svg className={`flex-shrink-0 w-3.5 h-3.5 text-slate-400 transition-transform ${assignProductOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {assignProductOpen && (
                      <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                        {subscription?.items.map(item => (
                          <button type="button" key={item.productCode} onClick={() => { setAssignForm({ ...assignForm, productCode: item.productCode, doctorId: '' }); setAssignProductOpen(false); }} className={`w-full text-left px-3 py-2 text-xs transition-colors ${item.productCode === assignForm.productCode ? 'bg-[#1e3a5f] text-white font-medium' : 'text-slate-700 hover:bg-[#e8f4fc] hover:text-[#1e3a5f]'}`}>{item.productName}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Doctor</label>
                  <div className="relative" ref={assignDoctorRef}>
                    <button type="button" onClick={() => { setAssignDoctorOpen(!assignDoctorOpen); setAssignProductOpen(false); }} className={`flex items-center w-full border bg-white cursor-pointer hover:border-[#2b5a8a] focus:outline-none focus:ring-1 focus:ring-[#a3cbef] transition-all text-xs rounded-lg px-3 py-2 ${assignDoctorOpen ? 'border-[#2b5a8a] ring-1 ring-[#a3cbef]' : 'border-slate-200'}`}>
                      <span className={`flex-1 text-left truncate ${assignForm.doctorId ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
                        {assignForm.doctorId ? `Dr. ${availableDoctorsForLicense.find(d => d.userId === assignForm.doctorId)?.fullName || availableDoctorsForLicense.find(d => d.userId === assignForm.doctorId)?.email || ''}` : doctors.length === 0 ? 'No doctors added yet' : availableDoctorsForLicense.length === 0 ? 'All doctors assigned' : 'Select doctor...'}
                      </span>
                      <svg className={`flex-shrink-0 w-3.5 h-3.5 text-slate-400 transition-transform ${assignDoctorOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {assignDoctorOpen && (
                      <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden">
                        <div className="p-2 border-b border-slate-100">
                          <div className="relative">
                            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <input type="text" value={assignDoctorSearch} onChange={e => setAssignDoctorSearch(e.target.value)} placeholder="Search doctors..." className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#a3cbef] focus:border-[#2b5a8a]" autoFocus />
                          </div>
                        </div>
                        <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                          {availableDoctorsForLicense.filter(d => { if (!assignDoctorSearch) return true; const q = assignDoctorSearch.toLowerCase(); return (d.fullName || '').toLowerCase().includes(q) || (d.email || '').toLowerCase().includes(q); }).length === 0 ? (
                            <div className="px-3 py-3 text-xs text-slate-400 text-center">{doctors.length === 0 ? 'No doctors added yet' : assignDoctorSearch ? 'No matching doctors' : 'All doctors have been assigned this license'}</div>
                          ) : (
                            availableDoctorsForLicense.filter(d => { if (!assignDoctorSearch) return true; const q = assignDoctorSearch.toLowerCase(); return (d.fullName || '').toLowerCase().includes(q) || (d.email || '').toLowerCase().includes(q); }).map(d => (
                              <button type="button" key={d.userId} onClick={() => { setAssignForm({ ...assignForm, doctorId: d.userId }); setAssignDoctorOpen(false); setAssignDoctorSearch(''); }} className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${d.userId === assignForm.doctorId ? 'bg-[#1e3a5f] text-white' : 'text-slate-700 hover:bg-[#e8f4fc] hover:text-[#1e3a5f]'}`}>
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${d.userId === assignForm.doctorId ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{(d.fullName || d.email || '?').charAt(0).toUpperCase()}</div>
                                <div className="min-w-0">
                                  <div className={`truncate font-medium ${d.userId === assignForm.doctorId ? 'text-white' : ''}`}>Dr. {d.fullName || 'No name'}</div>
                                  <div className={`truncate text-[10px] ${d.userId === assignForm.doctorId ? 'text-white/70' : 'text-slate-400'}`}>{d.email}</div>
                                </div>
                                {d.userId === assignForm.doctorId && <svg className="w-4 h-4 ml-auto flex-shrink-0 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => { setShowAssignModal(false); setAssignDoctorSearch(''); }} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                  <button type="submit" disabled={assigning || !assignForm.doctorId} className="flex-1 py-2 text-xs font-medium text-white bg-[#1e3a5f] rounded-lg hover:bg-[#162f4d] disabled:opacity-50">{assigning ? 'Assigning...' : 'Assign'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmDialog(null)}>
          <div className="w-full max-w-xs bg-white rounded-lg shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">{confirmDialog.title}</h3>
            <p className="text-[11px] text-slate-500 mb-4">{confirmDialog.message}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className={`flex-1 py-2 text-xs font-medium text-white rounded-lg ${confirmDialog.destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1e3a5f] hover:bg-[#162f4d]'}`}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DoctorsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[200px]"><div className="w-6 h-6 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <DoctorsContent />
    </Suspense>
  );
}
