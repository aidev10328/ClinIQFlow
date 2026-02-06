'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import { useRbac } from '../../../lib/rbac/RbacContext';
import { COUNTRIES, COUNTRY_NAME_TO_CODE } from '../../../lib/countries';
import { getStatesForCountry, getStateName } from '../../../lib/countryStateData';
import PhoneInput from '../../../components/PhoneInput';
import { useHospitalTimezone } from '../../../hooks/useHospitalTimezone';

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TYPES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// Custom dropdown matching dashboard chart select style

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

type TabType = 'details' | 'manager' | 'staff';

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MAIN COMPONENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function HospitalAdministrationContent() {
  const searchParams = useSearchParams();
  const { currentHospital, currentHospitalId, profile, refreshProfile } = useAuth();
  const { canEdit } = useRbac();
  const { getCurrentTime, formatShortDate } = useHospitalTimezone();
  const canEditSettings = canEdit('hospital.settings');
  const isManager = profile?.isSuperAdmin || currentHospital?.role === 'HOSPITAL_MANAGER';

  // â”€â”€â”€ STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // Search & Pagination
  const [managerSearch, setManagerSearch] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [managerPage, setManagerPage] = useState(1);
  const [staffPage, setStaffPage] = useState(1);
  const ROWS_PER_PAGE = 10;

  // â”€â”€â”€ AUTO-DISMISS BANNERS AFTER 10 SECONDS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ ACCESS CHECK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ DATA FETCHING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    async function fetchAll() {
      if (!currentHospitalId) return;
      try {
        const [hospRes, staffRes, membersRes, invitesRes, subRes, statsRes, licRes, specRes] = await Promise.all([
          apiFetch(`/v1/hospitals/${currentHospitalId}`),
          apiFetch('/v1/staff'),
          apiFetch('/v1/hospitals/members/compliance'),
          apiFetch('/v1/invites/pending'),
          apiFetch('/v1/products/subscription'),
          apiFetch('/v1/products/subscription/license-stats'),
          apiFetch('/v1/products/licenses'),
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
          setPendingManagerInvites(inv.filter((i: Invite) => i.status === 'PENDING' && i.role === 'HOSPITAL_MANAGER'));
        }
        if (subRes.ok) setSubscription(await subRes.json());
        if (statsRes.ok) setLicenseStats(await statsRes.json());
        if (licRes.ok) setLicenses(await licRes.json());

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
    if (tab && ['details', 'manager', 'staff'].includes(tab)) setActiveTab(tab as TabType);
  }, [currentHospitalId, profile, searchParams]);


  // â”€â”€â”€ HANDLERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  function toggleStaffStatus(s: StaffMember) {
    const newStatus = s.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const action = s.status === 'ACTIVE' ? 'deactivate' : 'activate';
    setConfirmDialog({
      title: `${s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} Staff Member`,
      message: `Are you sure you want to ${action} ${s.displayName || s.email}?`,
      destructive: s.status === 'ACTIVE',
      onConfirm: async () => {
        await apiFetch(`/v1/staff/${s.id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
        const r = await apiFetch('/v1/staff');
        if (r.ok) setStaff(await r.json());
      },
    });
  }

  async function handleRevokeLicense(licenseId: string) {
    setRevokingLicenseId(licenseId);
    try {
      const res = await apiFetch(`/v1/products/licenses/${licenseId}`, { method: 'DELETE' });
      if (res.ok) {
        const [statsRes, licRes] = await Promise.all([
          apiFetch('/v1/products/subscription/license-stats'),
          apiFetch('/v1/products/licenses'),
        ]);
        if (statsRes.ok) setLicenseStats(await statsRes.json());
        if (licRes.ok) setLicenses(await licRes.json());
        setMessage({ type: 'success', text: 'License revoked', source: 'doctors' });
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

  // â”€â”€â”€ COMPUTED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const activeStaff = staff.filter(s => s.status === 'ACTIVE').length;
  const availableDoctorsForLicense = doctors.filter(d => !licenses.some(l => l.doctorId === d.userId && l.productCode === assignForm.productCode && l.status === 'ACTIVE'));
  const assignTargetDoctor = assignForm.doctorId ? doctors.find(d => d.userId === assignForm.doctorId) : null;
  const assignTargetLicenses = assignForm.doctorId ? licenses.filter(l => l.doctorId === assignForm.doctorId && l.status === 'ACTIVE') : [];
  const unassignedProducts = subscription ? subscription.items.filter(i => !assignTargetLicenses.some(l => l.productCode === i.productCode)) : [];

  // Filtered lists
  const filteredManagers = managers.filter(m => {
    if (!managerSearch) return true;
    const q = managerSearch.toLowerCase();
    return (m.fullName || '').toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });
  const filteredStaffMembers = staff.filter(s => {
    if (!staffSearch) return true;
    const q = staffSearch.toLowerCase();
    return s.displayName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  // Paginated slices
  const pagedManagers = filteredManagers.slice((managerPage - 1) * ROWS_PER_PAGE, managerPage * ROWS_PER_PAGE);
  const managerTotalPages = Math.max(1, Math.ceil(filteredManagers.length / ROWS_PER_PAGE));
  const pagedStaff = filteredStaffMembers.slice((staffPage - 1) * ROWS_PER_PAGE, staffPage * ROWS_PER_PAGE);
  const staffTotalPages = Math.max(1, Math.ceil(filteredStaffMembers.length / ROWS_PER_PAGE));

  function fmt(amt: number, cur = 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(amt);
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
      <div class="meta">Version ${doc.version} &middot; Signed by ${doc.signerName} on ${formatShortDate(doc.acceptedAt)}</div>
      ${html}
    </body></html>`;
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(fullHtml);
      w.document.close();
      setTimeout(() => w.print(), 300);
    }
  }

  // Consistent form field styles â€” prevents layout shift between view/edit modes
  const fieldClass = (editing: boolean) =>
    `w-full px-1.5 py-0.5 text-[11px] border border-slate-200 rounded ${editing ? 'bg-white focus:outline-none focus:ring-1 focus:ring-navy-500' : 'bg-slate-50 text-slate-700 cursor-default'}`;
  const selectFieldClass = (editing: boolean) =>
    `w-full px-1.5 py-0.5 text-[11px] border border-slate-200 rounded ${editing ? 'bg-white focus:outline-none focus:ring-1 focus:ring-navy-500' : 'bg-slate-50 text-slate-700 cursor-default opacity-100'}`;
  const cardMsg = (source: string) => message?.source === source ? (
    <span className={`text-[9px] px-1.5 py-0.5 rounded ${message.type === 'success' ? 'bg-sky-400/20 text-sky-100' : 'bg-red-400/20 text-red-200'}`}>{message.text}</span>
  ) : null;

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

  const InfoRow = ({ label, value }: { label: string; value?: string | number | null }) => (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-slate-900 text-[10px] shrink-0">{label}</span>
      {!dataLoaded ? (
        <span className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
      ) : (
        <span className="text-slate-700 font-medium text-right truncate">{value || 'â€”'}</span>
      )}
    </div>
  );

  // Placeholder rows for tables while loading â€” keeps table height stable
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

  // â”€â”€â”€ RENDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const countBadge = (n: number, active: boolean) => (
    <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-[#1e3a5f]/10 text-[#1e3a5f]/60'}`}>{n}</span>
  );
  const tabs: { id: TabType; label: string; count?: number; renderLabel?: (active: boolean) => React.ReactNode }[] = [
    { id: 'details', label: 'Hospital Details' },
    { id: 'manager', label: 'Staff', count: managers.length + staff.length },
  ];

  return (
    <div className="page-fullheight flex flex-col overflow-auto lg:overflow-hidden p-2 gap-1">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-sm font-semibold text-slate-800">Hospital Administration</h1>
        <p className="text-[10px] text-slate-400">Manage hospital details, billing, subscriptions, staff &amp; settings</p>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 gap-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold transition-all text-center rounded-md ${
              activeTab === t.id
                ? 'bg-[#1e3a5f] text-white shadow-sm'
                : 'bg-white border border-[#1e3a5f]/30 text-[#1e3a5f]/70 hover:text-[#1e3a5f] hover:border-[#1e3a5f]/50'
            }`}
          >
            {t.renderLabel ? t.renderLabel(activeTab === t.id) : t.label}
            {t.count !== undefined && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold ${activeTab === t.id ? 'bg-white/20 text-white' : 'bg-[#1e3a5f]/10 text-[#1e3a5f]/60'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {/* HOSPITAL DETAILS TAB */}
      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {activeTab === 'details' && (
        <div className="flex-1 lg:min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-2">

          {/* â”€â”€ Card 1: Hospital Information (compact) â”€â”€ */}
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
              {(logoPreview || picturePreview) && (
                <div className="flex items-center gap-3 mb-2 pb-2 border-b border-slate-100">
                  {logoPreview && (
                    <div className="shrink-0">
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Logo</p>
                      <img src={logoPreview} alt="Hospital Logo" className="h-12 w-12 object-contain rounded border border-slate-200 bg-white" />
                    </div>
                  )}
                  {picturePreview && (
                    <div className="shrink-0">
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Picture</p>
                      <img src={picturePreview} alt="Hospital" className="h-12 w-20 object-cover rounded border border-slate-200" />
                    </div>
                  )}
                </div>
              )}
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
                  <span className="text-slate-700 font-medium text-right truncate text-[11px]">{getStatesForCountry(hospital.country || '').find(s => s.code === hospital.state)?.name || hospital.state || 'â€”'}{hospital.postal ? `, ${hospital.postal}` : ''}</span>
                </div>
                <InfoRow label="Country" value={COUNTRIES.find(c => c.code === hospital.country)?.name || hospital.country} />
              </div>
            </div>
          </div>

          {/* â”€â”€ Card 2: Billing & Subscriptions + Licenses â”€â”€ */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden lg:row-span-2 flex flex-col lg:min-h-0">
            <div className="flex items-center justify-between px-2 py-1.5 bg-[#f0f7ff] shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold text-slate-800">Billing and Subscriptions</h3>
                {cardMsg('billing')}
              </div>
              <div className="flex items-center gap-1">
                {canEditSettings && subscription && (
                  <button onClick={() => setShowAssignModal(true)} className="px-2 py-0.5 text-[10px] text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d] flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Assign License
                  </button>
                )}
                {canEditSettings && (
                  <button onClick={() => setBillingAddressEditMode(true)} className="px-2 py-0.5 text-[10px] text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d] flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    Edit
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 lg:min-h-0 lg:overflow-auto p-2 text-[11px]">
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Billing Address</p>
              {sameAsHospitalAddress && <span className="text-[9px] text-[#5a8a4f] font-medium block mb-0.5">Same as hospital address</span>}
              <InfoRow label="Street" value={hospital.billingAddressLine1} />
              {hospital.billingAddressLine2 && <InfoRow label="Line 2" value={hospital.billingAddressLine2} />}
              <InfoRow label="City" value={hospital.billingCity} />
              <div className="flex justify-between gap-2 py-0.5">
                <span className="text-slate-900 text-[10px] shrink-0">State / Postal</span>
                <span className="text-slate-700 font-medium text-right truncate text-[11px]">{getStatesForCountry(hospital.billingCountry || '').find(s => s.code === hospital.billingState)?.name || hospital.billingState || 'â€”'}{hospital.billingPostal ? `, ${hospital.billingPostal}` : ''}</span>
              </div>
              <InfoRow label="Country" value={COUNTRIES.find(c => c.code === hospital.billingCountry)?.name || hospital.billingCountry} />

              <div className="border-t border-slate-100 pt-1 mt-1">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Subscription</p>
                  {subscription && <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${subscription.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : subscription.status === 'TRIAL' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{subscription.status}</span>}
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
                    <InfoRow label="Started" value={formatShortDate(subscription.billingCycleStart)} />
                    <InfoRow label="Next Billing" value={formatShortDate(subscription.billingCycleEnd)} />
                    {subscription.trialEndsAt && <InfoRow label="Trial Ends" value={formatShortDate(subscription.trialEndsAt)} />}
                    {subscription.cancelledAt && <InfoRow label="Cancelled" value={formatShortDate(subscription.cancelledAt)} />}
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
                  </>
                ) : <p className="text-slate-400 py-0.5">No active subscription</p>}
              </div>

              {/* â”€â”€ Licenses Section â”€â”€ */}
              <div className="border-t border-slate-100 pt-1 mt-1">
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

          {/* â”€â”€ Card 3: Legal, Tax & Compliance â”€â”€ */}
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
                          <span className="text-slate-400 text-[9px]">{formatShortDate(doc.acceptedAt)}</span>
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
                <InfoRow label="Expiry" value={hospital.accreditationExpiry ? formatShortDate(hospital.accreditationExpiry + 'T12:00:00') : undefined} />
              </div>
              <div className="border-t border-slate-100 pt-1 mt-1">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Hospital License</p>
                <InfoRow label="License No." value={hospital.licenseNumber} />
                <InfoRow label="Expiry" value={hospital.licenseExpiry ? formatShortDate(hospital.licenseExpiry + 'T12:00:00') : undefined} />
              </div>
            </div>
          </div>


        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {/* HOSPITAL MANAGERS & STAFF TAB */}
      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {activeTab === 'manager' && (
        <div className="flex-1 lg:min-h-0 flex flex-col gap-2">
          {/* Hospital Managers Table â€” top half */}
          <div className="flex-1 min-h-0 bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-2 py-1.5 bg-[#f0f7ff] shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold text-slate-800">Hospital Managers</h3>
                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-medium rounded">{managers.filter(m => m.status === 'ACTIVE').length} active</span>
                <SearchInput value={managerSearch} onChange={v => { setManagerSearch(v); setManagerPage(1); }} placeholder="Search managers..." />
                {cardMsg('profile')}
              </div>
              <button onClick={() => { setInviteManagerEmail(''); setInviteManagerFirstName(''); setInviteManagerLastName(''); setShowInviteManagerModal(true); }} className="px-2 py-1 text-[10px] font-medium text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d]">+ Invite Hospital Manager</button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {!dataLoaded ? (
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
              ) : (pagedManagers.length > 0 || pendingManagerInvites.length > 0) ? (
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Name</th>
                      <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Status</th>
                      <th className="px-3 py-1.5 text-right text-[10px] font-medium text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedManagers.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-700">{m.fullName || 'â€”'}</span>
                            {m.isPrimary && <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[9px] font-medium rounded">Primary</span>}
                          </div>
                          <div className="text-[10px] text-slate-400">{m.email}</div>
                        </td>
                        <td className="px-3 py-1.5"><span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${m.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{m.status}</span></td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => { setEditingManager(m); const nameParts = (m.fullName || '').split(' '); setProfileForm({ firstName: nameParts[0] || '', lastName: nameParts.slice(1).join(' ') || '', phone: '' }); setShowEditManagerModal(true); }} className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold rounded border border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100 transition-colors"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>Edit</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {managerPage === managerTotalPages && pendingManagerInvites.map(inv => (
                      <tr key={inv.id} className="hover:bg-amber-50/30 bg-amber-50/20">
                        <td className="px-3 py-1.5">
                          <div className="font-medium text-slate-500">{inv.invitedEmail}</div>
                        </td>
                        <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 text-amber-700">PENDING INVITE</span></td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => revokeManagerInvite(inv.id)} className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold rounded border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>Revoke</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-6 text-center text-slate-400 text-xs">{managerSearch ? 'No managers match your search' : 'No hospital managers found'}</div>
              )}
            </div>
            <Pagination page={managerPage} totalPages={managerTotalPages} setPage={setManagerPage} />
          </div>

          {/* Staff Members Table â€” bottom half */}
          <div className="flex-1 min-h-0 bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-2 py-1.5 bg-[#f0f7ff] shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold text-slate-800">Staff Members</h3>
                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-medium rounded">{activeStaff} active</span>
                <SearchInput value={staffSearch} onChange={v => { setStaffSearch(v); setStaffPage(1); }} placeholder="Search staff..." />
                {cardMsg('staff')}
              </div>
              <button onClick={() => { setEditingStaff(null); setStaffForm({ email: '', password: '', firstName: '', lastName: '', title: '', phone: '' }); setStaffAssignAll(true); setStaffSelectedDoctorIds([]); setShowStaffModal(true); }} className="px-2 py-1 text-[10px] font-medium text-white bg-[#1e3a5f] rounded hover:bg-[#162f4d]">+ Invite Staff</button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {!dataLoaded ? (
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
              ) : pagedStaff.length > 0 ? (
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
                    {pagedStaff.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-3 py-1.5">
                          <div className="font-medium text-slate-700">{s.displayName}</div>
                          <div className="text-[10px] text-slate-400">{s.email}</div>
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="relative group inline-block">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-sky-50 text-sky-700 cursor-default">
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
                        <td className="px-3 py-1.5"><span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${s.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{s.status}</span></td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => { setEditingStaff(s); const nameParts = (s.displayName || '').split(' '); const firstName = nameParts[0] || ''; const lastName = nameParts.slice(1).join(' ') || ''; setStaffForm({ email: s.email, password: '', firstName, lastName, title: s.title || '', phone: s.phone || '' }); if (s.assignedDoctorIds && s.assignedDoctorIds.length > 0) { setStaffAssignAll(false); setStaffSelectedDoctorIds(s.assignedDoctorIds); } else { setStaffAssignAll(true); setStaffSelectedDoctorIds([]); } setShowStaffModal(true); }} className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold rounded border border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100 transition-colors"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>Edit</button>
                            <button onClick={() => { setPasswordResetStaff(s); setResetPassword(''); setShowPasswordResetModal(true); }} className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold rounded border border-amber-200 text-amber-800 bg-amber-50 hover:bg-amber-100 transition-colors"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>Reset</button>
                            <button onClick={() => toggleStaffStatus(s)} className={`min-w-[68px] inline-flex items-center justify-center gap-1 px-2 py-0.5 text-[9px] font-semibold rounded border transition-colors ${s.status === 'ACTIVE' ? 'border-red-200 text-red-600 bg-red-50 hover:bg-red-100' : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}>{s.status === 'ACTIVE' ? <><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>Deactivate</> : <><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Activate</>}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-6 text-center text-slate-400 text-xs">{staffSearch ? 'No staff match your search' : 'No staff members yet'}</div>
              )}
            </div>
            <Pagination page={staffPage} totalPages={staffTotalPages} setPage={setStaffPage} />
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {/* MODALS */}
      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}

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
              <PhoneInput value={profileForm.phone} onChange={(value) => setProfileForm({ ...profileForm, phone: value })} placeholder="Phone" />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowEditManagerModal(false); setEditingManager(null); }} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={profileSaving} className="flex-1 py-2 text-xs font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 disabled:opacity-50">{profileSaving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign License Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowAssignModal(false); setAssignDoctorSearch(''); setAssignProductOpen(false); setAssignDoctorOpen(false); }}>
          <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-5" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-4">{assignTargetDoctor ? 'License Management' : 'Assign License'}</h2>

            {/* Doctor Info Header (when opened from doctors table) */}
            {assignTargetDoctor && (
              <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="w-9 h-9 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {(assignTargetDoctor.fullName || assignTargetDoctor.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate">Dr. {assignTargetDoctor.fullName || 'Unknown'}</div>
                  <div className="text-[10px] text-slate-400 truncate">{assignTargetDoctor.email}</div>
                  {assignTargetDoctor.specialty && <div className="text-[10px] text-[#1e3a5f]/60 truncate">{assignTargetDoctor.specialty}</div>}
                </div>
              </div>
            )}

            {/* Already Assigned Licenses */}
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

            {/* Assign New License Form */}
            {assignTargetDoctor ? (
              unassignedProducts.length > 0 ? (
                <form onSubmit={assignLicense} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Assign New Product</label>
                    <div className="relative" ref={assignProductRef}>
                      <button type="button" onClick={() => { setAssignProductOpen(!assignProductOpen); }} className={`flex items-center w-full border bg-white cursor-pointer hover:border-[#2b5a8a] focus:outline-none focus:ring-1 focus:ring-[#a3cbef] transition-all text-xs rounded-lg px-3 py-2 ${assignProductOpen ? 'border-[#2b5a8a] ring-1 ring-[#a3cbef]' : 'border-slate-200'}`}>
                        <span className="flex-1 text-left truncate text-slate-900 font-medium">{unassignedProducts.find(i => i.productCode === assignForm.productCode)?.productName || unassignedProducts[0]?.productName || 'Select product...'}</span>
                        <svg className={`flex-shrink-0 w-3.5 h-3.5 text-slate-400 transition-transform ${assignProductOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      {assignProductOpen && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                          {unassignedProducts.map(item => (
                            <button type="button" key={item.productCode} onClick={() => { setAssignForm({ ...assignForm, productCode: item.productCode }); setAssignProductOpen(false); }} className={`w-full text-left px-3 py-2 text-xs transition-colors ${item.productCode === assignForm.productCode ? 'bg-[#1e3a5f] text-white font-medium' : 'text-slate-700 hover:bg-[#e8f4fc] hover:text-[#1e3a5f]'}`}>
                              {item.productName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => { setShowAssignModal(false); }} className="flex-1 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
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
              /* Fallback: full form with both dropdowns (e.g. from billing header) */
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
            )}
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
                  <p className="text-[10px] font-semibold text-slate-700 mb-1">Branding</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Logo</label>
                      <div className="flex items-center gap-2">
                        {logoPreview && <img src={logoPreview} alt="Logo" className="h-10 w-10 object-contain rounded border border-slate-200 bg-white shrink-0" />}
                        <label className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] text-slate-600 border border-dashed border-slate-300 rounded cursor-pointer hover:bg-slate-50">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          {logoPreview ? 'Change' : 'Upload'}
                          <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Hospital Picture</label>
                      <div className="flex items-center gap-2">
                        {picturePreview && <img src={picturePreview} alt="Hospital" className="h-10 w-16 object-cover rounded border border-slate-200 shrink-0" />}
                        <label className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] text-slate-600 border border-dashed border-slate-300 rounded cursor-pointer hover:bg-slate-50">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          {picturePreview ? 'Change' : 'Upload'}
                          <input ref={pictureInputRef} type="file" accept="image/*" onChange={handlePictureChange} className="hidden" />
                        </label>
                      </div>
                    </div>
                  </div>
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
                  <p className="text-[10px] text-slate-400 mt-0.5">Version {viewingDoc.version} &middot; Signed by {viewingDoc.signerName} on {formatShortDate(viewingDoc.acceptedAt)}</p>
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
