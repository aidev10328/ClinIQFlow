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
  const [originalHospital, setOriginalHospital] = useState<Partial<HospitalDetails>>({});
  const [specializations, setSpecializations] = useState<Specialization[]>([]);
  const [selectedSpecialtyIds, setSelectedSpecialtyIds] = useState<string[]>([]);
  const [sameAsHospitalAddress, setSameAsHospitalAddress] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const pictureInputRef = useRef<HTMLInputElement>(null);

  // Manager Profile
  const [profileEditMode, setProfileEditMode] = useState(false);
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

  // Doctors
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // Billing
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [licenseStats, setLicenseStats] = useState<LicenseStats | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ doctorId: '', productCode: 'APPOINTMENTS' });
  const [assigning, setAssigning] = useState(false);

  // Patients
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [patientSaving, setPatientSaving] = useState(false);
  const [patientForm, setPatientForm] = useState({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '' });

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
        }
        if (invitesRes.ok) {
          const inv = await invitesRes.json();
          setPendingInvites(inv.filter((i: Invite) => i.status === 'PENDING' && i.role === 'DOCTOR'));
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
        setMessage({ type: 'error', text: 'Failed to update', source: 'general' });
      }
    } catch { setMessage({ type: 'error', text: 'Failed to update', source: 'general' }); }
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
        setMessage({ type: 'error', text: 'Failed to update', source: 'billing' });
      }
    } catch { setMessage({ type: 'error', text: 'Failed to update', source: 'billing' }); }
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
        setMessage({ type: 'error', text: 'Failed to update', source: 'legal' });
      }
    } catch { setMessage({ type: 'error', text: 'Failed to update', source: 'legal' }); }
    finally { setLegalComplianceSaving(false); }
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
      const genRes = await apiFetch(`/v1/hospitals/${currentHospitalId}`, { method: 'PATCH', body: JSON.stringify({
        name: hospital.name, phone: hospital.phone, email: hospital.email, website: hospital.website,
        addressLine1: hospital.addressLine1, addressLine2: hospital.addressLine2,
        city: hospital.city, state: hospital.state, postal: hospital.postal, country: hospital.country,
      })});
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
        setProfileEditMode(false);
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

  // Consistent form field styles — prevents layout shift between view/edit modes
  const fieldClass = (editing: boolean) =>
    `w-full px-1.5 py-0.5 text-[11px] border border-slate-200 rounded ${editing ? 'bg-white focus:outline-none focus:ring-1 focus:ring-navy-500' : 'bg-slate-50 text-slate-700 cursor-default'}`;
  const selectFieldClass = (editing: boolean) =>
    `w-full px-1.5 py-0.5 text-[11px] border border-slate-200 rounded ${editing ? 'bg-white focus:outline-none focus:ring-1 focus:ring-navy-500' : 'bg-slate-50 text-slate-700 cursor-default opacity-100'}`;
  const cardMsg = (source: string) => message?.source === source ? (
    <span className={`text-[9px] px-1.5 py-0.5 rounded animate-pulse ${message.type === 'success' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-red-400/20 text-red-200'}`}>{message.text}</span>
  ) : null;

  const InfoRow = ({ label, value }: { label: string; value?: string | number | null }) => (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-slate-900 text-[10px] shrink-0">{label}</span>
      <span className="text-slate-700 font-medium text-right truncate">{value || '—'}</span>
    </div>
  );

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'details' as TabType, label: 'Hospital Details' },
    { id: 'manager' as TabType, label: 'Hospital Manager' },
    { id: 'staff' as TabType, label: 'Staff', count: staff.length },
    { id: 'doctors' as TabType, label: 'Doctors', count: doctors.length },
    { id: 'patients' as TabType, label: 'Patients', count: patients.length },
  ];

  return (
    <div className="space-y-2">
      {/* Header */}
      <div>
        <h1 className="text-sm font-semibold text-slate-800">Hospital Administration</h1>
        <p className="text-[10px] text-slate-400">Manage hospital details, billing, subscriptions, hospital manager settings, staff, doctors &amp; patients</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 sticky top-0 z-10 bg-white">
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
            {t.label}
            {t.count !== undefined && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold ${activeTab === t.id ? 'bg-[#1e3a5f]/10 text-[#1e3a5f]' : 'bg-slate-200/70 text-slate-500'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* HOSPITAL DETAILS TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'details' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">

          {/* ── Card 1: Hospital Information ── */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1.5 bg-[#1e3a5f]">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold text-white">Hospital Information</h3>
                {cardMsg('general')}
              </div>
              {canEditSettings && (
                <button onClick={() => setGeneralEditMode(true)} className="px-2 py-0.5 text-[10px] text-white bg-white/20 rounded hover:bg-white/30 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  Edit
                </button>
              )}
            </div>
            <div className="p-2 text-[11px]">
              <InfoRow label="Hospital Name" value={hospital.name} />
              <InfoRow label="Phone" value={hospital.phone} />
              <InfoRow label="Email" value={hospital.email} />
              <InfoRow label="Website" value={hospital.website} />
              <div className="border-t border-slate-100 pt-1 mt-1">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Address</p>
                <InfoRow label="Street" value={hospital.addressLine1} />
                {hospital.addressLine2 && <InfoRow label="Line 2" value={hospital.addressLine2} />}
                <InfoRow label="Country" value={COUNTRIES.find(c => c.code === hospital.country)?.name || hospital.country} />
                <InfoRow label="State" value={getStatesForCountry(hospital.country || '').find(s => s.code === hospital.state)?.name || hospital.state} />
                <InfoRow label="City" value={hospital.city} />
                <InfoRow label="Postal" value={hospital.postal} />
              </div>
              <div className="border-t border-slate-100 pt-1 mt-1">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Classification</p>
                <InfoRow label="Type" value={hospitalTypeOptions.find(t => t.value === hospital.hospitalType)?.label || hospital.hospitalType} />
                <InfoRow label="Specialties" value={(hospital.specialties || []).map(s => s.name).join(', ')} />
              </div>
            </div>
          </div>

          {/* ── Card 2: Payments, Billing, Subscriptions & Licenses ── */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1.5 bg-[#1e3a5f]">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold text-white">Billing & Subscriptions</h3>
                {cardMsg('billing')}
                {cardMsg('license')}
              </div>
              {canEditSettings && (
                <button onClick={() => setBillingAddressEditMode(true)} className="px-2 py-0.5 text-[10px] text-white bg-white/20 rounded hover:bg-white/30 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  Edit
                </button>
              )}
            </div>
            <div className="p-2 text-[11px]">
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Billing Address</p>
              {sameAsHospitalAddress && <span className="text-[9px] text-emerald-600 font-medium block mb-0.5">Same as hospital address</span>}
              <InfoRow label="Street" value={hospital.billingAddressLine1} />
              {hospital.billingAddressLine2 && <InfoRow label="Line 2" value={hospital.billingAddressLine2} />}
              <InfoRow label="Country" value={COUNTRIES.find(c => c.code === hospital.billingCountry)?.name || hospital.billingCountry} />
              <InfoRow label="State" value={getStatesForCountry(hospital.billingCountry || '').find(s => s.code === hospital.billingState)?.name || hospital.billingState} />
              <InfoRow label="City" value={hospital.billingCity} />
              <InfoRow label="Postal" value={hospital.billingPostal} />

              <div className="border-t border-slate-100 pt-1 mt-1">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Subscription</p>
                  {subscription && <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${subscription.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : subscription.status === 'TRIAL' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{subscription.status}</span>}
                </div>
                {subscription ? (
                  <>
                    <InfoRow label="Started" value={new Date(subscription.billingCycleStart).toLocaleDateString()} />
                    <InfoRow label="Next Billing" value={new Date(subscription.billingCycleEnd).toLocaleDateString()} />
                    {subscription.trialEndsAt && <InfoRow label="Trial Ends" value={new Date(subscription.trialEndsAt).toLocaleDateString()} />}
                    {subscription.cancelledAt && <InfoRow label="Cancelled" value={new Date(subscription.cancelledAt).toLocaleDateString()} />}
                    <div className="mt-1 pt-1 border-t border-slate-100">
                      {subscription.items.map(item => (
                        <div key={item.productCode} className="flex items-center justify-between py-0.5">
                          <span className="text-slate-600">{item.productName} <span className="text-slate-400">({item.doctorLimit} lic)</span></span>
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

              <div className="border-t border-slate-100 pt-1 mt-1">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">License Usage</p>
                  <button onClick={() => setShowAssignModal(true)} disabled={!subscription || availableDoctorsForLicense.length === 0} className="px-1.5 py-0.5 text-[9px] font-medium text-[#1e3a5f] bg-[#1e3a5f]/10 rounded hover:bg-[#1e3a5f]/20 disabled:opacity-50">+ Assign</button>
                </div>
                {licenseStats && licenseStats.byProduct.length > 0 ? (
                  <div className="space-y-1">
                    {licenseStats.byProduct.map(p => (
                      <div key={p.productCode}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-slate-600">{p.productName}</span>
                          <span className="text-slate-500">{p.usedLicenses}/{p.totalLicenses}</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1">
                          <div className="bg-[#1e3a5f] h-1 rounded-full" style={{ width: `${p.totalLicenses > 0 ? (p.usedLicenses / p.totalLicenses) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-slate-400 py-0.5">No license data</p>}
              </div>

              {licenses.filter(l => l.status === 'ACTIVE').length > 0 && (
                <div className="border-t border-slate-100 pt-1 mt-1">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Active Licenses</p>
                  <div className="space-y-0.5">
                    {licenses.filter(l => l.status === 'ACTIVE').map(lic => (
                      <div key={lic.id} className="flex items-center justify-between py-0.5">
                        <span className="text-slate-600">Dr. {lic.doctorName} <span className="text-slate-400">({lic.productName})</span></span>
                        <button onClick={() => revokeLicense(lic.id)} className="text-[9px] text-red-500 hover:underline">Revoke</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Card 3: Legal, Tax & Compliance ── */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1.5 bg-[#1e3a5f]">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold text-white">Legal, Tax & Compliance</h3>
                {cardMsg('legal')}
              </div>
              {canEditSettings && (
                <button onClick={() => setLegalComplianceEditMode(true)} className="px-2 py-0.5 text-[10px] text-white bg-white/20 rounded hover:bg-white/30 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  Edit
                </button>
              )}
            </div>
            <div className="p-2 text-[11px]">
              <InfoRow label="Legal Entity" value={hospital.legalEntityName} />
              <InfoRow label="Billing Contact" value={hospital.billingContactEmail} />
              <InfoRow label="Tax ID Type" value={availableTaxIdTypes.find(t => t.value === hospital.taxIdType)?.label || hospital.taxIdType} />
              <InfoRow label="Tax ID Value" value={hospital.taxIdValue} />
              <div className="border-t border-slate-100 pt-1 mt-1">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Compliance</p>
                <InfoRow label="Stores PHI" value={hospital.storesPhi ? 'Yes' : 'No'} />
                <InfoRow label="Patient Volume" value={hospital.estimatedPatientVolume ? `${hospital.estimatedPatientVolume}/mo` : undefined} />
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
              {signedDocs.length > 0 && (
                <div className="border-t border-slate-100 pt-1 mt-1">
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
                        </div>
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
      {/* HOSPITAL MANAGER TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'manager' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Profile Card */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1.5 bg-[#1e3a5f]">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold text-white">My Profile</h3>
                {cardMsg('profile')}
              </div>
              {profileEditMode ? (
                <div className="flex gap-1">
                  <button onClick={() => setProfileEditMode(false)} className="px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10 rounded">Cancel</button>
                  <button onClick={saveProfile} disabled={profileSaving} className="px-2 py-0.5 text-[10px] text-white bg-white/20 rounded hover:bg-white/30 disabled:opacity-50">{profileSaving ? '...' : 'Save'}</button>
                </div>
              ) : (
                <button onClick={() => setProfileEditMode(true)} className="px-2 py-0.5 text-[10px] text-white bg-white/20 rounded hover:bg-white/30 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  Edit
                </button>
              )}
            </div>
            <div className="p-2">
            {profileEditMode ? (
              <form onSubmit={saveProfile} className="space-y-1.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <input value={profileForm.firstName} onChange={e => setProfileForm({ ...profileForm, firstName: e.target.value })} placeholder="First Name" className="w-full px-1.5 py-0.5 text-[11px] border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  <input value={profileForm.lastName} onChange={e => setProfileForm({ ...profileForm, lastName: e.target.value })} placeholder="Last Name" className="w-full px-1.5 py-0.5 text-[11px] border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500" />
                </div>
                <input value={profile?.email || ''} disabled className="w-full px-1.5 py-0.5 text-[11px] border border-slate-200 rounded bg-slate-50 text-slate-400" />
                <PhoneInput value={profileForm.phone} onChange={(value) => setProfileForm({ ...profileForm, phone: value })} placeholder="Phone number" />
              </form>
            ) : (
              <div className="space-y-1.5 text-[11px]">
                <div><span className="text-slate-400 w-16 inline-block">Name</span><span className="text-slate-700 font-medium">{profile?.fullName || '—'}</span></div>
                <div><span className="text-slate-400 w-16 inline-block">Email</span><span className="text-slate-700">{profile?.email}</span></div>
                <div><span className="text-slate-400 w-16 inline-block">Phone</span><span className="text-slate-700">{profile?.phone || '—'}</span></div>
                <div><span className="text-slate-400 w-16 inline-block">Role</span><span className="text-slate-700">{profile?.isSuperAdmin ? 'Super Admin' : 'Hospital Manager'}</span></div>
              </div>
            )}
            </div>
          </div>

          {/* Account & Security Card */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-2 py-1.5 bg-[#1e3a5f]">
              <h3 className="text-[11px] font-semibold text-white">Account & Security</h3>
            </div>
            <div className="p-2">
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
                <div>
                  <p className="font-medium text-slate-700">Password</p>
                  <p className="text-[10px] text-slate-400">Last changed: Unknown</p>
                </div>
                <button className="px-2 py-1 text-[10px] text-slate-600 border border-slate-200 rounded hover:bg-white">Change</button>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
                <div>
                  <p className="font-medium text-slate-700">Two-Factor Auth</p>
                  <p className="text-[10px] text-slate-400">Not enabled</p>
                </div>
                <button className="px-2 py-1 text-[10px] text-slate-600 border border-slate-200 rounded hover:bg-white">Enable</button>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* HOSPITAL STAFF TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'staff' && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-2 py-1.5 bg-[#1e3a5f]">
            <div className="flex items-center gap-2">
              <h3 className="text-[11px] font-semibold text-white">Staff Members</h3>
              <span className="px-1.5 py-0.5 bg-emerald-400/30 text-emerald-200 text-[9px] font-medium rounded">{activeStaff} active</span>
              {cardMsg('staff')}
            </div>
            <button onClick={() => { setEditingStaff(null); setStaffForm({ email: '', password: '', firstName: '', lastName: '', title: '', phone: '' }); setStaffAssignAll(true); setStaffSelectedDoctorIds([]); setShowStaffModal(true); }} className="px-2 py-1 text-[10px] font-medium text-white bg-white/20 rounded hover:bg-white/30">+ Add</button>
          </div>
          <div className="max-h-[200px] overflow-auto">
            {staff.length > 0 ? (
              <div className="overflow-x-auto">
              <table className="w-full text-[11px] min-w-[500px]">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Name</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Title</th>
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
                      <td className="px-3 py-1.5 text-slate-500">{s.title || '—'}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${!s.assignedDoctorIds || s.assignedDoctorIds.length === 0 ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                          {!s.assignedDoctorIds || s.assignedDoctorIds.length === 0 ? 'All' : `${s.assignedDoctorIds.length}`}
                        </span>
                      </td>
                      <td className="px-3 py-1.5"><span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${s.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{s.status}</span></td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        <button onClick={() => { setEditingStaff(s); const nameParts = (s.displayName || '').split(' '); const firstName = nameParts[0] || ''; const lastName = nameParts.slice(1).join(' ') || ''; setStaffForm({ email: s.email, password: '', firstName, lastName, title: s.title || '', phone: s.phone || '' }); if (s.assignedDoctorIds && s.assignedDoctorIds.length > 0) { setStaffAssignAll(false); setStaffSelectedDoctorIds(s.assignedDoctorIds); } else { setStaffAssignAll(true); setStaffSelectedDoctorIds([]); } setShowStaffModal(true); }} className="px-2 py-0.5 text-[10px] font-medium text-navy-600 border border-navy-200 rounded hover:bg-navy-50">Edit</button>
                        <button onClick={() => { setPasswordResetStaff(s); setResetPassword(''); setShowPasswordResetModal(true); }} className="px-2 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200 rounded hover:bg-amber-50 mr-1">Reset Pwd</button>
                        <button onClick={() => toggleStaffStatus(s)} className={`px-2 py-0.5 text-[10px] font-medium rounded mr-1 ${s.status === 'ACTIVE' ? 'text-orange-700 border border-orange-200 hover:bg-orange-50' : 'text-emerald-700 border border-emerald-200 hover:bg-emerald-50'}`}>{s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>
                        <button onClick={() => deleteStaff(s.id)} className="px-2 py-0.5 text-[10px] font-medium text-red-600 border border-red-200 rounded hover:bg-red-50">Delete</button>
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
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* DOCTORS TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'doctors' && (
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-medium rounded">{activeDoctors} active</span>
              {pendingInvites.length > 0 && <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[9px] font-medium rounded">{pendingInvites.length} pending</span>}
            </div>
            <button onClick={() => setShowInviteModal(true)} className="px-2 py-1 text-[10px] font-medium text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-dark)]">+ Invite Doctor</button>
          </div>

          {/* Doctor Cards Grid */}
          {doctors.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-auto">
              {doctors.map(d => (
                <div key={d.id} className="bg-white rounded-lg border border-slate-200 p-3 hover:border-slate-300 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center text-navy-700 text-xs font-semibold">
                        {(d.fullName || d.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Dr. {d.fullName || d.email.split('@')[0]}</p>
                        <p className="text-[10px] text-slate-400">{d.specialty || 'General'}</p>
                      </div>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                      d.complianceStatus === 'compliant' || !d.complianceStatus ? 'bg-emerald-50 text-emerald-700' :
                      d.complianceStatus === 'pending_signatures' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {d.complianceStatus === 'compliant' || !d.complianceStatus ? 'Active' : d.complianceStatus === 'pending_signatures' ? 'Pending' : 'Not Logged In'}
                    </span>
                  </div>
                  <div className="space-y-1 text-[10px] mb-2">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      <span className="truncate">{d.email}</span>
                    </div>
                    {d.phone && (
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        <span>{d.phone}</span>
                      </div>
                    )}
                    {d.licenseNumber && (
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" /></svg>
                        <span>Lic: {d.licenseNumber}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      <span>Joined {new Date(d.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Link href={`/hospital/doctors/${d.userId}`} className="block w-full text-center px-2 py-1 text-[10px] font-medium text-[var(--color-primary)] border border-[var(--color-primary)] rounded hover:bg-[var(--color-primary)] hover:text-white transition-colors">
                    View Profile & Schedule
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 py-8 text-center">
              <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-xs text-slate-500">No doctors yet</p>
              <p className="text-[10px] text-slate-400">Invite doctors to join your hospital</p>
            </div>
          )}

          {/* Pending Invites */}
          {pendingInvites.length > 0 && (
            <div className="bg-amber-50 rounded-lg border border-amber-200 p-2">
              <p className="text-[10px] font-medium text-amber-800 mb-1">Pending Invites</p>
              <div className="flex flex-wrap gap-1">
                {pendingInvites.map(inv => (
                  <div key={inv.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded text-[10px] text-slate-600">
                    {inv.invitedEmail}
                    <button onClick={() => revokeInvite(inv.id)} className="text-red-500 hover:text-red-700 ml-1">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PATIENTS TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'patients' && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-2 py-1.5 bg-[#1e3a5f]">
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input value={patientSearch} onChange={e => setPatientSearch(e.target.value)} placeholder="Search patients..." className="pl-7 pr-2 py-1 text-[10px] border border-white/20 rounded bg-white/10 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-white/40 w-40" />
              </div>
              <span className="px-1.5 py-0.5 bg-emerald-400/30 text-emerald-200 text-[9px] font-medium rounded">{activePatients} active</span>
              {cardMsg('patients')}
            </div>
            <button onClick={() => { setEditingPatient(null); setPatientForm({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '' }); setShowPatientModal(true); }} className="px-2 py-1 text-[10px] font-medium text-white bg-white/20 rounded hover:bg-white/30">+ Add Patient</button>
          </div>
          <div className="max-h-[220px] overflow-auto">
            {filteredPatients.length > 0 ? (
              <div className="overflow-x-auto">
              <table className="w-full text-[11px] min-w-[500px]">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Patient</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Contact</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">DOB</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500 hidden sm:table-cell">Gender</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Status</th>
                    <th className="px-3 py-1.5 text-right text-[10px] font-medium text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPatients.map(p => (
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
                      <td className="px-3 py-1.5 text-slate-500 hidden sm:table-cell">{p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-1.5 text-slate-500 capitalize hidden sm:table-cell">{p.gender || '—'}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${p.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{p.status}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button onClick={() => { setEditingPatient(p); setPatientForm({ firstName: p.firstName, lastName: p.lastName, email: p.email || '', phone: p.phone || '', dateOfBirth: p.dateOfBirth || '', gender: p.gender || '' }); setShowPatientModal(true); }} className="text-navy-600 hover:underline mr-2">Edit</button>
                        <button onClick={() => togglePatientStatus(p)} className={`hover:underline mr-2 ${p.status === 'active' ? 'text-amber-600' : 'text-emerald-600'}`}>{p.status === 'active' ? 'Deactivate' : 'Activate'}</button>
                        <Link href={`/hospital/patients?id=${p.id}`} className="text-slate-500 hover:underline">View</Link>
                      </td>
                    </tr>
                  ))}
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
          <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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

      {/* Assign License Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAssignModal(false)}>
          <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Assign License</h2>
            <form onSubmit={assignLicense} className="space-y-3">
              <select value={assignForm.productCode} onChange={e => setAssignForm({ ...assignForm, productCode: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500">
                {subscription?.items.map(item => (
                  <option key={item.productCode} value={item.productCode}>{item.productName}</option>
                ))}
              </select>
              <select value={assignForm.doctorId} onChange={e => setAssignForm({ ...assignForm, doctorId: e.target.value })} required className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500">
                <option value="">Select doctor...</option>
                {availableDoctorsForLicense.map(d => (
                  <option key={d.userId} value={d.userId}>Dr. {d.fullName || d.email}</option>
                ))}
              </select>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAssignModal(false)} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={assigning || !assignForm.doctorId} className="flex-1 py-2 text-xs font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 disabled:opacity-50">{assigning ? 'Assigning...' : 'Assign'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Patient Modal */}
      {showPatientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowPatientModal(false)}>
          <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-4" onClick={e => e.stopPropagation()}>
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
          <div className="w-full max-w-lg bg-white rounded-lg shadow-xl p-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Edit Hospital Information</h2>
            {message?.source === 'general' && (
              <div className={`mb-3 px-3 py-2 rounded text-xs ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Hospital Name *</label>
                <input value={hospital.name || ''} onChange={e => setHospital({ ...hospital, name: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Phone</label>
                  <PhoneInput value={hospital.phone || ''} onChange={(value) => setHospital({ ...hospital, phone: value })} placeholder="Phone number" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Email</label>
                  <input type="email" value={hospital.email || ''} onChange={e => setHospital({ ...hospital, email: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Website</label>
                <input value={hospital.website || ''} onChange={e => setHospital({ ...hospital, website: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
              </div>

              <div className="border-t pt-3">
                <p className="text-[11px] font-semibold text-slate-700 mb-2">Address</p>
                <div className="space-y-2">
                  <input value={hospital.addressLine1 || ''} onChange={e => setHospital({ ...hospital, addressLine1: e.target.value })} placeholder="Address Line 1 *" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  <input value={hospital.addressLine2 || ''} onChange={e => setHospital({ ...hospital, addressLine2: e.target.value })} placeholder="Address Line 2" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={hospital.country || ''} onChange={e => setHospital({ ...hospital, country: e.target.value, state: '' })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white">
                      <option value="">Country *</option>
                      {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                    <select value={hospital.state || ''} onChange={e => setHospital({ ...hospital, state: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white">
                      <option value="">State *</option>
                      {getStatesForCountry(hospital.country || '').map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={hospital.city || ''} onChange={e => setHospital({ ...hospital, city: e.target.value })} placeholder="City *" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    <input value={hospital.postal || ''} onChange={e => setHospital({ ...hospital, postal: e.target.value })} placeholder="Postal Code *" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  </div>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-[11px] font-semibold text-slate-700 mb-2">Classification</p>
                <div className="space-y-2">
                  <select value={hospital.hospitalType || ''} onChange={e => setHospital({ ...hospital, hospitalType: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white">
                    <option value="">Hospital Type *</option>
                    {hospitalTypeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Specialties *</label>
                    <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1">
                      {specializations.map(s => (
                        <label key={s.id} className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                          <input
                            type="checkbox"
                            checked={selectedSpecialtyIds.includes(s.id)}
                            onChange={e => {
                              if (e.target.checked) setSelectedSpecialtyIds([...selectedSpecialtyIds, s.id]);
                              else setSelectedSpecialtyIds(selectedSpecialtyIds.filter(id => id !== s.id));
                            }}
                            className="w-3 h-3"
                          />
                          {s.name}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setGeneralEditMode(false); setHospital(originalHospital); setSelectedSpecialtyIds((originalHospital.specialties || []).map((s: any) => s.id)); }} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={saveHospitalInfoAll} disabled={generalSaving} className="flex-1 py-2 text-xs font-medium text-white bg-[#1e3a5f] rounded-lg hover:bg-[#162f4d] disabled:opacity-50">{generalSaving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Billing Address Edit Modal */}
      {billingAddressEditMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setBillingAddressEditMode(false); setHospital(originalHospital); }}>
          <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Edit Billing Address</h2>
            {message?.source === 'billing' && (
              <div className={`mb-3 px-3 py-2 rounded text-xs ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</div>
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
          <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Edit Legal, Tax & Compliance</h2>
            {message?.source === 'legal' && (
              <div className={`mb-3 px-3 py-2 rounded text-xs ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Legal Entity Name</label>
                <input value={hospital.legalEntityName || ''} onChange={e => setHospital({ ...hospital, legalEntityName: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Billing Contact Email</label>
                <input type="email" value={hospital.billingContactEmail || ''} onChange={e => setHospital({ ...hospital, billingContactEmail: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Tax ID Type</label>
                  <select value={hospital.taxIdType || ''} onChange={e => setHospital({ ...hospital, taxIdType: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white">
                    <option value="">Select...</option>
                    {availableTaxIdTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Tax ID Value</label>
                  <input value={hospital.taxIdValue || ''} onChange={e => setHospital({ ...hospital, taxIdValue: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-[11px] font-semibold text-slate-700 mb-2">Compliance</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hospital.storesPhi || false}
                      onChange={e => setHospital({ ...hospital, storesPhi: e.target.checked })}
                      className="w-3 h-3"
                    />
                    Stores Protected Health Information (PHI)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Patient Volume / Month</label>
                      <input type="number" value={hospital.estimatedPatientVolume || ''} onChange={e => setHospital({ ...hospital, estimatedPatientVolume: e.target.value ? Number(e.target.value) : undefined })} placeholder="e.g. 500" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Data Retention (days)</label>
                      <input type="number" value={hospital.dataRetentionDays || ''} onChange={e => setHospital({ ...hospital, dataRetentionDays: e.target.value ? Number(e.target.value) : undefined })} placeholder="e.g. 2555" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-[11px] font-semibold text-slate-700 mb-2">Insurance</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Insurance Provider</label>
                    <input value={hospital.insuranceProvider || ''} onChange={e => setHospital({ ...hospital, insuranceProvider: e.target.value })} placeholder="e.g. Blue Cross" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Policy Number</label>
                    <input value={hospital.insurancePolicyNumber || ''} onChange={e => setHospital({ ...hospital, insurancePolicyNumber: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  </div>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-[11px] font-semibold text-slate-700 mb-2">Accreditation</p>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Accreditation Body</label>
                      <input value={hospital.accreditationBody || ''} onChange={e => setHospital({ ...hospital, accreditationBody: e.target.value })} placeholder="e.g. Joint Commission" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Accreditation Number</label>
                      <input value={hospital.accreditationNumber || ''} onChange={e => setHospital({ ...hospital, accreditationNumber: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Accreditation Expiry</label>
                    <input type="date" value={hospital.accreditationExpiry || ''} onChange={e => setHospital({ ...hospital, accreditationExpiry: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  </div>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-[11px] font-semibold text-slate-700 mb-2">Hospital License</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">License Number</label>
                    <input value={hospital.licenseNumber || ''} onChange={e => setHospital({ ...hospital, licenseNumber: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">License Expiry</label>
                    <input type="date" value={hospital.licenseExpiry || ''} onChange={e => setHospital({ ...hospital, licenseExpiry: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-navy-500" />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setLegalComplianceEditMode(false); setHospital(originalHospital); }} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={saveLegalCompliance} disabled={legalComplianceSaving} className="flex-1 py-2 text-xs font-medium text-white bg-[#1e3a5f] rounded-lg hover:bg-[#162f4d] disabled:opacity-50">{legalComplianceSaving ? 'Saving...' : 'Save Changes'}</button>
              </div>
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

      {/* Document Viewer Modal */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setViewingDoc(null)}>
          <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">{viewingDoc.docTitle}</h3>
                <p className="text-[10px] text-slate-400">Version {viewingDoc.version} &middot; Signed by {viewingDoc.signerName} on {new Date(viewingDoc.acceptedAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const blob = new Blob([viewingDoc.contentMarkdown], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${viewingDoc.docTitle.replace(/\s+/g, '_')}_${viewingDoc.version}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-2 py-1 text-[10px] font-medium text-[#1e3a5f] bg-[#1e3a5f]/10 rounded hover:bg-[#1e3a5f]/20"
                >
                  Download
                </button>
                <button onClick={() => setViewingDoc(null)} className="p-1 text-slate-400 hover:text-slate-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto flex-1 prose prose-sm max-w-none text-slate-700 text-xs leading-relaxed whitespace-pre-wrap">
              {viewingDoc.contentMarkdown}
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
