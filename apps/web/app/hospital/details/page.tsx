'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import { useRbac } from '../../../lib/rbac/RbacContext';
import { COUNTRIES, COUNTRY_NAME_TO_CODE } from '../../../lib/countries';
import { getStatesForCountry, getStateName } from '../../../lib/countryStateData';
import PhoneInput from '../../../components/PhoneInput';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface HospitalDetails {
  id: string;
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postal?: string;
  country: string;
  region?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  pictureUrl?: string;
  legalEntityName?: string;
  taxIdType?: string;
  taxIdValue?: string;
  billingContactEmail?: string;
  billingAddressLine1?: string;
  billingAddressLine2?: string;
  billingCity?: string;
  billingState?: string;
  billingPostal?: string;
  billingCountry?: string;
  storesPhi?: boolean;
  estimatedPatientVolume?: number;
  dataRetentionDays?: number;
  hospitalType?: string;
  specialties?: { id: string; name: string }[];
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  accreditationBody?: string;
  accreditationNumber?: string;
  accreditationExpiry?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  operatingHours?: Record<string, { open: string; close: string; closed: boolean }>;
  certifications?: string;
  hospitalHolidays?: { month: number; day: number; name: string }[];
}

interface Specialization {
  id: string;
  name: string;
  description?: string;
}

interface StaffMember {
  id: string;
  email: string;
  displayName: string;
  title?: string | null;
  phone?: string | null;
  status: string;
  assignedDoctorIds?: string[] | null;
  createdAt: string;
}

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

function formatTime12(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEPARTMENTS = [
  'Emergency Medicine', 'Internal Medicine', 'Surgery', 'Pediatrics',
  'Obstetrics & Gynecology', 'Cardiology', 'Neurology', 'Orthopedics',
  'Radiology', 'Pathology', 'Anesthesiology', 'Dermatology',
  'Ophthalmology', 'ENT', 'Urology', 'Psychiatry', 'Oncology',
  'Pulmonology', 'Gastroenterology', 'Nephrology', 'Endocrinology',
  'Rheumatology', 'ICU', 'General Practice', 'Rehabilitation',
];

interface Manager {
  id: string;
  userId: string;
  email: string;
  fullName?: string;
  role: string;
  isPrimary: boolean;
  status: string;
  createdAt: string;
  hasLoggedIn?: boolean;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  status: 'active' | 'inactive';
  createdAt: string;
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
  billingCycleStart: string;
  billingCycleEnd: string;
  trialEndsAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items: { productCode: string; productName: string; doctorLimit: number; pricePerDoctor: number; currency: string; monthlyTotal: number }[];
  totalMonthly: number;
}

interface LicenseStats {
  byProduct: { productCode: string; productName: string; totalLicenses: number; usedLicenses: number; availableLicenses: number }[];
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

type TabType = 'details' | 'manager' | 'staff' | 'doctors' | 'patients';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function HospitalAdministrationContent() {
  const searchParams = useSearchParams();
  const { currentHospital, currentHospitalId, profile, refreshProfile } = useAuth();
  const { canEdit } = useRbac();
  const canEditSettings = canEdit('hospital.settings');
  const isManager = profile?.isSuperAdmin || currentHospital?.role === 'HOSPITAL_MANAGER';

  // ─── STATE ───────────────────────────────────────────────────────────────────
  const [dataLoaded, setDataLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string; source: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void; destructive?: boolean } | null>(null);

  // Signed documents
  const [signedDocs, setSignedDocs] = useState<any[]>([]);
  const [viewingDoc, setViewingDoc] = useState<any | null>(null);

  // Hospital
  const [generalEditMode, setGeneralEditMode] = useState(false);
  const [billingAddressEditMode, setBillingAddressEditMode] = useState(false);
  const [legalComplianceEditMode, setLegalComplianceEditMode] = useState(false);
  const [classificationEditMode, setClassificationEditMode] = useState(false);
  const [generalSaving, setGeneralSaving] = useState(false);
  const [billingAddressSaving, setBillingAddressSaving] = useState(false);
  const [legalComplianceSaving, setLegalComplianceSaving] = useState(false);
  const [classificationSaving, setClassificationSaving] = useState(false);
  const [hospital, setHospital] = useState<Partial<HospitalDetails>>({});
  const hospitalRef = useRef<Partial<HospitalDetails>>({});
  hospitalRef.current = hospital; // Always keep ref in sync
  const [originalHospital, setOriginalHospital] = useState<Partial<HospitalDetails>>({});
  const [specializations, setSpecializations] = useState<Specialization[]>([]);
  const [selectedSpecialtyIds, setSelectedSpecialtyIds] = useState<string[]>([]);
  const [sameAsHospitalAddress, setSameAsHospitalAddress] = useState(false);
  const [hoursEditMode, setHoursEditMode] = useState(false);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [holidayMonth, setHolidayMonth] = useState<number | null>(null);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [calSelectedDate, setCalSelectedDate] = useState<string>('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const pictureInputRef = useRef<HTMLInputElement>(null);

  // Manager Profile
  const [showEditManagerModal, setShowEditManagerModal] = useState(false);
  const [editingManager, setEditingManager] = useState<Manager | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', phone: '' });

  // Staff
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffForm, setStaffForm] = useState({ email: '', password: '', firstName: '', lastName: '', title: '', phone: '' });
  const [staffAssignAll, setStaffAssignAll] = useState(true);
  const [staffSelectedDoctorIds, setStaffSelectedDoctorIds] = useState<string[]>([]);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [passwordResetStaff, setPasswordResetStaff] = useState<StaffMember | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // Managers
  const [managers, setManagers] = useState<Manager[]>([]);
  const [pendingManagerInvites, setPendingManagerInvites] = useState<Invite[]>([]);
  const [showInviteManagerModal, setShowInviteManagerModal] = useState(false);
  const [inviteManagerEmail, setInviteManagerEmail] = useState('');
  const [inviteManagerFirstName, setInviteManagerFirstName] = useState('');
  const [inviteManagerLastName, setInviteManagerLastName] = useState('');
  const [invitingManager, setInvitingManager] = useState(false);

  // Doctors
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // Doctor Edit Modal
  const [showDoctorEditModal, setShowDoctorEditModal] = useState(false);
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [doctorFormData, setDoctorFormData] = useState<Record<string, any>>({});
  const [doctorEditSaving, setDoctorEditSaving] = useState(false);
  const [doctorEditLoading, setDoctorEditLoading] = useState(false);

  // Doctor Schedule Modal
  const [showDoctorScheduleModal, setShowDoctorScheduleModal] = useState(false);
  const [scheduleDoctorId, setScheduleDoctorId] = useState<string | null>(null);
  const [scheduleDoctorName, setScheduleDoctorName] = useState('');
  const [doctorSchedule, setDoctorSchedule] = useState<DoctorScheduleDay[]>([]);
  const [doctorScheduleSaving, setDoctorScheduleSaving] = useState(false);
  const [doctorScheduleLoading, setDoctorScheduleLoading] = useState(false);
  const [scheduleShiftTimings, setScheduleShiftTimings] = useState<ShiftTimingConfig>({ ...DEFAULT_SHIFT_TIMINGS });

  // Revoke License Modal
  const [showRevokeLicenseModal, setShowRevokeLicenseModal] = useState(false);
  const [revokeDoctorName, setRevokeDoctorName] = useState('');
  const [revokeDoctorLicenses, setRevokeDoctorLicenses] = useState<License[]>([]);
  const [revokingLicenseId, setRevokingLicenseId] = useState<string | null>(null);

  // Billing
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [licenseStats, setLicenseStats] = useState<LicenseStats | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ doctorId: '', productCode: 'APPOINTMENTS' });
  const [assigning, setAssigning] = useState(false);
  const [assignProductOpen, setAssignProductOpen] = useState(false);
  const [assignDoctorOpen, setAssignDoctorOpen] = useState(false);
  const [assignDoctorSearch, setAssignDoctorSearch] = useState('');
  const assignProductRef = useRef<HTMLDivElement>(null);
  const assignDoctorRef = useRef<HTMLDivElement>(null);

  // Patients
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [patientSaving, setPatientSaving] = useState(false);
  const [patientForm, setPatientForm] = useState({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '' });

  // ─── AUTO-DISMISS BANNERS AFTER 10 SECONDS ──────────────────────────────────
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
        const [hospRes, staffRes, membersRes, invitesRes, subRes, statsRes, licRes, patientsRes, specRes] = await Promise.all([
          apiFetch(`/v1/hospitals/${currentHospitalId}`),
          apiFetch('/v1/staff'),
          apiFetch('/v1/hospitals/members/compliance'),
          apiFetch('/v1/invites/pending'),
          apiFetch('/v1/products/subscription'),
          apiFetch('/v1/products/subscription/license-stats'),
          apiFetch('/v1/products/licenses'),
          apiFetch('/v1/patients'),
          apiFetch('/v1/specializations'),
        ]);

        if (specRes.ok) setSpecializations(await specRes.json());
        if (hospRes.ok) {
          const d = await hospRes.json();
          // Normalize country to ISO code if stored as full name
          if (d.country && d.country.length > 2) {
            const code = COUNTRY_NAME_TO_CODE[d.country];
            if (code) d.country = code;
          }
          if (d.billingCountry && d.billingCountry.length > 2) {
            const code = COUNTRY_NAME_TO_CODE[d.billingCountry];
            if (code) d.billingCountry = code;
          }
          setHospital(d);
          setOriginalHospital(d);
          setSelectedSpecialtyIds((d.specialties || []).map((s: any) => s.id));
          setLogoPreview(d.logoUrl || null);
          setPicturePreview(d.pictureUrl || null);
          if (d.billingAddressLine1 && d.billingAddressLine1 === d.addressLine1 &&
              d.billingCity === d.city && d.billingState === d.state &&
              d.billingPostal === d.postal && d.billingCountry === d.country) {
            setSameAsHospitalAddress(true);
          }
        }
        if (staffRes.ok) setStaff(await staffRes.json());
        if (membersRes.ok) {
          const m = await membersRes.json();
          setDoctors(m.filter((x: any) => x.role === 'DOCTOR'));
          setManagers(m.filter((x: any) => x.role === 'HOSPITAL_MANAGER'));
        }
        if (invitesRes.ok) {
          const inv = await invitesRes.json();
          setPendingInvites(inv.filter((i: Invite) => i.status === 'PENDING' && i.role === 'DOCTOR'));
          setPendingManagerInvites(inv.filter((i: Invite) => i.status === 'PENDING' && i.role === 'HOSPITAL_MANAGER'));
        }
        if (subRes.ok) setSubscription(await subRes.json());
        if (statsRes.ok) setLicenseStats(await statsRes.json());
        if (licRes.ok) setLicenses(await licRes.json());
        if (patientsRes.ok) setPatients(await patientsRes.json());

        // Fetch signed documents
        try {
          const docsRes = await apiFetch('/v1/legal/hospital-acceptances');
          if (docsRes.ok) setSignedDocs(await docsRes.json());
        } catch {}
      } catch (e) {
        console.error('Fetch error:', e);
      } finally {
        setDataLoaded(true);
      }
    }
    fetchAll();

    if (profile) {
      const nameParts = (profile.fullName || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      setProfileForm({ firstName, lastName, phone: profile.phone || '' });
    }

    const tab = searchParams.get('tab');
    if (tab && ['details', 'manager', 'staff', 'doctors', 'patients'].includes(tab)) setActiveTab(tab as TabType);
  }, [currentHospitalId, profile, searchParams]);

  // ─── HANDLERS ────────────────────────────────────────────────────────────────
  // Helper: resolve country code for display
  const displayCountry = (code: string) => COUNTRIES.find(c => c.code === code)?.name || code;
  const displayState = (country: string, state: string) => {
    const states = getStatesForCountry(country);
    return states.find(s => s.code === state)?.name || state;
  };

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setMessage({ type: 'error', text: 'Logo must be under 2MB', source: 'general' }); return; }
    const reader = new FileReader();
    reader.onloadend = () => { setLogoPreview(reader.result as string); setHospital(h => ({ ...h, logoUrl: reader.result as string })); };
    reader.readAsDataURL(file);
  }

  function handlePictureChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setMessage({ type: 'error', text: 'Picture must be under 2MB', source: 'general' }); return; }
    const reader = new FileReader();
    reader.onloadend = () => { setPicturePreview(reader.result as string); setHospital(h => ({ ...h, pictureUrl: reader.result as string })); };
    reader.readAsDataURL(file);
  }

  async function saveGeneral() {
    if (!currentHospitalId) return;
    if (!hospital.name?.trim()) { setMessage({ type: 'error', text: 'Hospital Name is required', source: 'general' }); return; }
    if (!hospital.addressLine1?.trim() || !hospital.city?.trim() || !hospital.state?.trim() || !hospital.postal?.trim() || !hospital.country?.trim()) {
      setMessage({ type: 'error', text: 'All address fields (except Line 2) are required', source: 'general' }); return;
    }
    setGeneralSaving(true);
    try {
      const res = await apiFetch(`/v1/hospitals/${currentHospitalId}`, { method: 'PATCH', body: JSON.stringify({
        name: hospital.name, phone: hospital.phone, email: hospital.email, website: hospital.website,
        addressLine1: hospital.addressLine1, addressLine2: hospital.addressLine2,
        city: hospital.city, state: hospital.state, postal: hospital.postal, country: hospital.country,
      })});
      if (res.ok) {
        setMessage({ type: 'success', text: 'Hospital information updated', source: 'general' });
        setGeneralEditMode(false);
        setOriginalHospital(hospital);
        refreshProfile();
      } else {
        const errBody = await res.json().catch(() => null);
        const errMsg = errBody?.message || `Failed to update (${res.status})`;
        setMessage({ type: 'error', text: Array.isArray(errMsg) ? errMsg[0] : errMsg, source: 'general' });
      }
    } catch (e: any) { setMessage({ type: 'error', text: e.message || 'Failed to update', source: 'general' }); }
    finally { setGeneralSaving(false); }
  }

  async function saveBillingAddress() {
    if (!currentHospitalId) return;
    const billingData = sameAsHospitalAddress
      ? { billingAddressLine1: hospital.addressLine1, billingAddressLine2: hospital.addressLine2, billingCity: hospital.city, billingState: hospital.state, billingPostal: hospital.postal, billingCountry: hospital.country }
      : { billingAddressLine1: hospital.billingAddressLine1, billingAddressLine2: hospital.billingAddressLine2, billingCity: hospital.billingCity, billingState: hospital.billingState, billingPostal: hospital.billingPostal, billingCountry: hospital.billingCountry };
    if (!billingData.billingAddressLine1?.trim() || !billingData.billingCity?.trim() || !billingData.billingState?.trim() || !billingData.billingPostal?.trim() || !billingData.billingCountry?.trim()) {
      setMessage({ type: 'error', text: 'All billing address fields are required', source: 'billing' }); return;
    }
    setBillingAddressSaving(true);
    try {
      const res = await apiFetch(`/v1/hospitals/${currentHospitalId}`, { method: 'PATCH', body: JSON.stringify(billingData) });
      if (res.ok) {
        if (sameAsHospitalAddress) setHospital(h => ({ ...h, ...billingData }));
        setMessage({ type: 'success', text: 'Billing address updated', source: 'billing' });
        setBillingAddressEditMode(false);
        setOriginalHospital(hospital);
      } else {
        const errBody = await res.json().catch(() => null);
        const errMsg = errBody?.message || `Failed to update (${res.status})`;
        setMessage({ type: 'error', text: Array.isArray(errMsg) ? errMsg[0] : errMsg, source: 'billing' });
      }
    } catch (e: any) { setMessage({ type: 'error', text: e.message || 'Failed to update', source: 'billing' }); }
    finally { setBillingAddressSaving(false); }
  }

  async function saveLegalCompliance() {
    if (!currentHospitalId) return;
    setLegalComplianceSaving(true);
    try {
      const res = await apiFetch(`/v1/hospitals/${currentHospitalId}`, { method: 'PATCH', body: JSON.stringify({
        legalEntityName: hospital.legalEntityName, taxIdType: hospital.taxIdType || undefined,
        taxIdValue: hospital.taxIdValue, billingContactEmail: hospital.billingContactEmail,
        storesPhi: hospital.storesPhi,
        estimatedPatientVolume: hospital.estimatedPatientVolume ? Number(hospital.estimatedPatientVolume) : undefined,
        dataRetentionDays: hospital.dataRetentionDays ? Number(hospital.dataRetentionDays) : undefined,
        insuranceProvider: hospital.insuranceProvider || undefined,
        insurancePolicyNumber: hospital.insurancePolicyNumber || undefined,
        accreditationBody: hospital.accreditationBody || undefined,
        accreditationNumber: hospital.accreditationNumber || undefined,
        accreditationExpiry: hospital.accreditationExpiry || undefined,
        licenseNumber: hospital.licenseNumber || undefined,
        licenseExpiry: hospital.licenseExpiry || undefined,
      })});
      if (res.ok) {
        setMessage({ type: 'success', text: 'Legal & compliance info updated', source: 'legal' });
        setLegalComplianceEditMode(false);
        setOriginalHospital(hospital);
      } else {
        const errBody = await res.json().catch(() => null);
        const errMsg = errBody?.message || `Failed to update (${res.status})`;
        setMessage({ type: 'error', text: Array.isArray(errMsg) ? errMsg[0] : errMsg, source: 'legal' });
      }
    } catch (e: any) { setMessage({ type: 'error', text: e.message || 'Failed to update', source: 'legal' }); }
    finally { setLegalComplianceSaving(false); }
  }

  async function saveOperatingHours() {
    if (!currentHospitalId) return;
    setHoursSaving(true);
    try {
      // Use ref to guarantee latest state (avoid stale closures)
      const h = hospitalRef.current;
      // Explicitly clean holiday data to ensure correct types
      const cleanHolidays = (h.hospitalHolidays || []).map(hol => ({
        month: Number(hol.month),
        day: Number(hol.day),
        name: String(hol.name || ''),
      }));
      const body: Record<string, unknown> = {};
      if (h.operatingHours) body.operatingHours = h.operatingHours;
      body.hospitalHolidays = cleanHolidays;
      const res = await apiFetch(`/v1/hospitals/${currentHospitalId}`, { method: 'PATCH', body: JSON.stringify(body) });
      if (res.ok) {
        const updated = await res.json();
        setMessage({ type: 'success', text: 'Operating hours updated', source: 'hours' });
        setHoursEditMode(false);
        setHospital(h => ({ ...h, operatingHours: updated.operatingHours, hospitalHolidays: updated.hospitalHolidays }));
        setOriginalHospital(h => ({ ...h, operatingHours: updated.operatingHours, hospitalHolidays: updated.hospitalHolidays }));
      } else {
        const errBody = await res.json().catch(() => null);
        const errMsg = errBody?.message || `Failed to update (${res.status})`;
        console.error('[saveOperatingHours] API error:', res.status, errBody);
        setMessage({ type: 'error', text: Array.isArray(errMsg) ? errMsg[0] : errMsg, source: 'hours' });
      }
    } catch (e: any) { console.error('[saveOperatingHours] error:', e); setMessage({ type: 'error', text: e.message || 'Failed to update', source: 'hours' }); }
    finally { setHoursSaving(false); }
  }

  async function saveClassification() {
    if (!currentHospitalId) return;
    if (!hospital.hospitalType) { setMessage({ type: 'error', text: 'Hospital Type is required', source: 'general' }); return; }
    if (selectedSpecialtyIds.length === 0) { setMessage({ type: 'error', text: 'At least one specialty is required', source: 'general' }); return; }
    setClassificationSaving(true);
    try {
      const res = await apiFetch(`/v1/hospitals/${currentHospitalId}`, { method: 'PATCH', body: JSON.stringify({ hospitalType: hospital.hospitalType, specialtyIds: selectedSpecialtyIds }) });
      if (res.ok) {
        const updated = await res.json();
        setMessage({ type: 'success', text: 'Classification updated', source: 'general' });
        setClassificationEditMode(false);
        setHospital(updated);
        setOriginalHospital(updated);
        setSelectedSpecialtyIds((updated.specialties || []).map((s: any) => s.id));
      } else {
        setMessage({ type: 'error', text: 'Failed to update', source: 'general' });
      }
    } catch { setMessage({ type: 'error', text: 'Failed to update', source: 'general' }); }
    finally { setClassificationSaving(false); }
  }

  async function saveHospitalInfoAll() {
    if (!currentHospitalId) return;
    if (!hospital.name?.trim()) { setMessage({ type: 'error', text: 'Hospital Name is required', source: 'general' }); return; }
    if (!hospital.addressLine1?.trim() || !hospital.city?.trim() || !hospital.state?.trim() || !hospital.postal?.trim() || !hospital.country?.trim()) {
      setMessage({ type: 'error', text: 'All address fields are required', source: 'general' }); return;
    }
    if (!hospital.hospitalType) { setMessage({ type: 'error', text: 'Hospital Type is required', source: 'general' }); return; }
    if (selectedSpecialtyIds.length === 0) { setMessage({ type: 'error', text: 'At least one specialty is required', source: 'general' }); return; }
    setGeneralSaving(true);
    try {
      const genBody: any = {
        name: hospital.name, phone: hospital.phone, email: hospital.email, website: hospital.website,
        addressLine1: hospital.addressLine1, addressLine2: hospital.addressLine2,
        city: hospital.city, state: hospital.state, postal: hospital.postal, country: hospital.country,
      };
      if (hospital.logoUrl && hospital.logoUrl !== originalHospital.logoUrl) genBody.logoUrl = hospital.logoUrl;
      if (hospital.pictureUrl && hospital.pictureUrl !== originalHospital.pictureUrl) genBody.pictureUrl = hospital.pictureUrl;
      const genRes = await apiFetch(`/v1/hospitals/${currentHospitalId}`, { method: 'PATCH', body: JSON.stringify(genBody) });
      if (!genRes.ok) { setMessage({ type: 'error', text: 'Failed to update hospital info', source: 'general' }); return; }
      const classRes = await apiFetch(`/v1/hospitals/${currentHospitalId}`, { method: 'PATCH', body: JSON.stringify({ hospitalType: hospital.hospitalType, specialtyIds: selectedSpecialtyIds })});
      if (!classRes.ok) { setMessage({ type: 'error', text: 'Failed to update classification', source: 'general' }); return; }
      const updated = await classRes.json();
      setMessage({ type: 'success', text: 'Hospital information updated', source: 'general' });
      setGeneralEditMode(false);
      setHospital(updated);
      setOriginalHospital(updated);
      setSelectedSpecialtyIds((updated.specialties || []).map((s: any) => s.id));
      refreshProfile();
    } catch { setMessage({ type: 'error', text: 'Failed to update', source: 'general' }); }
    finally { setGeneralSaving(false); }
  }

  const taxIdTypesByRegion: Record<string, { value: string; label: string }[]> = {
    US: [{ value: 'EIN', label: 'EIN (Employer Identification Number)' }, { value: 'NPI', label: 'NPI (National Provider Identifier)' }],
    IN: [{ value: 'GSTIN', label: 'GSTIN' }, { value: 'PAN', label: 'PAN' }, { value: 'TIN', label: 'TIN' }],
    UK: [{ value: 'UTR', label: 'UTR (Unique Taxpayer Reference)' }, { value: 'CRN', label: 'CRN (Company Registration Number)' }],
  };
  const availableTaxIdTypes = taxIdTypesByRegion[hospital.region || ''] || Object.values(taxIdTypesByRegion).flat();

  const hospitalTypeOptions = [
    { value: 'GENERAL', label: 'General Hospital' },
    { value: 'SPECIALTY', label: 'Specialty Hospital' },
    { value: 'TEACHING', label: 'Teaching Hospital' },
    { value: 'RESEARCH', label: 'Research Hospital' },
    { value: 'CLINIC', label: 'Clinic' },
    { value: 'URGENT_CARE', label: 'Urgent Care' },
    { value: 'REHABILITATION', label: 'Rehabilitation' },
    { value: 'PSYCHIATRIC', label: 'Psychiatric' },
    { value: 'CHILDREN', label: "Children's Hospital" },
    { value: 'GOVERNMENT', label: 'Government Hospital' },
  ];

  const staffTitleOptions = [
    'Receptionist',
    'Front Desk',
    'Office Manager',
    'Billing Coordinator',
    'Medical Assistant',
    'Nurse',
    'Lab Technician',
    'Pharmacist',
    'Administrative Assistant',
    'IT Support',
    'HR Manager',
    'Accounts',
    'Other',
  ];

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const fullName = `${profileForm.firstName} ${profileForm.lastName}`.trim();
      const res = await apiFetch('/v1/me', { method: 'PATCH', body: JSON.stringify({ fullName, phone: profileForm.phone }) });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Profile updated', source: 'profile' });
        setShowEditManagerModal(false);
        setEditingManager(null);
        refreshProfile();
      } else {
        setMessage({ type: 'error', text: 'Failed to update profile', source: 'profile' });
      }
    } catch { setMessage({ type: 'error', text: 'Failed to update profile', source: 'profile' }); }
    finally { setProfileSaving(false); }
  }

  async function saveStaff(e: React.FormEvent) {
    e.preventDefault();
    setStaffSaving(true);
    const assignedDoctorIds = staffAssignAll ? null : staffSelectedDoctorIds;
    const displayName = `${staffForm.firstName} ${staffForm.lastName}`.trim();
    try {
      const url = editingStaff ? `/v1/staff/${editingStaff.id}` : '/v1/staff';
      const body = editingStaff
        ? { displayName, title: staffForm.title || undefined, phone: staffForm.phone || undefined, assignedDoctorIds }
        : { email: staffForm.email, password: staffForm.password, displayName, title: staffForm.title || undefined, phone: staffForm.phone || undefined, assignedDoctorIds };
      const res = await apiFetch(url, { method: editingStaff ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      if (res.ok) {
        setShowStaffModal(false);
        setEditingStaff(null);
        setStaffForm({ email: '', password: '', firstName: '', lastName: '', title: '', phone: '' });
        setStaffAssignAll(true);
        setStaffSelectedDoctorIds([]);
        const r = await apiFetch('/v1/staff');
        if (r.ok) setStaff(await r.json());
        setMessage({ type: 'success', text: editingStaff ? 'Staff updated' : 'Staff created', source: 'staff' });
      } else {
        const err = await res.json();
        alert(err.message || 'Failed');
      }
    } catch { alert('Failed to save'); }
    finally { setStaffSaving(false); }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordResetStaff) return;
    setResettingPassword(true);
    try {
      const res = await apiFetch(`/v1/staff/${passwordResetStaff.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: resetPassword }),
      });
      if (res.ok) {
        setShowPasswordResetModal(false);
        setPasswordResetStaff(null);
        setResetPassword('');
        setMessage({ type: 'success', text: `Password reset for ${passwordResetStaff.displayName}`, source: 'staff' });
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to reset password');
      }
    } catch { alert('Failed to reset password'); }
    finally { setResettingPassword(false); }
  }

  function deleteStaff(id: string) {
    setConfirmDialog({
      title: 'Delete Staff Member',
      message: 'Are you sure you want to delete this staff member? This action cannot be undone.',
      destructive: true,
      onConfirm: async () => {
        await apiFetch(`/v1/staff/${id}`, { method: 'DELETE' });
        const r = await apiFetch('/v1/staff');
        if (r.ok) setStaff(await r.json());
      },
    });
  }

  async function toggleStaffStatus(s: StaffMember) {
    await apiFetch(`/v1/staff/${s.id}`, { method: 'PATCH', body: JSON.stringify({ status: s.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }) });
    const r = await apiFetch('/v1/staff');
    if (r.ok) setStaff(await r.json());
  }

  async function inviteDoctor(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await apiFetch('/v1/invites/create-doctor', { method: 'POST', body: JSON.stringify({ email: inviteEmail }) });
      if (res.ok) {
        setShowInviteModal(false);
        setInviteEmail('');
        const inv = await apiFetch('/v1/invites/pending');
        if (inv.ok) {
          const data = await inv.json();
          setPendingInvites(data.filter((i: Invite) => i.status === 'PENDING' && i.role === 'DOCTOR'));
        }
        setMessage({ type: 'success', text: 'Invite sent', source: 'doctors' });
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
    setShowDoctorEditModal(true);
    try {
      const res = await apiFetch(`/v1/doctors/${d.userId}/profile`);
      if (res.ok) {
        const p = await res.json();
        const nameParts = (d.fullName || '').split(' ').filter(Boolean);
        const firstPart = nameParts[0]?.replace(/^Dr\.?\s*/i, '') || '';
        setDoctorFormData({
          firstName: p.firstName || firstPart || '',
          lastName: p.lastName || nameParts.slice(1).join(' ') || '',
          phone: p.phone || d.phone || '',
          dateOfBirth: p.dateOfBirth || '',
          gender: p.gender || '',
          nationalId: p.nationalId || '',
          specialization: p.specialization || d.specialty || '',
          licenseNumber: p.licenseNumber || d.licenseNumber || '',
          department: p.department || '',
          qualification: p.qualification || '',
          yearsOfExperience: p.yearsOfExperience || '',
          consultationFee: p.consultationFee || '',
          employmentType: p.employmentType || '',
          education: p.education || '',
          bio: p.bio || '',
          addressLine1: p.addressLine1 || '',
          addressLine2: p.addressLine2 || '',
          city: p.city || '',
          state: p.state || '',
          postalCode: p.postalCode || '',
          country: p.country || '',
          emergencyContact: p.emergencyContact || '',
          emergencyPhone: p.emergencyPhone || '',
          emergencyRelation: p.emergencyRelation || '',
        });
      } else {
        const nameParts = (d.fullName || '').split(' ').filter(Boolean);
        setDoctorFormData({ firstName: nameParts[0] || '', lastName: nameParts.slice(1).join(' ') || '', phone: d.phone || '', specialization: d.specialty || '', licenseNumber: d.licenseNumber || '' });
      }
    } catch { setDoctorFormData({}); }
    finally { setDoctorEditLoading(false); }
  }

  async function saveDoctorEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDoctorId) return;
    setDoctorEditSaving(true);
    try {
      const fullName = `Dr ${doctorFormData.firstName?.trim() || ''} ${doctorFormData.lastName?.trim() || ''}`.trim();
      const res = await apiFetch(`/v1/doctors/${editingDoctorId}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName,
          phone: doctorFormData.phone || null,
          dateOfBirth: doctorFormData.dateOfBirth || null,
          gender: doctorFormData.gender || null,
          nationalId: doctorFormData.nationalId || null,
          specialization: doctorFormData.specialization || null,
          licenseNumber: doctorFormData.licenseNumber || null,
          department: doctorFormData.department || null,
          qualification: doctorFormData.qualification || null,
          yearsOfExperience: doctorFormData.yearsOfExperience ? Number(doctorFormData.yearsOfExperience) : null,
          consultationFee: doctorFormData.consultationFee ? Number(doctorFormData.consultationFee) : null,
          employmentType: doctorFormData.employmentType || null,
          education: doctorFormData.education || null,
          bio: doctorFormData.bio || null,
          addressLine1: doctorFormData.addressLine1 || null,
          addressLine2: doctorFormData.addressLine2 || null,
          city: doctorFormData.city || null,
          state: doctorFormData.state || null,
          postalCode: doctorFormData.postalCode || null,
          country: doctorFormData.country || null,
          emergencyContact: doctorFormData.emergencyContact || null,
          emergencyPhone: doctorFormData.emergencyPhone || null,
          emergencyRelation: doctorFormData.emergencyRelation || null,
        }),
      });
      if (res.ok) {
        setShowDoctorEditModal(false);
        setEditingDoctorId(null);
        const membersRes = await apiFetch('/v1/hospitals/members/compliance');
        if (membersRes.ok) {
          const m = await membersRes.json();
          setDoctors(m.filter((x: any) => x.role === 'DOCTOR'));
        }
        setMessage({ type: 'success', text: 'Doctor profile updated', source: 'doctors' });
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Failed to save');
      }
    } catch { alert('Failed to save'); }
    finally { setDoctorEditSaving(false); }
  }

  async function openDoctorScheduleModal(d: Doctor) {
    setScheduleDoctorId(d.userId);
    setScheduleDoctorName(d.fullName || d.email);
    setDoctorScheduleLoading(true);
    setShowDoctorScheduleModal(true);
    try {
      const res = await apiFetch(`/v1/doctors/${d.userId}/schedules`);
      if (res.ok) {
        const data = await res.json();
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
    } catch {
      setDoctorSchedule(DAYS_OF_WEEK.map((_, idx) => ({ dayOfWeek: idx, isWorking: idx >= 1 && idx <= 5, morningShift: idx >= 1 && idx <= 5, eveningShift: false, nightShift: false })));
    } finally { setDoctorScheduleLoading(false); }
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

  async function saveDoctorSchedule() {
    if (!scheduleDoctorId) return;
    setDoctorScheduleSaving(true);
    try {
      const schedulesToSave = doctorSchedule.map(day => {
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
      const res = await apiFetch(`/v1/doctors/${scheduleDoctorId}/schedules`, {
        method: 'PATCH',
        body: JSON.stringify({ schedules: schedulesToSave }),
      });
      if (res.ok) {
        setShowDoctorScheduleModal(false);
        setScheduleDoctorId(null);
        setMessage({ type: 'success', text: 'Schedule updated', source: 'doctors' });
      } else {
        alert('Failed to save schedule');
      }
    } catch { alert('Failed to save schedule'); }
    finally { setDoctorScheduleSaving(false); }
  }

  function openRevokeLicenseModal(d: Doctor) {
    const doctorLicenses = licenses.filter(l => l.doctorId === d.userId && l.status === 'ACTIVE');
    setRevokeDoctorName(d.fullName || d.email);
    setRevokeDoctorLicenses(doctorLicenses);
    setRevokingLicenseId(null);
    setShowRevokeLicenseModal(true);
  }

  async function handleRevokeLicense(licenseId: string) {
    setRevokingLicenseId(licenseId);
    try {
      const res = await apiFetch(`/v1/products/licenses/${licenseId}`, { method: 'DELETE' });
      if (res.ok) {
        setRevokeDoctorLicenses(prev => prev.filter(l => l.id !== licenseId));
        const [statsRes, licRes] = await Promise.all([
          apiFetch('/v1/products/subscription/license-stats'),
          apiFetch('/v1/products/licenses'),
        ]);
        if (statsRes.ok) setLicenseStats(await statsRes.json());
        if (licRes.ok) setLicenses(await licRes.json());
        setMessage({ type: 'success', text: 'License revoked', source: 'doctors' });
        if (revokeDoctorLicenses.length <= 1) setShowRevokeLicenseModal(false);
      } else {
        alert('Failed to revoke license');
      }
    } catch { alert('Failed to revoke license'); }
    finally { setRevokingLicenseId(null); }
  }

  async function inviteManager(e: React.FormEvent) {
    e.preventDefault();
    setInvitingManager(true);
    try {
      const res = await apiFetch('/v1/invites/create-manager', { method: 'POST', body: JSON.stringify({ hospitalId: currentHospitalId, email: inviteManagerEmail }) });
      if (res.ok) {
        setShowInviteManagerModal(false);
        setInviteManagerEmail('');
        const inv = await apiFetch('/v1/invites/pending');
        if (inv.ok) {
          const data = await inv.json();
          setPendingManagerInvites(data.filter((i: Invite) => i.status === 'PENDING' && i.role === 'HOSPITAL_MANAGER'));
        }
        setMessage({ type: 'success', text: 'Manager invite sent', source: 'profile' });
      } else {
        const err = await res.json().catch(() => null);
        setMessage({ type: 'error', text: err?.message || 'Failed to send invite', source: 'profile' });
      }
    } catch { setMessage({ type: 'error', text: 'Failed to send invite', source: 'profile' }); }
    finally { setInvitingManager(false); }
  }

  function revokeManagerInvite(id: string) {
    setConfirmDialog({
      title: 'Revoke Manager Invite',
      message: 'Are you sure you want to revoke this manager invitation?',
      destructive: true,
      onConfirm: async () => {
        await apiFetch(`/v1/invites/${id}`, { method: 'DELETE' });
        const inv = await apiFetch('/v1/invites/pending');
        if (inv.ok) {
          const data = await inv.json();
          setPendingManagerInvites(data.filter((i: Invite) => i.status === 'PENDING' && i.role === 'HOSPITAL_MANAGER'));
        }
      },
    });
  }

  function revokeInvite(id: string) {
    setConfirmDialog({
      title: 'Revoke Invite',
      message: 'Are you sure you want to revoke this invitation?',
      destructive: true,
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

  async function assignLicense(e: React.FormEvent) {
    e.preventDefault();
    setAssigning(true);
    try {
      const res = await apiFetch('/v1/products/licenses/assign', { method: 'POST', body: JSON.stringify(assignForm) });
      if (res.ok) {
        setShowAssignModal(false);
        setAssignForm({ doctorId: '', productCode: 'APPOINTMENTS' });
        const [statsRes, licRes] = await Promise.all([
          apiFetch('/v1/products/subscription/license-stats'),
          apiFetch('/v1/products/licenses'),
        ]);
        if (statsRes.ok) setLicenseStats(await statsRes.json());
        if (licRes.ok) setLicenses(await licRes.json());
        setMessage({ type: 'success', text: 'License assigned', source: 'license' });
      } else {
        const err = await res.json();
        alert(err.message || 'Failed');
      }
    } catch { alert('Failed'); }
    finally { setAssigning(false); }
  }

  function revokeLicense(id: string) {
    setConfirmDialog({
      title: 'Revoke License',
      message: 'Are you sure you want to revoke this license? The doctor will lose access to this product.',
      destructive: true,
      onConfirm: async () => {
        await apiFetch(`/v1/products/licenses/${id}`, { method: 'DELETE' });
        const [statsRes, licRes] = await Promise.all([
          apiFetch('/v1/products/subscription/license-stats'),
          apiFetch('/v1/products/licenses'),
        ]);
        if (statsRes.ok) setLicenseStats(await statsRes.json());
        if (licRes.ok) setLicenses(await licRes.json());
      },
    });
  }

  function cancelSubscription() {
    setConfirmDialog({
      title: 'Cancel Subscription',
      message: 'Are you sure you want to cancel your subscription? Your access will continue until the end of the current billing period.',
      destructive: true,
      onConfirm: async () => {
        try {
          const res = await apiFetch('/v1/products/subscription/cancel', { method: 'POST' });
          if (res.ok) {
            setMessage({ type: 'success', text: 'Subscription cancelled', source: 'billing' });
            const subRes = await apiFetch('/v1/products/subscription');
            if (subRes.ok) setSubscription(await subRes.json());
            else setSubscription(null);
          } else {
            setMessage({ type: 'error', text: 'Failed to cancel subscription', source: 'billing' });
          }
        } catch {
          setMessage({ type: 'error', text: 'Failed to cancel subscription', source: 'billing' });
        }
      },
    });
  }

  async function savePatient(e: React.FormEvent) {
    e.preventDefault();
    setPatientSaving(true);
    try {
      const url = editingPatient ? `/v1/patients/${editingPatient.id}` : '/v1/patients';
      const res = await apiFetch(url, { method: editingPatient ? 'PATCH' : 'POST', body: JSON.stringify(patientForm) });
      if (res.ok) {
        setShowPatientModal(false);
        setEditingPatient(null);
        setPatientForm({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '' });
        const r = await apiFetch('/v1/patients');
        if (r.ok) setPatients(await r.json());
        setMessage({ type: 'success', text: editingPatient ? 'Patient updated' : 'Patient created', source: 'patients' });
      } else {
        const err = await res.json();
        alert(err.message || 'Failed');
      }
    } catch { alert('Failed to save'); }
    finally { setPatientSaving(false); }
  }

  async function togglePatientStatus(p: Patient) {
    await apiFetch(`/v1/patients/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status: p.status === 'active' ? 'inactive' : 'active' }) });
    const r = await apiFetch('/v1/patients');
    if (r.ok) setPatients(await r.json());
  }

  // ─── COMPUTED ────────────────────────────────────────────────────────────────
  const activeStaff = staff.filter(s => s.status === 'ACTIVE').length;
  const activeDoctors = doctors.filter(d => d.complianceStatus === 'compliant' || !d.complianceStatus).length;
  const availableDoctorsForLicense = doctors.filter(d => !licenses.some(l => l.doctorId === d.userId && l.productCode === assignForm.productCode && l.status === 'ACTIVE'));
  const activePatients = patients.filter(p => p.status === 'active').length;
  const filteredPatients = patients.filter(p => {
    const name = `${p.firstName} ${p.lastName}`.toLowerCase();
    return name.includes(patientSearch.toLowerCase()) || p.email?.toLowerCase().includes(patientSearch.toLowerCase()) || p.phone?.includes(patientSearch);
  });

  function fmt(amt: number, cur = 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(amt);
  }

  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
  const DAY_LABELS: Record<string, string> = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
  const defaultHours: Record<string, { open: string; close: string; closed: boolean }> = {
    monday: { open: '08:00', close: '17:00', closed: false }, tuesday: { open: '08:00', close: '17:00', closed: false },
    wednesday: { open: '08:00', close: '17:00', closed: false }, thursday: { open: '08:00', close: '17:00', closed: false },
    friday: { open: '08:00', close: '17:00', closed: false }, saturday: { open: '09:00', close: '13:00', closed: false },
    sunday: { open: '', close: '', closed: true },
  };
  function fmtTime(t: string) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  const hours = hospital.operatingHours || defaultHours;
  function setDayHours(day: string, field: string, val: string | boolean) {
    const h = { ...(hospital.operatingHours || defaultHours) };
    h[day] = { ...h[day], [field]: val };
    if (field === 'closed' && val === true) { h[day].open = ''; h[day].close = ''; }
    setHospital({ ...hospital, operatingHours: h });
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const DEFAULT_INDIAN_HOLIDAYS: { month: number; day: number; name: string }[] = [
    { month: 1, day: 1, name: 'New Year\'s Day' },
    { month: 1, day: 26, name: 'Republic Day' },
    { month: 3, day: 29, name: 'Holi' },
    { month: 4, day: 14, name: 'Ambedkar Jayanti' },
    { month: 5, day: 1, name: 'May Day' },
    { month: 8, day: 15, name: 'Independence Day' },
    { month: 10, day: 2, name: 'Gandhi Jayanti' },
    { month: 10, day: 24, name: 'Dussehra' },
    { month: 11, day: 1, name: 'Diwali' },
    { month: 12, day: 25, name: 'Christmas Day' },
  ];

  const holidays = hospital.hospitalHolidays || [];
  function getHolidaysForMonth(m: number) { return holidays.filter(h => h.month === m); }
  function addHoliday(month: number, day: number, name: string) {
    setHospital(h => {
      const current = h.hospitalHolidays || [];
      const updated = [...current, { month, day, name }].sort((a, b) => a.month - b.month || a.day - b.day);
      return { ...h, hospitalHolidays: updated };
    });
  }
  function removeHoliday(month: number, day: number, name: string) {
    setHospital(h => {
      const current = h.hospitalHolidays || [];
      const updated = current.filter(hol => !(hol.month === month && hol.day === day && hol.name === name));
      return { ...h, hospitalHolidays: updated };
    });
  }
  function initDefaultHolidays() {
    setHospital(h => ({ ...h, hospitalHolidays: [...DEFAULT_INDIAN_HOLIDAYS] }));
  }

  function markdownToHtml(md: string): string {
    return md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:600;margin:16px 0 8px;">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 style="font-size:16px;font-weight:600;margin:20px 0 8px;">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 style="font-size:18px;font-weight:700;margin:24px 0 10px;">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li style="margin-left:20px;list-style:disc;">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li style="margin-left:20px;list-style:decimal;">$2</li>')
      .replace(/\n{2,}/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
  }

  function downloadDocAsPdf(doc: any) {
    const html = markdownToHtml(doc.contentMarkdown);
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${doc.docTitle}</title><style>
      body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:20px 40px;color:#1a1a1a;line-height:1.7;font-size:12px;}
      h1{font-size:18px;border-bottom:1px solid #ccc;padding-bottom:8px;}
      h2{font-size:16px;} h3{font-size:14px;}
      .meta{color:#666;font-size:10px;margin-bottom:20px;border-bottom:1px solid #eee;padding-bottom:10px;}
      @media print{body{margin:0;padding:20px;}}
    </style></head><body>
      <h1>${doc.docTitle}</h1>
      <div class="meta">Version ${doc.version} &middot; Signed by ${doc.signerName} on ${new Date(doc.acceptedAt).toLocaleDateString()}</div>
      ${html}
    </body></html>`;
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(fullHtml);
      w.document.close();
      setTimeout(() => w.print(), 300);
    }
  }

  // Consistent form field styles — prevents layout shift between view/edit modes
  const fieldClass = (editing: boolean) =>
    `w-full px-1.5 py-0.5 text-[11px] border border-slate-200 rounded ${editing ? 'bg-white focus:outline-none focus:ring-1 focus:ring-navy-500' : 'bg-slate-50 text-slate-700 cursor-default'}`;
  const selectFieldClass = (editing: boolean) =>
    `w-full px-1.5 py-0.5 text-[11px] border border-slate-200 rounded ${editing ? 'bg-white focus:outline-none focus:ring-1 focus:ring-navy-500' : 'bg-slate-50 text-slate-700 cursor-default opacity-100'}`;
  const cardMsg = (source: string) => message?.source === source ? (
    <span className={`text-[9px] px-1.5 py-0.5 rounded ${message.type === 'success' ? 'bg-sky-400/20 text-sky-100' : 'bg-red-400/20 text-red-200'}`}>{message.text}</span>
  ) : null;

  const InfoRow = ({ label, value }: { label: string; value?: string | number | null }) => (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-slate-900 text-[10px] shrink-0">{label}</span>
      {!dataLoaded ? (
        <span className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
      ) : (
        <span className="text-slate-700 font-medium text-right truncate">{value || '—'}</span>
      )}
    </div>
  );

  // Placeholder rows for tables while loading — keeps table height stable
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

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  const countBadge = (n: number, active: boolean) => (
    <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold ${active ? 'bg-[#1e3a5f]/10 text-[#1e3a5f]' : 'bg-slate-200/70 text-slate-500'}`}>{n}</span>
  );
  const tabs: { id: TabType; label: string; count?: number; renderLabel?: (active: boolean) => React.ReactNode }[] = [
    { id: 'details', label: 'Hospital Details' },
    { id: 'manager', label: 'Hospital Managers & Staff', renderLabel: (active) => (<>Hospital Managers {countBadge(managers.length, active)} &amp; Staff {countBadge(staff.length, active)}</>) },
    { id: 'doctors', label: 'Doctors', count: doctors.length },
    { id: 'patients', label: 'Patients', count: patients.length },
  ];

  return (
    <div className="page-fullheight flex flex-col overflow-auto lg:overflow-hidden p-2 gap-1">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-sm font-semibold text-slate-800">Hospital Administration</h1>
        <p className="text-[10px] text-slate-400">Manage hospital details, billing, subscriptions, hospital manager settings, staff, doctors &amp; patients</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-2 text-[10px] sm:text-[11px] font-semibold transition-all text-center border-b-2 -mb-px ${
              activeTab === t.id
                ? 'border-[#1e3a5f] text-[#1e3a5f]'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {t.renderLabel ? t.renderLabel(activeTab === t.id) : t.label}
            {t.count !== undefined && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold ${activeTab === t.id ? 'bg-[#1e3a5f]/10 text-[#1e3a5f]' : 'bg-slate-200/70 text-slate-500'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* HOSPITAL DETAILS TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'details' && (
        <div className="flex-1 lg:min-h-0 grid grid-cols-1 lg:grid-cols-3 lg:grid-rows-2 gap-2">

          {/* ── Card 1: Hospital Information (compact) ── */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col lg:min-h-0">
            <div className="flex items-center justify-between px-2 py-1.5 bg-[#f0f7ff] shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold text-slate-800">Hospital Information</h3>
                {cardMsg('general')}
              </div>
              {canEditSettings && (
                <button onClick={() => setGeneralEditMode(true)} className="px-2 py-0.5 text-[10px] text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d] flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  Edit
                </button>
              )}
            </div>
            <div className="flex-1 lg:min-h-0 lg:overflow-auto p-2 text-[11px]">
              <InfoRow label="Name" value={hospital.name} />
              <InfoRow label="Type" value={hospitalTypeOptions.find(t => t.value === hospital.hospitalType)?.label || hospital.hospitalType} />
              <InfoRow label="Phone" value={hospital.phone} />
              <InfoRow label="Email" value={hospital.email} />
              <InfoRow label="Website" value={hospital.website} />
              <InfoRow label="Specialties" value={(hospital.specialties || []).map(s => s.name).join(', ')} />
              <div className="border-t border-slate-100 pt-1 mt-1">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Address</p>
                <InfoRow label="Street" value={hospital.addressLine1} />
                {hospital.addressLine2 && <InfoRow label="Line 2" value={hospital.addressLine2} />}
                <InfoRow label="City" value={hospital.city} />
                <div className="flex justify-between gap-2 py-0.5">
                  <span className="text-slate-900 text-[10px] shrink-0">State / Postal</span>
                  <span className="text-slate-700 font-medium text-right truncate text-[11px]">{getStatesForCountry(hospital.country || '').find(s => s.code === hospital.state)?.name || hospital.state || '—'}{hospital.postal ? `, ${hospital.postal}` : ''}</span>
                </div>
                <InfoRow label="Country" value={COUNTRIES.find(c => c.code === hospital.country)?.name || hospital.country} />
              </div>
            </div>
          </div>

          {/* ── Card 2: Billing & Subscriptions ── */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col lg:min-h-0">
            <div className="flex items-center justify-between px-2 py-1.5 bg-[#f0f7ff] shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold text-slate-800">CLINIQ FLOW Billing & Subscriptions</h3>
                {cardMsg('billing')}
              </div>
              {canEditSettings && (
                <button onClick={() => setBillingAddressEditMode(true)} className="px-2 py-0.5 text-[10px] text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d] flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  Edit
                </button>
              )}
            </div>
            <div className="flex-1 lg:min-h-0 lg:overflow-auto p-2 text-[11px]">
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Billing Address</p>
              {sameAsHospitalAddress && <span className="text-[9px] text-[#5a8a4f] font-medium block mb-0.5">Same as hospital address</span>}
              <InfoRow label="Street" value={hospital.billingAddressLine1} />
              {hospital.billingAddressLine2 && <InfoRow label="Line 2" value={hospital.billingAddressLine2} />}
              <InfoRow label="City" value={hospital.billingCity} />
              <div className="flex justify-between gap-2 py-0.5">
                <span className="text-slate-900 text-[10px] shrink-0">State / Postal</span>
                <span className="text-slate-700 font-medium text-right truncate text-[11px]">{getStatesForCountry(hospital.billingCountry || '').find(s => s.code === hospital.billingState)?.name || hospital.billingState || '—'}{hospital.billingPostal ? `, ${hospital.billingPostal}` : ''}</span>
              </div>
              <InfoRow label="Country" value={COUNTRIES.find(c => c.code === hospital.billingCountry)?.name || hospital.billingCountry} />

              <div className="border-t border-slate-100 pt-1 mt-1">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Subscription</p>
                  {subscription && <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${subscription.status === 'ACTIVE' ? 'bg-[#f0f7eb] text-[#4d7c43]' : subscription.status === 'TRIAL' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{subscription.status}</span>}
                </div>
                {!dataLoaded ? (
                  <div className="space-y-1">
                    {['Started', 'Next Billing', 'Plan'].map(l => (
                      <div key={l} className="flex justify-between gap-2 py-0.5">
                        <span className="text-slate-900 text-[10px] shrink-0">{l}</span>
                        <span className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : subscription ? (
                  <>
                    <InfoRow label="Started" value={new Date(subscription.billingCycleStart).toLocaleDateString()} />
                    <InfoRow label="Next Billing" value={new Date(subscription.billingCycleEnd).toLocaleDateString()} />
                    {subscription.trialEndsAt && <InfoRow label="Trial Ends" value={new Date(subscription.trialEndsAt).toLocaleDateString()} />}
                    {subscription.cancelledAt && <InfoRow label="Cancelled" value={new Date(subscription.cancelledAt).toLocaleDateString()} />}
                    <div className="mt-1 pt-1 border-t border-slate-100">
                      {subscription.items.map(item => (
                        <div key={item.productCode} className="flex items-center justify-between py-0.5">
                          <span className="text-slate-600">CLINIQ FLOW {item.productName} <span className="text-slate-400">({item.doctorLimit} licenses)</span></span>
                          <span className="font-medium text-slate-700">{fmt(item.monthlyTotal, item.currency)}/mo</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 font-medium">
                        <span className="text-slate-600">Total</span>
                        <span className="text-slate-800">{fmt(subscription.totalMonthly)}/mo</span>
                      </div>
                    </div>
                    {subscription.status !== 'CANCELLED' && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={cancelSubscription} className="px-2 py-1 text-[9px] font-medium text-red-600 bg-red-50 rounded hover:bg-red-100">Cancel Subscription</button>
                      </div>
                    )}
                  </>
                ) : <p className="text-slate-400 py-0.5">No active subscription</p>}
              </div>
            </div>
          </div>

          {/* ── Card 3: Legal, Tax & Compliance ── */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden lg:row-span-2 flex flex-col lg:min-h-0">
            <div className="flex items-center justify-between px-2 py-1.5 bg-[#f0f7ff] shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold text-slate-800">Legal, Tax & Compliance</h3>
                {cardMsg('legal')}
              </div>
              {canEditSettings && (
                <button onClick={() => setLegalComplianceEditMode(true)} className="px-2 py-0.5 text-[10px] text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d] flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  Edit
                </button>
              )}
            </div>
            <div className="flex-1 lg:min-h-0 lg:overflow-auto p-2 text-[11px]">
              {signedDocs.length > 0 && (
                <div className="mb-1 pb-1 border-b border-slate-100">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Signed Documents</p>
                  <div className="space-y-0.5">
                    {signedDocs.map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between py-0.5">
                        <div className="truncate">
                          <span className="text-slate-700">{doc.docTitle}</span>
                          <span className="text-slate-400 ml-1">({doc.version})</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-slate-400 text-[9px]">{new Date(doc.acceptedAt).toLocaleDateString()}</span>
                          <button onClick={() => setViewingDoc(doc)} className="text-[9px] text-[#1e3a5f] hover:underline">View</button>
                          <button onClick={() => downloadDocAsPdf(doc)} className="text-[#1e3a5f] hover:text-[#162f4d]" title="Download as PDF">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <InfoRow label="Legal Entity" value={hospital.legalEntityName} />
              <InfoRow label="Billing Contact" value={hospital.billingContactEmail} />
              <InfoRow label="Tax ID Type" value={availableTaxIdTypes.find(t => t.value === hospital.taxIdType)?.label || hospital.taxIdType} />
              <InfoRow label="Tax ID Value" value={hospital.taxIdValue} />
              <div className="border-t border-slate-100 pt-1 mt-1">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Compliance</p>
                <InfoRow label="Stores PHI" value={hospital.storesPhi ? 'Yes' : 'No'} />
                <InfoRow label="Data Retention" value={hospital.dataRetentionDays ? `${hospital.dataRetentionDays} days` : undefined} />
              </div>
              <div className="border-t border-slate-100 pt-1 mt-1">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Insurance</p>
                <InfoRow label="Provider" value={hospital.insuranceProvider} />
                <InfoRow label="Policy Number" value={hospital.insurancePolicyNumber} />
              </div>
              <div className="border-t border-slate-100 pt-1 mt-1">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Accreditation</p>
                <InfoRow label="Body" value={hospital.accreditationBody} />
                <InfoRow label="Number" value={hospital.accreditationNumber} />
                <InfoRow label="Expiry" value={hospital.accreditationExpiry ? new Date(hospital.accreditationExpiry).toLocaleDateString() : undefined} />
              </div>
              <div className="border-t border-slate-100 pt-1 mt-1">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Hospital License</p>
                <InfoRow label="License No." value={hospital.licenseNumber} />
                <InfoRow label="Expiry" value={hospital.licenseExpiry ? new Date(hospital.licenseExpiry).toLocaleDateString() : undefined} />
              </div>
            </div>
          </div>

          {/* ── Card 4: Operating Hours ── */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col lg:min-h-0">
            <div className="flex items-center justify-between px-2 py-1.5 bg-[#f0f7ff] shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold text-slate-800">Hospital Operating Days & Hours</h3>
                {cardMsg('hours')}
              </div>
              {canEditSettings && (
                <button onClick={() => { setHospital(h => h.operatingHours ? h : { ...h, operatingHours: defaultHours }); setHolidayMonth(new Date().getMonth() + 1); setHoursEditMode(true); }} className="px-2 py-0.5 text-[10px] text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d] flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  Edit
                </button>
              )}
            </div>
            <div className="flex-1 lg:min-h-0 lg:overflow-auto p-2 text-[11px]">
              {DAYS.map(day => {
                const d = hours[day] || { open: '', close: '', closed: true };
                return (
                  <div key={day} className="flex items-center justify-between py-0.5">
                    <span className="text-slate-900 text-[10px] w-8 shrink-0">{DAY_LABELS[day]}</span>
                    <span className={`text-[10px] ${d.closed ? 'text-red-400' : 'text-slate-600'}`}>
                      {d.closed ? 'Closed' : `${fmtTime(d.open)} - ${fmtTime(d.close)}`}
                    </span>
                  </div>
                );
              })}

              {/* Hospital Holidays — 6x2 Month Grid */}
              <div className="border-t border-slate-100 pt-1.5 mt-1.5">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Hospital Holidays ({holidays.length})</p>
                <div className="grid grid-cols-6 gap-1 overflow-visible relative">
                  {MONTHS.map((m, i) => {
                    const mHolidays = getHolidaysForMonth(i + 1);
                    const col = i % 6;
                    const tooltipAlign = col <= 1 ? 'left-0' : col >= 4 ? 'right-0' : 'left-1/2 -translate-x-1/2';
                    const arrowAlign = col <= 1 ? 'left-3' : col >= 4 ? 'right-3' : 'left-1/2 -translate-x-1/2';
                    return (
                      <div key={m} className="group relative flex items-center justify-between px-1.5 py-1 rounded border border-slate-100 text-left cursor-default">
                        <span className="text-[9px] font-medium text-slate-700">{m}</span>
                        <span className={`text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center ${mHolidays.length > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}`}>{mHolidays.length}</span>
                        {mHolidays.length > 0 && (
                          <div className={`hidden group-hover:block absolute bottom-full ${tooltipAlign} mb-1 z-50 bg-slate-800 text-white rounded-md shadow-lg px-2 py-1.5 min-w-[120px] whitespace-nowrap`}>
                            <div className={`absolute top-full ${arrowAlign} w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800`} />
                            <p className="text-[9px] font-semibold mb-0.5 text-slate-300">{m} Holidays</p>
                            {mHolidays.map((h, idx) => (
                              <div key={idx} className="text-[9px] leading-relaxed">
                                <span className="text-amber-300 font-medium">{h.day}</span> — {h.name}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── Card 5: License Management ── */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col lg:min-h-0">
            <div className="flex items-center justify-between px-2 py-1.5 bg-[#f0f7ff] shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold text-slate-800">CLINIQ FLOW Licenses</h3>
                {cardMsg('license')}
              </div>
              {canEditSettings && subscription && (
                <button onClick={() => setShowAssignModal(true)} className="px-2 py-0.5 text-[10px] text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d] flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Assign
                </button>
              )}
            </div>
            <div className="flex-1 lg:min-h-0 lg:overflow-auto p-2 text-[11px]">
              {!dataLoaded ? (
                <div className="space-y-2 animate-pulse">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1">License Usage</p>
                  <div className="space-y-1.5">
                    <div className="h-3 bg-slate-100 rounded w-3/4" />
                    <div className="w-full bg-slate-100 rounded-full h-1.5" />
                  </div>
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mt-2 mb-0.5">Active Licenses</p>
                  <div className="h-3 bg-slate-100 rounded w-full" />
                  <div className="h-3 bg-slate-100 rounded w-2/3" />
                </div>
              ) : licenseStats && licenseStats.byProduct.length > 0 ? (
                <>
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1">License Usage</p>
                  {licenseStats.byProduct.map(p => (
                    <div key={p.productCode} className="mb-1.5">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-slate-600">{p.productName}</span>
                        <span className="text-slate-500 text-[9px]">{p.usedLicenses}/{p.totalLicenses}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div className="bg-[#1e3a5f] h-1.5 rounded-full transition-all" style={{ width: `${p.totalLicenses > 0 ? (p.usedLicenses / p.totalLicenses) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-slate-400 py-0.5">No license data available</p>
              )}
              {licenses.filter(l => l.status === 'ACTIVE').length > 0 && (
                <div className="border-t border-slate-100 pt-1 mt-1">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Active Licenses</p>
                  <div className="space-y-0.5">
                    {licenses.filter(l => l.status === 'ACTIVE').map(l => (
                      <div key={l.id} className="flex items-center justify-between py-0.5">
                        <div className="truncate">
                          <span className="text-slate-700">Dr. {l.doctorName || l.doctorEmail}</span>
                          <span className="text-slate-400 ml-1 text-[9px]">{l.productName}</span>
                        </div>
                        <button onClick={() => revokeLicense(l.id)} className="text-[9px] text-red-500 hover:text-red-700 shrink-0 ml-2">Revoke License</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* HOSPITAL MANAGERS & STAFF TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'manager' && (
        <div className="flex-1 lg:min-h-0 lg:overflow-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {/* Hospital Managers Table */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-2 py-1.5 bg-[#f0f7ff] shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[11px] font-semibold text-slate-800">Hospital Managers</h3>
                  <span className="px-1.5 py-0.5 bg-[#ecf5e7] text-[#4d7c43] text-[9px] font-medium rounded">{managers.filter(m => m.status === 'ACTIVE').length} active</span>
                  {cardMsg('profile')}
                </div>
                <button onClick={() => { setInviteManagerEmail(''); setInviteManagerFirstName(''); setInviteManagerLastName(''); setShowInviteManagerModal(true); }} className="px-2 py-1 text-[10px] font-medium text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d]">+ Invite Hospital Manager</button>
              </div>
              <div className="flex-1 lg:overflow-auto">
                {!dataLoaded ? (
                  <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Name</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Status</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-medium text-slate-500">Actions</th>
                      </tr>
                    </thead>
                    <TableSkeleton cols={3} rows={2} />
                  </table>
                  </div>
                ) : (managers.length > 0 || pendingManagerInvites.length > 0) ? (
                  <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Name</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Status</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-medium text-slate-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {managers.map(m => (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-slate-700">{m.fullName || '—'}</span>
                              {m.isPrimary && <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[9px] font-medium rounded">Primary</span>}
                            </div>
                            <div className="text-[10px] text-slate-400">{m.email}</div>
                          </td>
                          <td className="px-3 py-1.5"><span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${m.status === 'ACTIVE' ? 'bg-[#f0f7eb] text-[#4d7c43]' : 'bg-slate-100 text-slate-500'}`}>{m.status}</span></td>
                          <td className="px-3 py-1.5 text-right">
                            <button onClick={() => { setEditingManager(m); const nameParts = (m.fullName || '').split(' '); setProfileForm({ firstName: nameParts[0] || '', lastName: nameParts.slice(1).join(' ') || '', phone: '' }); setShowEditManagerModal(true); }} className="px-2 py-0.5 text-[10px] font-medium text-navy-600 border border-navy-200 rounded hover:bg-navy-50">Edit</button>
                          </td>
                        </tr>
                      ))}
                      {pendingManagerInvites.map(inv => (
                        <tr key={inv.id} className="hover:bg-amber-50/30 bg-amber-50/20">
                          <td className="px-3 py-1.5">
                            <div className="font-medium text-slate-500">{inv.invitedEmail}</div>
                          </td>
                          <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 text-amber-700">PENDING INVITE</span></td>
                          <td className="px-3 py-1.5 text-right">
                            <button onClick={() => revokeManagerInvite(inv.id)} className="px-2 py-0.5 text-[10px] font-medium text-red-600 border border-red-200 rounded hover:bg-red-50">Revoke Invite</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                ) : (
                  <div className="py-6 text-center text-slate-400 text-xs">No hospital managers found</div>
                )}
              </div>
            </div>

            {/* Staff Members Table */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-2 py-1.5 bg-[#f0f7ff] shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[11px] font-semibold text-slate-800">Staff Members</h3>
                  <span className="px-1.5 py-0.5 bg-[#ecf5e7] text-[#4d7c43] text-[9px] font-medium rounded">{activeStaff} active</span>
                  {cardMsg('staff')}
                </div>
                <button onClick={() => { setEditingStaff(null); setStaffForm({ email: '', password: '', firstName: '', lastName: '', title: '', phone: '' }); setStaffAssignAll(true); setStaffSelectedDoctorIds([]); setShowStaffModal(true); }} className="px-2 py-1 text-[10px] font-medium text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d]">+ Invite Staff</button>
              </div>
              <div className="flex-1 lg:overflow-auto">
                {!dataLoaded ? (
                  <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Name</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Doctors</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Status</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-medium text-slate-500">Actions</th>
                      </tr>
                    </thead>
                    <TableSkeleton cols={4} rows={3} />
                  </table>
                  </div>
                ) : staff.length > 0 ? (
                  <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Name</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Doctors</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Status</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-medium text-slate-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {staff.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5">
                            <div className="font-medium text-slate-700">{s.displayName}</div>
                            <div className="text-[10px] text-slate-400">{s.email}</div>
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="relative group inline-block">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-700 cursor-default">
                                {!s.assignedDoctorIds || s.assignedDoctorIds.length === 0 ? 'All' : `${s.assignedDoctorIds.length}`}
                              </span>
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-50 pointer-events-none">
                                <div className="bg-slate-800 text-white text-[10px] rounded-md px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                                  {!s.assignedDoctorIds || s.assignedDoctorIds.length === 0
                                    ? 'Assigned to all doctors'
                                    : s.assignedDoctorIds.map(id => { const doc = doctors.find(d => d.userId === id); return doc ? `Dr. ${doc.fullName || doc.email}` : id; }).join(', ')}
                                </div>
                                <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-slate-800 rotate-45" />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-1.5"><span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${s.status === 'ACTIVE' ? 'bg-[#f0f7eb] text-[#4d7c43]' : 'bg-slate-100 text-slate-500'}`}>{s.status}</span></td>
                          <td className="px-3 py-1.5 text-right whitespace-nowrap">
                            <button onClick={() => { setEditingStaff(s); const nameParts = (s.displayName || '').split(' '); const firstName = nameParts[0] || ''; const lastName = nameParts.slice(1).join(' ') || ''; setStaffForm({ email: s.email, password: '', firstName, lastName, title: s.title || '', phone: s.phone || '' }); if (s.assignedDoctorIds && s.assignedDoctorIds.length > 0) { setStaffAssignAll(false); setStaffSelectedDoctorIds(s.assignedDoctorIds); } else { setStaffAssignAll(true); setStaffSelectedDoctorIds([]); } setShowStaffModal(true); }} className="px-2 py-0.5 text-[10px] font-medium text-navy-600 border border-navy-200 rounded hover:bg-navy-50">Edit</button>
                            <button onClick={() => { setPasswordResetStaff(s); setResetPassword(''); setShowPasswordResetModal(true); }} className="px-2 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200 rounded hover:bg-amber-50 mr-1">Reset Pwd</button>
                            <button onClick={() => toggleStaffStatus(s)} className={`px-2 py-0.5 text-[10px] font-medium rounded mr-1 ${s.status === 'ACTIVE' ? 'text-orange-700 border border-orange-200 hover:bg-orange-50' : 'text-[#4d7c43] border border-[#b8d4af] hover:bg-[#ecf5e7]'}`}>{s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                ) : (
                  <div className="py-6 text-center text-slate-400 text-xs">No staff members yet</div>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* DOCTORS TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'doctors' && (
        <div className="flex-1 lg:min-h-0 lg:overflow-auto bg-white rounded-lg border border-slate-200">
          <div className="flex items-center justify-between px-2 py-1.5 bg-[#f0f7ff] shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[11px] font-semibold text-slate-800">Doctors</h3>
              <span className="px-1.5 py-0.5 bg-[#ecf5e7] text-[#4d7c43] text-[9px] font-medium rounded">{activeDoctors} active</span>
              {cardMsg('doctors')}
            </div>
            <button onClick={() => setShowInviteModal(true)} className="px-2 py-1 text-[10px] font-medium text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d]">+ Invite Doctor</button>
          </div>
          <div className="lg:overflow-auto">
            {!dataLoaded ? (
              <div className="overflow-x-auto">
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
              </div>
            ) : (doctors.length > 0 || pendingInvites.length > 0) ? (
              <div className="overflow-x-auto">
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
                  {doctors.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5">
                        <div className="font-medium text-slate-700">Dr. {d.fullName || d.email.split('@')[0]}</div>
                        <div className="text-[10px] text-slate-400">{d.email}</div>
                      </td>
                      <td className="px-3 py-1.5 text-slate-500 hidden sm:table-cell">{d.specialty || '—'}</td>
                      <td className="px-3 py-1.5 text-slate-500 hidden sm:table-cell">{d.phone || '—'}</td>
                      <td className="px-3 py-1.5 text-slate-500 hidden sm:table-cell">{d.licenseNumber || '—'}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                          d.complianceStatus === 'compliant' || !d.complianceStatus ? 'bg-[#f0f7eb] text-[#4d7c43]' :
                          d.complianceStatus === 'pending_signatures' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {d.complianceStatus === 'compliant' || !d.complianceStatus ? 'Active' : d.complianceStatus === 'pending_signatures' ? 'Pending' : 'Not Logged In'}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        <button onClick={() => openDoctorEditModal(d)} className="px-2 py-0.5 text-[10px] font-medium text-navy-600 border border-navy-200 rounded hover:bg-navy-50">Edit Profile</button>
                        <button onClick={() => openDoctorScheduleModal(d)} className="px-2 py-0.5 text-[10px] font-medium text-[#1e3a5f] border border-[#1e3a5f]/30 rounded hover:bg-[#1e3a5f]/5 ml-1">Schedule</button>
                        <button onClick={() => { setAssignForm({ doctorId: d.userId, productCode: 'APPOINTMENTS' }); setShowAssignModal(true); }} className="px-2 py-0.5 text-[10px] font-medium text-[#4d7c43] border border-[#b8d4af] rounded hover:bg-[#ecf5e7] ml-1">Assign License</button>
                        <button onClick={() => openRevokeLicenseModal(d)} className="px-2 py-0.5 text-[10px] font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 ml-1">Revoke License</button>
                      </td>
                    </tr>
                  ))}
                  {pendingInvites.map(inv => (
                    <tr key={inv.id} className="hover:bg-amber-50/30 bg-amber-50/20">
                      <td className="px-3 py-1.5">
                        <div className="font-medium text-slate-500">{inv.invitedEmail}</div>
                      </td>
                      <td className="px-3 py-1.5 text-slate-400 hidden sm:table-cell">—</td>
                      <td className="px-3 py-1.5 text-slate-400 hidden sm:table-cell">—</td>
                      <td className="px-3 py-1.5 text-slate-400 hidden sm:table-cell">—</td>
                      <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 text-amber-700">PENDING INVITE</span></td>
                      <td className="px-3 py-1.5 text-right">
                        <button onClick={() => revokeInvite(inv.id)} className="px-2 py-0.5 text-[10px] font-medium text-red-600 border border-red-200 rounded hover:bg-red-50">Revoke Invite</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            ) : (
              <div className="py-8 text-center">
                <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-xs text-slate-500">No doctors yet</p>
                <p className="text-[10px] text-slate-400">Invite doctors to join your hospital</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PATIENTS TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'patients' && (
        <div className="flex-1 lg:min-h-0 lg:overflow-auto bg-white rounded-lg border border-slate-200">
          <div className="flex items-center justify-between px-2 py-1.5 bg-[#f0f7ff]">
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input value={patientSearch} onChange={e => setPatientSearch(e.target.value)} placeholder="Search patients..." className="pl-7 pr-2 py-1 text-[10px] border border-slate-300 rounded bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#a3cbef] w-40" />
              </div>
              <span className="px-1.5 py-0.5 bg-[#ecf5e7] text-[#4d7c43] text-[9px] font-medium rounded">{activePatients} active</span>
              {cardMsg('patients')}
            </div>
            <button onClick={() => { setEditingPatient(null); setPatientForm({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '' }); setShowPatientModal(true); }} className="px-2 py-1 text-[10px] font-medium text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d]">+ Add Patient</button>
          </div>
          <div className="lg:max-h-[220px] lg:overflow-auto">
            {!dataLoaded ? (
              <div className="overflow-x-auto">
              <table className="w-full text-[11px] min-w-[500px]">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Patient</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Contact</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Age</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Gender</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Status</th>
                    <th className="px-3 py-1.5 text-right text-[10px] font-medium text-slate-500">Actions</th>
                  </tr>
                </thead>
                <TableSkeleton cols={6} rows={4} />
              </table>
              </div>
            ) : filteredPatients.length > 0 ? (
              <div className="overflow-x-auto">
              <table className="w-full text-[11px] min-w-[500px]">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Patient</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Contact</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Age</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Gender</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Status</th>
                    <th className="px-3 py-1.5 text-right text-[10px] font-medium text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPatients.map(p => {
                    const age = p.dateOfBirth ? Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / 31557600000) : null;
                    return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-[9px] font-semibold">
                            {p.firstName.charAt(0)}{p.lastName.charAt(0)}
                          </div>
                          <span className="font-medium text-slate-700">{p.firstName} {p.lastName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-slate-500 hidden sm:table-cell">
                        <div>{p.phone || '—'}</div>
                        <div className="text-[9px] text-slate-400 truncate max-w-[120px]">{p.email || '—'}</div>
                      </td>
                      <td className="px-3 py-1.5 text-slate-500 hidden sm:table-cell">{age !== null ? `${age} yrs` : '—'}</td>
                      <td className="px-3 py-1.5 text-slate-500 capitalize hidden sm:table-cell">{p.gender || '—'}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${p.status === 'active' ? 'bg-[#f0f7eb] text-[#4d7c43]' : 'bg-slate-100 text-slate-500'}`}>{p.status}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        <button onClick={() => { setEditingPatient(p); setPatientForm({ firstName: p.firstName, lastName: p.lastName, email: p.email || '', phone: p.phone || '', dateOfBirth: p.dateOfBirth || '', gender: p.gender || '' }); setShowPatientModal(true); }} className="px-2 py-0.5 text-[10px] font-medium text-navy-600 border border-navy-200 rounded hover:bg-navy-50">Edit</button>
                        <button onClick={() => togglePatientStatus(p)} className={`px-2 py-0.5 text-[10px] font-medium rounded ml-1 ${p.status === 'active' ? 'text-orange-700 border border-orange-200 hover:bg-orange-50' : 'text-[#4d7c43] border border-[#b8d4af] hover:bg-[#ecf5e7]'}`}>{p.status === 'active' ? 'Deactivate' : 'Activate'}</button>
                        <Link href={`/hospital/patients?id=${p.id}`} className="inline-block px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50 ml-1">View</Link>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            ) : (
              <div className="py-8 text-center">
                <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <p className="text-xs text-slate-500">{patientSearch ? 'No patients found' : 'No patients yet'}</p>
                <p className="text-[10px] text-slate-400">{patientSearch ? 'Try a different search' : 'Add your first patient'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODALS */}
      {/* ══════════════════════════════════════════════════════════════════════ */}

      {/* Staff Modal */}
      {showStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowStaffModal(false)}>
          <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">{editingStaff ? 'Edit Staff' : 'Add Staff'}</h2>
            <form onSubmit={saveStaff} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={staffForm.firstName} onChange={e => setStaffForm({ ...staffForm, firstName: e.target.value })} placeholder="First Name *" required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                <input value={staffForm.lastName} onChange={e => setStaffForm({ ...staffForm, lastName: e.target.value })} placeholder="Last Name *" required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
              </div>
              <select value={staffForm.title} onChange={e => setStaffForm({ ...staffForm, title: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500">
                <option value="">Select Title / Role</option>
                {staffTitleOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {!editingStaff && (
                <>
                  <input type="email" value={staffForm.email} onChange={e => setStaffForm({ ...staffForm, email: e.target.value })} placeholder="Email *" required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  <input type="password" value={staffForm.password} onChange={e => setStaffForm({ ...staffForm, password: e.target.value })} placeholder="Password *" required minLength={8} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                </>
              )}
              <PhoneInput value={staffForm.phone} onChange={(value) => setStaffForm({ ...staffForm, phone: value })} placeholder="Phone number" />

              {/* Doctor Assignment */}
              <div className="border-t pt-3">
                <label className="block text-[11px] font-medium text-slate-700 mb-2">Doctor Assignment</label>
                <div className="flex gap-3 mb-2">
                  <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                    <input type="radio" checked={staffAssignAll} onChange={() => { setStaffAssignAll(true); setStaffSelectedDoctorIds([]); }} className="w-3 h-3" />
                    All Doctors
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                    <input type="radio" checked={!staffAssignAll} onChange={() => setStaffAssignAll(false)} className="w-3 h-3" />
                    Specific Doctors
                  </label>
                </div>
                {!staffAssignAll && (
                  <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1">
                    {doctors.length > 0 ? doctors.map(d => (
                      <label key={d.userId} className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                        <input
                          type="checkbox"
                          checked={staffSelectedDoctorIds.includes(d.userId)}
                          onChange={e => {
                            if (e.target.checked) setStaffSelectedDoctorIds([...staffSelectedDoctorIds, d.userId]);
                            else setStaffSelectedDoctorIds(staffSelectedDoctorIds.filter(id => id !== d.userId));
                          }}
                          className="w-3 h-3"
                        />
                        Dr. {d.fullName || d.email}
                      </label>
                    )) : (
                      <p className="text-[10px] text-slate-400">No doctors found</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowStaffModal(false)} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={staffSaving} className="flex-1 py-2 text-xs font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 disabled:opacity-50">{staffSaving ? 'Saving...' : editingStaff ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordResetModal && passwordResetStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowPasswordResetModal(false); setPasswordResetStaff(null); setResetPassword(''); }}>
          <div className="w-full max-w-xs bg-white rounded-lg shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-1">Reset Password</h2>
            <p className="text-[11px] text-slate-500 mb-3">Set new password for {passwordResetStaff.displayName}</p>
            <form onSubmit={handlePasswordReset} className="space-y-3">
              <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="New Password (min 8 chars)" required minLength={8} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowPasswordResetModal(false); setPasswordResetStaff(null); setResetPassword(''); }} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={resettingPassword || resetPassword.length < 8} className="flex-1 py-2 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50">{resettingPassword ? 'Resetting...' : 'Reset'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Doctor Modal */}
      {/* Invite Hospital Manager Modal */}
      {showInviteManagerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowInviteManagerModal(false)}>
          <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Invite Hospital Manager</h2>
            <p className="text-[10px] text-slate-400 mb-3">Send an email invitation to add a new hospital manager.</p>
            <form onSubmit={inviteManager} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={inviteManagerFirstName} onChange={e => setInviteManagerFirstName(e.target.value)} placeholder="First Name *" required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                <input type="text" value={inviteManagerLastName} onChange={e => setInviteManagerLastName(e.target.value)} placeholder="Last Name *" required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
              </div>
              <input type="email" value={inviteManagerEmail} onChange={e => setInviteManagerEmail(e.target.value)} placeholder="Email address *" required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowInviteManagerModal(false)} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={invitingManager} className="flex-1 py-2 text-xs font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 disabled:opacity-50">{invitingManager ? 'Sending...' : 'Send Invite'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Manager Modal */}
      {showEditManagerModal && editingManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowEditManagerModal(false); setEditingManager(null); }}>
          <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Edit Manager Details</h2>
            <p className="text-[10px] text-slate-400 mb-3">{editingManager.email}</p>
            <form onSubmit={saveProfile} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={profileForm.firstName} onChange={e => setProfileForm({ ...profileForm, firstName: e.target.value })} placeholder="First Name *" required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                <input type="text" value={profileForm.lastName} onChange={e => setProfileForm({ ...profileForm, lastName: e.target.value })} placeholder="Last Name *" required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
              </div>
              <input type="tel" value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="Phone" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowEditManagerModal(false); setEditingManager(null); }} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={profileSaving} className="flex-1 py-2 text-xs font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 disabled:opacity-50">{profileSaving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowInviteModal(false)}>
          <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Invite Doctor</h2>
            <form onSubmit={inviteDoctor} className="space-y-3">
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
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Edit Doctor Profile</h2>
                <p className="text-xs text-slate-400 mt-0.5">{doctorFormData.firstName ? `Dr. ${doctorFormData.firstName} ${doctorFormData.lastName || ''}` : 'Loading...'}</p>
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
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">First Name *</label>
                      <input type="text" value={doctorFormData.firstName || ''} onChange={e => setDoctorFormData({ ...doctorFormData, firstName: e.target.value })} required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Last Name *</label>
                      <input type="text" value={doctorFormData.lastName || ''} onChange={e => setDoctorFormData({ ...doctorFormData, lastName: e.target.value })} required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Phone</label>
                      <PhoneInput value={doctorFormData.phone || ''} onChange={(value) => setDoctorFormData({ ...doctorFormData, phone: value })} placeholder="Phone number" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Date of Birth</label>
                        <input type="date" value={doctorFormData.dateOfBirth || ''} onChange={e => setDoctorFormData({ ...doctorFormData, dateOfBirth: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Gender</label>
                        <select value={doctorFormData.gender || ''} onChange={e => setDoctorFormData({ ...doctorFormData, gender: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white">
                          <option value="">Select</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">National ID</label>
                      <input type="text" value={doctorFormData.nationalId || ''} onChange={e => setDoctorFormData({ ...doctorFormData, nationalId: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Bio</label>
                      <textarea value={doctorFormData.bio || ''} onChange={e => setDoctorFormData({ ...doctorFormData, bio: e.target.value })} rows={3} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 resize-none" />
                    </div>
                  </div>

                  {/* Column 2: Professional Details */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">Professional Details</p>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Specialization</label>
                      <input type="text" value={doctorFormData.specialization || ''} onChange={e => setDoctorFormData({ ...doctorFormData, specialization: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Department</label>
                      <select value={doctorFormData.department || ''} onChange={e => setDoctorFormData({ ...doctorFormData, department: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white">
                        <option value="">Select</option>
                        {DEPARTMENTS.map(dep => <option key={dep} value={dep}>{dep}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">License Number</label>
                        <input type="text" value={doctorFormData.licenseNumber || ''} onChange={e => setDoctorFormData({ ...doctorFormData, licenseNumber: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Qualification</label>
                        <input type="text" value={doctorFormData.qualification || ''} onChange={e => setDoctorFormData({ ...doctorFormData, qualification: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Years of Experience</label>
                        <input type="number" value={doctorFormData.yearsOfExperience || ''} onChange={e => setDoctorFormData({ ...doctorFormData, yearsOfExperience: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Employment Type</label>
                        <select value={doctorFormData.employmentType || ''} onChange={e => setDoctorFormData({ ...doctorFormData, employmentType: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white">
                          <option value="">Select</option>
                          <option value="full-time">Full-Time</option>
                          <option value="part-time">Part-Time</option>
                          <option value="contract">Contract</option>
                          <option value="visiting">Visiting</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Consultation Fee</label>
                        <input type="number" value={doctorFormData.consultationFee || ''} onChange={e => setDoctorFormData({ ...doctorFormData, consultationFee: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Education</label>
                        <input type="text" value={doctorFormData.education || ''} onChange={e => setDoctorFormData({ ...doctorFormData, education: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Address & Emergency Contact */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">Address</p>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Address Line 1</label>
                      <input type="text" value={doctorFormData.addressLine1 || ''} onChange={e => setDoctorFormData({ ...doctorFormData, addressLine1: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Address Line 2</label>
                      <input type="text" value={doctorFormData.addressLine2 || ''} onChange={e => setDoctorFormData({ ...doctorFormData, addressLine2: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">City</label>
                        <input type="text" value={doctorFormData.city || ''} onChange={e => setDoctorFormData({ ...doctorFormData, city: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">State</label>
                        <input type="text" value={doctorFormData.state || ''} onChange={e => setDoctorFormData({ ...doctorFormData, state: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Postal Code</label>
                        <input type="text" value={doctorFormData.postalCode || ''} onChange={e => setDoctorFormData({ ...doctorFormData, postalCode: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                      </div>
                    </div>

                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1 pt-2">Emergency Contact</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Contact Name</label>
                        <input type="text" value={doctorFormData.emergencyContact || ''} onChange={e => setDoctorFormData({ ...doctorFormData, emergencyContact: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Relation</label>
                        <select value={doctorFormData.emergencyRelation || ''} onChange={e => setDoctorFormData({ ...doctorFormData, emergencyRelation: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white">
                          <option value="">Select</option>
                          {['Spouse', 'Parent', 'Sibling', 'Child', 'Friend', 'Relative', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Emergency Phone</label>
                      <PhoneInput value={doctorFormData.emergencyPhone || ''} onChange={(value) => setDoctorFormData({ ...doctorFormData, emergencyPhone: value })} placeholder="Emergency phone" />
                    </div>
                  </div>
                </div>

                {/* Footer */}
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
          <div className="w-full max-w-4xl bg-white rounded-xl shadow-xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
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
                <div className="grid grid-cols-[1fr_2fr] gap-6 px-6 py-5">
                  {/* Left: Shift Timing Definitions */}
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Shift Timings</p>
                    <div className="space-y-3">
                      {([
                        { key: 'morning' as const, label: 'Morning Shift', badge: 'AM', badgeCls: 'bg-yellow-100 text-yellow-700' },
                        { key: 'evening' as const, label: 'Evening Shift', badge: 'PM', badgeCls: 'bg-orange-100 text-orange-700' },
                        { key: 'night' as const, label: 'Night Shift', badge: 'NT', badgeCls: 'bg-navy-700 text-white' },
                      ]).map(shift => (
                        <div key={shift.key} className="p-3 border border-slate-200 rounded-lg bg-slate-50/50">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${shift.badgeCls}`}>{shift.badge}</span>
                            <span className="text-[11px] font-medium text-slate-700">{shift.label}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[9px] text-slate-400 mb-0.5">Start</label>
                              <input type="time" value={scheduleShiftTimings[shift.key].start} onChange={e => setScheduleShiftTimings(prev => ({ ...prev, [shift.key]: { ...prev[shift.key], start: e.target.value } }))} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-navy-500" />
                            </div>
                            <div>
                              <label className="block text-[9px] text-slate-400 mb-0.5">End</label>
                              <input type="time" value={scheduleShiftTimings[shift.key].end} onChange={e => setScheduleShiftTimings(prev => ({ ...prev, [shift.key]: { ...prev[shift.key], end: e.target.value } }))} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-navy-500" />
                            </div>
                          </div>
                          <p className="text-[9px] text-slate-400 mt-1">{formatTime12(scheduleShiftTimings[shift.key].start)} - {formatTime12(scheduleShiftTimings[shift.key].end)}</p>
                        </div>
                      ))}
                    </div>

                    {/* Quick Actions */}
                    <div className="mt-4 space-y-1.5">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Quick Actions</p>
                      <button type="button" onClick={() => setDoctorSchedule(prev => prev.map((d, i) => i >= 1 && i <= 5 ? { ...d, isWorking: true, morningShift: true, eveningShift: false, nightShift: false } : { ...d, isWorking: false, morningShift: false, eveningShift: false, nightShift: false }))} className="w-full px-3 py-1.5 text-[10px] font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 text-left">Set Weekdays Morning Only</button>
                      <button type="button" onClick={() => setDoctorSchedule(prev => prev.map((d, i) => i >= 1 && i <= 5 ? { ...d, isWorking: true, morningShift: true, eveningShift: true, nightShift: false } : { ...d, isWorking: false, morningShift: false, eveningShift: false, nightShift: false }))} className="w-full px-3 py-1.5 text-[10px] font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 text-left">Set Weekdays AM + PM</button>
                      <button type="button" onClick={() => setDoctorSchedule(prev => prev.map(d => ({ ...d, isWorking: true, morningShift: true, eveningShift: true, nightShift: true })))} className="w-full px-3 py-1.5 text-[10px] font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 text-left">Select All Shifts</button>
                      <button type="button" onClick={() => setDoctorSchedule(prev => prev.map(d => ({ ...d, isWorking: false, morningShift: false, eveningShift: false, nightShift: false })))} className="w-full px-3 py-1.5 text-[10px] font-medium text-red-500 border border-red-200 rounded-lg hover:bg-red-50 text-left">Clear All</button>
                    </div>
                  </div>

                  {/* Right: Weekly Schedule Table */}
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Weekly Shifts</p>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">Day</th>
                          <th className="py-2 text-center text-[10px] font-semibold text-slate-500 uppercase">
                            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400"></span>Morning</span>
                          </th>
                          <th className="py-2 text-center text-[10px] font-semibold text-slate-500 uppercase">
                            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400"></span>Evening</span>
                          </th>
                          <th className="py-2 text-center text-[10px] font-semibold text-slate-500 uppercase">
                            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-navy-600"></span>Night</span>
                          </th>
                          <th className="py-2 text-right text-[10px] font-semibold text-slate-500 uppercase">Shift Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {doctorSchedule.map((day, idx) => {
                          const isWeekend = idx === 0 || idx === 6;
                          const totalShifts = [day.morningShift, day.eveningShift, day.nightShift].filter(Boolean).length;
                          let shiftHoursDisplay = '';
                          if (day.isWorking && totalShifts > 0) {
                            const parts: string[] = [];
                            if (day.morningShift) parts.push(`${formatTime12(scheduleShiftTimings.morning.start)}-${formatTime12(scheduleShiftTimings.morning.end)}`);
                            if (day.eveningShift) parts.push(`${formatTime12(scheduleShiftTimings.evening.start)}-${formatTime12(scheduleShiftTimings.evening.end)}`);
                            if (day.nightShift) parts.push(`${formatTime12(scheduleShiftTimings.night.start)}-${formatTime12(scheduleShiftTimings.night.end)}`);
                            shiftHoursDisplay = parts.join(', ');
                          }
                          return (
                            <tr key={idx} className={`border-b border-slate-100 ${isWeekend ? 'bg-slate-50/50' : ''}`}>
                              <td className="py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-medium ${day.isWorking ? 'text-slate-800' : 'text-slate-400'}`}>{DAYS_OF_WEEK[idx]}</span>
                                  {isWeekend && <span className="text-[8px] font-medium text-slate-400 bg-slate-100 px-1 py-0.5 rounded">WE</span>}
                                </div>
                              </td>
                              {(['morning', 'evening', 'night'] as const).map(shift => {
                                const isActive = day[`${shift}Shift` as keyof DoctorScheduleDay] as boolean;
                                const cfg = {
                                  morning: { active: 'bg-yellow-100 text-yellow-700 border-yellow-300', inactive: 'bg-white text-slate-300 border-slate-200' },
                                  evening: { active: 'bg-orange-100 text-orange-700 border-orange-300', inactive: 'bg-white text-slate-300 border-slate-200' },
                                  night: { active: 'bg-navy-700 text-white border-navy-600', inactive: 'bg-white text-slate-300 border-slate-200' },
                                }[shift];
                                return (
                                  <td key={shift} className="py-2.5 text-center">
                                    <label className={`inline-flex items-center justify-center w-16 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all border ${isActive ? cfg.active : cfg.inactive} hover:opacity-80`}>
                                      <input type="checkbox" checked={isActive} onChange={e => handleDoctorScheduleChange(idx, `${shift}Shift`, e.target.checked)} className="sr-only" />
                                      {isActive ? (shift === 'morning' ? 'AM' : shift === 'evening' ? 'PM' : 'NT') : '—'}
                                    </label>
                                  </td>
                                );
                              })}
                              <td className="py-2.5 text-right">
                                {day.isWorking && shiftHoursDisplay ? (
                                  <span className="text-[9px] text-slate-400">{shiftHoursDisplay}</span>
                                ) : (
                                  <span className="text-[9px] text-slate-300 italic">Off</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
                  <button type="button" onClick={() => { setShowDoctorScheduleModal(false); setScheduleDoctorId(null); }} className="px-5 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100">Cancel</button>
                  <button onClick={saveDoctorSchedule} disabled={doctorScheduleSaving} className="px-5 py-2 text-xs font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 disabled:opacity-50">{doctorScheduleSaving ? 'Saving...' : 'Save Schedule'}</button>
                </div>
              </>
            )}
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
                      <p className="text-[10px] text-slate-400">Assigned {new Date(l.assignedAt).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => handleRevokeLicense(l.id)} disabled={revokingLicenseId === l.id} className="px-2.5 py-1 text-[10px] font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50">
                      {revokingLicenseId === l.id ? 'Revoking...' : 'Revoke'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-xs text-slate-500">No active licenses found for this doctor.</p>
              </div>
            )}
            <div className="mt-3">
              <button type="button" onClick={() => setShowRevokeLicenseModal(false)} className="w-full py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign License Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowAssignModal(false); setAssignDoctorSearch(''); setAssignProductOpen(false); setAssignDoctorOpen(false); }}>
          <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-5" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Assign License</h2>
            <form onSubmit={assignLicense} className="space-y-3">
              {/* Product Dropdown */}
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
                        <button type="button" key={item.productCode} onClick={() => { setAssignForm({ ...assignForm, productCode: item.productCode, doctorId: '' }); setAssignProductOpen(false); }} className={`w-full text-left px-3 py-2 text-xs transition-colors ${item.productCode === assignForm.productCode ? 'bg-[#1e3a5f] text-white font-medium' : 'text-slate-700 hover:bg-[#e8f4fc] hover:text-[#1e3a5f]'}`}>
                          {item.productName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* Doctor Dropdown (searchable) */}
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
                        {availableDoctorsForLicense.filter(d => {
                          if (!assignDoctorSearch) return true;
                          const q = assignDoctorSearch.toLowerCase();
                          return (d.fullName || '').toLowerCase().includes(q) || (d.email || '').toLowerCase().includes(q);
                        }).length === 0 ? (
                          <div className="px-3 py-3 text-xs text-slate-400 text-center">{doctors.length === 0 ? 'No doctors added yet' : assignDoctorSearch ? 'No matching doctors' : 'All doctors have been assigned this license'}</div>
                        ) : (
                          availableDoctorsForLicense.filter(d => {
                            if (!assignDoctorSearch) return true;
                            const q = assignDoctorSearch.toLowerCase();
                            return (d.fullName || '').toLowerCase().includes(q) || (d.email || '').toLowerCase().includes(q);
                          }).map(d => (
                            <button type="button" key={d.userId} onClick={() => { setAssignForm({ ...assignForm, doctorId: d.userId }); setAssignDoctorOpen(false); setAssignDoctorSearch(''); }} className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${d.userId === assignForm.doctorId ? 'bg-[#1e3a5f] text-white' : 'text-slate-700 hover:bg-[#e8f4fc] hover:text-[#1e3a5f]'}`}>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${d.userId === assignForm.doctorId ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                {(d.fullName || d.email || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className={`truncate font-medium ${d.userId === assignForm.doctorId ? 'text-white' : ''}`}>Dr. {d.fullName || 'No name'}</div>
                                <div className={`truncate text-[10px] ${d.userId === assignForm.doctorId ? 'text-white/70' : 'text-slate-400'}`}>{d.email}</div>
                              </div>
                              {d.userId === assignForm.doctorId && (
                                <svg className="w-4 h-4 ml-auto flex-shrink-0 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              )}
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
          </div>
        </div>
      )}

      {/* Patient Modal */}
      {showPatientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowPatientModal(false)}>
          <div className="w-full max-w-lg bg-white rounded-lg shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">{editingPatient ? 'Edit Patient' : 'Add Patient'}</h2>
            <form onSubmit={savePatient} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={patientForm.firstName} onChange={e => setPatientForm({ ...patientForm, firstName: e.target.value })} placeholder="First Name *" required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                <input value={patientForm.lastName} onChange={e => setPatientForm({ ...patientForm, lastName: e.target.value })} placeholder="Last Name *" required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="email" value={patientForm.email} onChange={e => setPatientForm({ ...patientForm, email: e.target.value })} placeholder="Email" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                <PhoneInput value={patientForm.phone} onChange={(value) => setPatientForm({ ...patientForm, phone: value })} placeholder="Phone number" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="date" value={patientForm.dateOfBirth} onChange={e => setPatientForm({ ...patientForm, dateOfBirth: e.target.value })} placeholder="Date of Birth" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                <select value={patientForm.gender} onChange={e => setPatientForm({ ...patientForm, gender: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white">
                  <option value="">Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowPatientModal(false)} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={patientSaving || !patientForm.firstName || !patientForm.lastName} className="flex-1 py-2 text-xs font-medium text-white bg-[var(--color-primary)] rounded-lg hover:bg-[var(--color-primary-dark)] disabled:opacity-50">{patientSaving ? 'Saving...' : editingPatient ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hospital Info Edit Modal */}
      {generalEditMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setGeneralEditMode(false); setHospital(originalHospital); setSelectedSpecialtyIds((originalHospital.specialties || []).map((s: any) => s.id)); }}>
          <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Edit Hospital Information</h2>
            {message?.source === 'general' && (
              <div className={`mb-3 px-3 py-2 rounded text-xs ${message.type === 'success' ? 'bg-sky-50 text-sky-700' : 'bg-red-50 text-red-700'}`}>{message.text}</div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {/* Left column */}
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Hospital Name *</label>
                  <input value={hospital.name || ''} onChange={e => setHospital({ ...hospital, name: e.target.value })} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Phone</label>
                    <PhoneInput value={hospital.phone || ''} onChange={(value) => setHospital({ ...hospital, phone: value })} placeholder="Phone" compact />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Email</label>
                    <input type="email" value={hospital.email || ''} onChange={e => setHospital({ ...hospital, email: e.target.value })} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Website</label>
                  <input value={hospital.website || ''} onChange={e => setHospital({ ...hospital, website: e.target.value })} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                </div>
                <div className="border-t pt-2">
                  <p className="text-[10px] font-semibold text-slate-700 mb-1">Classification</p>
                  <select value={hospital.hospitalType || ''} onChange={e => setHospital({ ...hospital, hospitalType: e.target.value })} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white mb-1">
                    <option value="">Hospital Type *</option>
                    {hospitalTypeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Specialties *</label>
                  <div className="max-h-24 overflow-y-auto border border-slate-200 rounded p-1.5 space-y-0.5">
                    {specializations.map(s => (
                      <label key={s.id} className="flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                        <input type="checkbox" checked={selectedSpecialtyIds.includes(s.id)} onChange={e => { if (e.target.checked) setSelectedSpecialtyIds([...selectedSpecialtyIds, s.id]); else setSelectedSpecialtyIds(selectedSpecialtyIds.filter(id => id !== s.id)); }} className="w-3 h-3" />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              {/* Right column */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-slate-700 mb-0.5">Address</p>
                <input value={hospital.addressLine1 || ''} onChange={e => setHospital({ ...hospital, addressLine1: e.target.value })} placeholder="Address Line 1 *" className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                <input value={hospital.addressLine2 || ''} onChange={e => setHospital({ ...hospital, addressLine2: e.target.value })} placeholder="Address Line 2" className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                <div className="grid grid-cols-2 gap-1.5">
                  <select value={hospital.country || ''} onChange={e => setHospital({ ...hospital, country: e.target.value, state: '' })} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white">
                    <option value="">Country *</option>
                    {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                  <select value={hospital.state || ''} onChange={e => setHospital({ ...hospital, state: e.target.value })} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white">
                    <option value="">State *</option>
                    {getStatesForCountry(hospital.country || '').map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input value={hospital.city || ''} onChange={e => setHospital({ ...hospital, city: e.target.value })} placeholder="City *" className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  <input value={hospital.postal || ''} onChange={e => setHospital({ ...hospital, postal: e.target.value })} placeholder="Postal Code *" className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                </div>
              </div>
              {/* Footer spans both columns */}
              <div className="col-span-2 flex gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => { setGeneralEditMode(false); setHospital(originalHospital); setSelectedSpecialtyIds((originalHospital.specialties || []).map((s: any) => s.id)); }} className="flex-1 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={saveHospitalInfoAll} disabled={generalSaving} className="flex-1 py-1.5 text-xs font-medium text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d] disabled:opacity-50">{generalSaving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Billing Address Edit Modal */}
      {billingAddressEditMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setBillingAddressEditMode(false); setHospital(originalHospital); }}>
          <div className="w-full max-w-lg bg-white rounded-lg shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Edit Billing Address</h2>
            {message?.source === 'billing' && (
              <div className={`mb-3 px-3 py-2 rounded text-xs ${message.type === 'success' ? 'bg-sky-50 text-sky-700' : 'bg-red-50 text-red-700'}`}>{message.text}</div>
            )}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sameAsHospitalAddress}
                  onChange={e => {
                    setSameAsHospitalAddress(e.target.checked);
                    if (e.target.checked) {
                      setHospital(h => ({
                        ...h,
                        billingAddressLine1: h.addressLine1,
                        billingAddressLine2: h.addressLine2,
                        billingCity: h.city,
                        billingState: h.state,
                        billingPostal: h.postal,
                        billingCountry: h.country,
                      }));
                    }
                  }}
                  className="w-3 h-3"
                />
                Same as hospital address
              </label>
              {!sameAsHospitalAddress && (
                <div className="space-y-2">
                  <input value={hospital.billingAddressLine1 || ''} onChange={e => setHospital({ ...hospital, billingAddressLine1: e.target.value })} placeholder="Address Line 1 *" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  <input value={hospital.billingAddressLine2 || ''} onChange={e => setHospital({ ...hospital, billingAddressLine2: e.target.value })} placeholder="Address Line 2" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={hospital.billingCountry || ''} onChange={e => setHospital({ ...hospital, billingCountry: e.target.value, billingState: '' })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white">
                      <option value="">Country *</option>
                      {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                    <select value={hospital.billingState || ''} onChange={e => setHospital({ ...hospital, billingState: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white">
                      <option value="">State *</option>
                      {getStatesForCountry(hospital.billingCountry || '').map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={hospital.billingCity || ''} onChange={e => setHospital({ ...hospital, billingCity: e.target.value })} placeholder="City *" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    <input value={hospital.billingPostal || ''} onChange={e => setHospital({ ...hospital, billingPostal: e.target.value })} placeholder="Postal Code *" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setBillingAddressEditMode(false); setHospital(originalHospital); }} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={saveBillingAddress} disabled={billingAddressSaving} className="flex-1 py-2 text-xs font-medium text-white bg-[#1e3a5f] rounded-lg hover:bg-[#162f4d] disabled:opacity-50">{billingAddressSaving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legal, Tax & Compliance Edit Modal */}
      {legalComplianceEditMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setLegalComplianceEditMode(false); setHospital(originalHospital); }}>
          <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Edit Legal, Tax & Compliance</h2>
            {message?.source === 'legal' && (
              <div className={`mb-3 px-3 py-2 rounded text-xs ${message.type === 'success' ? 'bg-sky-50 text-sky-700' : 'bg-red-50 text-red-700'}`}>{message.text}</div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {/* Left column */}
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Legal Entity Name</label>
                  <input value={hospital.legalEntityName || ''} onChange={e => setHospital({ ...hospital, legalEntityName: e.target.value })} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Billing Contact Email</label>
                  <input type="email" value={hospital.billingContactEmail || ''} onChange={e => setHospital({ ...hospital, billingContactEmail: e.target.value })} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Tax ID Type</label>
                    <select value={hospital.taxIdType || ''} onChange={e => setHospital({ ...hospital, taxIdType: e.target.value })} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white">
                      <option value="">Select...</option>
                      {availableTaxIdTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Tax ID Value</label>
                    <input value={hospital.taxIdValue || ''} onChange={e => setHospital({ ...hospital, taxIdValue: e.target.value })} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  </div>
                </div>
                <div className="border-t pt-2">
                  <p className="text-[10px] font-semibold text-slate-700 mb-1">Compliance</p>
                  <label className="flex items-center gap-2 text-[10px] text-slate-600 cursor-pointer mb-1">
                    <input type="checkbox" checked={hospital.storesPhi || false} onChange={e => setHospital({ ...hospital, storesPhi: e.target.checked })} className="w-3 h-3" />
                    Stores PHI
                  </label>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Data Retention (days)</label>
                    <input type="number" value={hospital.dataRetentionDays || ''} onChange={e => setHospital({ ...hospital, dataRetentionDays: e.target.value ? Number(e.target.value) : undefined })} placeholder="e.g. 2555" className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  </div>
                </div>
              </div>
              {/* Right column */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-slate-700 mb-0.5">Insurance</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Provider</label>
                    <input value={hospital.insuranceProvider || ''} onChange={e => setHospital({ ...hospital, insuranceProvider: e.target.value })} placeholder="e.g. Blue Cross" className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Policy Number</label>
                    <input value={hospital.insurancePolicyNumber || ''} onChange={e => setHospital({ ...hospital, insurancePolicyNumber: e.target.value })} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  </div>
                </div>
                <div className="border-t pt-2">
                  <p className="text-[10px] font-semibold text-slate-700 mb-1">Accreditation</p>
                  <div className="grid grid-cols-2 gap-1.5 mb-1">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Body</label>
                      <input value={hospital.accreditationBody || ''} onChange={e => setHospital({ ...hospital, accreditationBody: e.target.value })} placeholder="e.g. Joint Commission" className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Number</label>
                      <input value={hospital.accreditationNumber || ''} onChange={e => setHospital({ ...hospital, accreditationNumber: e.target.value })} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Expiry</label>
                    <input type="date" value={hospital.accreditationExpiry || ''} onChange={e => setHospital({ ...hospital, accreditationExpiry: e.target.value })} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  </div>
                </div>
                <div className="border-t pt-2">
                  <p className="text-[10px] font-semibold text-slate-700 mb-1">Hospital License</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-600 mb-0.5">License Number</label>
                      <input value={hospital.licenseNumber || ''} onChange={e => setHospital({ ...hospital, licenseNumber: e.target.value })} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-600 mb-0.5">License Expiry</label>
                      <input type="date" value={hospital.licenseExpiry || ''} onChange={e => setHospital({ ...hospital, licenseExpiry: e.target.value })} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    </div>
                  </div>
                </div>
              </div>
              {/* Footer spans both columns */}
              <div className="col-span-2 flex gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => { setLegalComplianceEditMode(false); setHospital(originalHospital); }} className="flex-1 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={saveLegalCompliance} disabled={legalComplianceSaving} className="flex-1 py-1.5 text-xs font-medium text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d] disabled:opacity-50">{legalComplianceSaving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Operating Hours & Holidays Edit Modal */}
      {hoursEditMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setHoursEditMode(false); setCalSelectedDate(''); setHospital({ ...hospital, operatingHours: originalHospital.operatingHours, hospitalHolidays: originalHospital.hospitalHolidays }); }}>
          <div className="w-full max-w-4xl bg-white rounded-lg shadow-xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-800">Edit Operating Days, Hours & Holidays</h2>
              {message?.source === 'hours' && (
                <span className={`text-[10px] px-2 py-0.5 rounded ${message.type === 'success' ? 'bg-sky-50 text-sky-700' : 'bg-red-50 text-red-700'}`}>{message.text}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-6">
              {/* Left: Operating Hours */}
              <div>
                <p className="text-[11px] font-semibold text-slate-700 mb-2">Weekly Operating Hours</p>
                <div className="space-y-1.5">
                  {DAYS.map(day => {
                    const d = (hospital.operatingHours || defaultHours)[day] || { open: '', close: '', closed: true };
                    const timeOptions = (() => {
                      const opts: string[] = [];
                      for (let h = 0; h < 24; h++) {
                        for (let m = 0; m < 60; m += 15) {
                          opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                        }
                      }
                      return opts;
                    })();
                    const formatTime12 = (t: string) => {
                      if (!t) return '';
                      const [hh, mm] = t.split(':').map(Number);
                      const ampm = hh >= 12 ? 'PM' : 'AM';
                      const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
                      return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
                    };
                    return (
                      <div key={day} className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-slate-700 w-10 shrink-0">{DAY_LABELS[day]}</span>
                        <label className="flex items-center gap-1 shrink-0 cursor-pointer">
                          <input type="checkbox" checked={d.closed} onChange={e => setDayHours(day, 'closed', e.target.checked as any)} className="w-3.5 h-3.5 rounded border-slate-300 text-[#1e3a5f] focus:ring-[#1e3a5f]" />
                          <span className="text-[10px] text-slate-500">Closed</span>
                        </label>
                        {!d.closed && (
                          <div className="flex items-center gap-2 flex-1">
                            <select value={d.open} onChange={e => setDayHours(day, 'open', e.target.value)} className="px-2 py-1 text-[11px] border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] appearance-none cursor-pointer min-w-[105px]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2394a3b8\' stroke-width=\'2\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', paddingRight: '24px' }}>
                              {timeOptions.map(t => <option key={t} value={t}>{formatTime12(t)}</option>)}
                            </select>
                            <span className="text-slate-400 text-[10px] font-medium">to</span>
                            <select value={d.close} onChange={e => setDayHours(day, 'close', e.target.value)} className="px-2 py-1 text-[11px] border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] appearance-none cursor-pointer min-w-[105px]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2394a3b8\' stroke-width=\'2\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', paddingRight: '24px' }}>
                              {timeOptions.map(t => <option key={t} value={t}>{formatTime12(t)}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Right: Holidays Calendar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-slate-700">Hospital Holidays ({holidays.length})</p>
                  {holidays.length === 0 && (
                    <button onClick={initDefaultHolidays} className="text-[10px] text-[#1e3a5f] hover:underline font-medium">Load Indian Holidays</button>
                  )}
                </div>
                {/* Month navigation */}
                <div className="flex items-center justify-between mb-2 bg-slate-50 rounded-md px-2 py-1">
                  <button onClick={() => setHolidayMonth(m => m && m > 1 ? m - 1 : 12)} className="p-1 hover:bg-slate-200 rounded-md transition-colors">
                    <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="text-[11px] font-semibold text-slate-700">{MONTH_FULL[(holidayMonth || 1) - 1]}</span>
                  <button onClick={() => setHolidayMonth(m => m && m < 12 ? m + 1 : 1)} className="p-1 hover:bg-slate-200 rounded-md transition-colors">
                    <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
                {/* Calendar Grid */}
                {(() => {
                  const cm = holidayMonth || 1;
                  const year = new Date().getFullYear();
                  const firstDay = new Date(year, cm - 1, 1).getDay();
                  const daysInMonth = new Date(year, cm, 0).getDate();
                  const holidaysInMonth = getHolidaysForMonth(cm);
                  const holidayDays = new Set(holidaysInMonth.map(h => h.day));
                  const cells: (number | null)[] = [];
                  for (let i = 0; i < firstDay; i++) cells.push(null);
                  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                  return (
                    <div>
                      <div className="grid grid-cols-7 gap-px mb-1">
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                          <div key={d} className="text-[9px] text-center text-slate-400 font-semibold py-1">{d}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-0.5">
                        {cells.map((day, idx) => {
                          const isHoliday = day ? holidayDays.has(day) : false;
                          const isSelected = day ? calSelectedDate === `${cm}-${day}` : false;
                          return (
                            <button
                              key={idx}
                              disabled={!day}
                              onClick={() => {
                                if (!day) return;
                                if (isSelected) {
                                  setCalSelectedDate('');
                                  setNewHolidayName('');
                                } else if (isHoliday) {
                                  const h = holidaysInMonth.find(h => h.day === day);
                                  if (h) removeHoliday(cm, day, h.name);
                                } else {
                                  setCalSelectedDate(`${cm}-${day}`);
                                  setNewHolidayName('');
                                }
                              }}
                              title={isHoliday ? `${holidaysInMonth.find(h => h.day === day)?.name} (click to remove)` : isSelected ? 'Click to unselect' : undefined}
                              className={`text-[10px] py-1.5 rounded-md text-center transition-colors ${
                                !day ? '' :
                                isHoliday ? 'bg-red-100 text-red-700 font-bold hover:bg-red-200 ring-1 ring-red-200' :
                                isSelected ? 'bg-[#1e3a5f] text-white ring-1 ring-[#1e3a5f]' :
                                'hover:bg-slate-100 text-slate-700'
                              }`}
                            >
                              {day || ''}
                            </button>
                          );
                        })}
                      </div>
                      {/* Add holiday for selected date */}
                      {calSelectedDate.startsWith(`${cm}-`) && (
                        <div className="flex items-center gap-1.5 mt-2 bg-slate-50 rounded-md p-2">
                          <span className="text-[10px] text-slate-600 font-medium shrink-0">{MONTH_FULL[cm - 1]} {calSelectedDate.split('-')[1]}:</span>
                          <input type="text" value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)} placeholder="Holiday name" className="flex-1 px-2 py-1 text-[11px] border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" autoFocus onKeyDown={e => { if (e.key === 'Enter' && newHolidayName.trim()) { addHoliday(cm, parseInt(calSelectedDate.split('-')[1]), newHolidayName.trim()); setCalSelectedDate(''); setNewHolidayName(''); } if (e.key === 'Escape') { setCalSelectedDate(''); setNewHolidayName(''); } }} />
                          <button onClick={() => { if (newHolidayName.trim()) { addHoliday(cm, parseInt(calSelectedDate.split('-')[1]), newHolidayName.trim()); setCalSelectedDate(''); setNewHolidayName(''); } }} className="px-2.5 py-1 text-[10px] font-medium text-white bg-[#1e3a5f] rounded-md hover:bg-[#162f4d]">Add</button>
                          <button onClick={() => { setCalSelectedDate(''); setNewHolidayName(''); }} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-md transition-colors" title="Cancel selection">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      )}
                      {/* List holidays for this month */}
                      {holidaysInMonth.length > 0 && (
                        <div className="mt-2 space-y-0.5 max-h-24 overflow-y-auto">
                          {holidaysInMonth.sort((a, b) => a.day - b.day).map((h, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[10px] px-2 py-1 bg-red-50 rounded-md">
                              <span><span className="font-semibold text-red-700">{h.day}</span> <span className="text-red-600">{h.name}</span></span>
                              <button onClick={() => removeHoliday(h.month, h.day, h.name)} className="text-red-400 hover:text-red-600 p-0.5 hover:bg-red-100 rounded transition-colors" title="Remove holiday">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
            {/* Footer */}
            <div className="flex gap-2 pt-3 mt-4 border-t border-slate-100">
              <button onClick={() => { setHoursEditMode(false); setCalSelectedDate(''); setHospital({ ...hospital, operatingHours: originalHospital.operatingHours, hospitalHolidays: originalHospital.hospitalHolidays }); }} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">Cancel</button>
              <button onClick={saveOperatingHours} disabled={hoursSaving} className="flex-1 py-2 text-xs font-medium text-white bg-[#1e3a5f] rounded-md hover:bg-[#162f4d] disabled:opacity-50">{hoursSaving ? 'Saving...' : 'Save Changes'}</button>
            </div>
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

      {/* Document Viewer Modal (PDF-style) */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setViewingDoc(null)}>
          <div className="w-full max-w-2xl bg-slate-100 rounded-lg shadow-xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#1e3a5f]">
              <div className="flex items-center gap-2 text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                <div>
                  <h3 className="text-xs font-semibold">{viewingDoc.docTitle}</h3>
                  <p className="text-[9px] text-white/60">Version {viewingDoc.version}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => downloadDocAsPdf(viewingDoc)}
                  className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded"
                  title="Download as PDF"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </button>
                <button onClick={() => setViewingDoc(null)} className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto flex-1 bg-slate-200">
              <div className="bg-white shadow-md mx-auto max-w-[600px] px-10 py-8 rounded min-h-[500px]">
                <div className="border-b border-slate-200 pb-3 mb-4">
                  <h2 className="text-base font-bold text-slate-800">{viewingDoc.docTitle}</h2>
                  <p className="text-[10px] text-slate-400 mt-0.5">Version {viewingDoc.version} &middot; Signed by {viewingDoc.signerName} on {new Date(viewingDoc.acceptedAt).toLocaleDateString()}</p>
                </div>
                <div
                  className="prose prose-sm max-w-none text-slate-700 text-xs leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(viewingDoc.contentMarkdown) }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HospitalAdministrationPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[200px]"><div className="w-6 h-6 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <HospitalAdministrationContent />
    </Suspense>
  );
}
