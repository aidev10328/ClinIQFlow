'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../components/AuthProvider';
import { apiFetch } from '../../../../lib/api';
import { PageHeader, Tabs, TabPanel, StatusBadge, Modal, LoadingState } from '../../../../components/admin/ui';
import PhoneInput from '../../../../components/PhoneInput';

interface Hospital {
  id: string;
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postal?: string;
  country: string;
  region: string;
  currency: string;
  timezone: string;
  status: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  pictureUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface Member {
  id: string;
  userId: string;
  role: string;
  isPrimary: boolean;
  status: string;
  createdAt: string;
  email?: string;
  fullName?: string;
  profile?: {
    email: string;
    fullName?: string;
  };
  // Compliance fields
  complianceStatus?: 'compliant' | 'pending_signatures' | 'not_logged_in';
  hasLoggedIn?: boolean;
  documentsRequired?: number;
  documentsSigned?: number;
}

interface Invite {
  id: string;
  invitedEmail: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface SubscriptionItem {
  id: string;
  productCode: string;
  productName: string;
  doctorLimit: number;
  pricePerDoctor: number;
  currency: string;
  monthlyTotal: number;
}

interface Subscription {
  id: string;
  status: string;
  billingCycleStart: string;
  billingCycleEnd: string;
  trialEndsAt: string | null;
  items: SubscriptionItem[];
  totalMonthly: number;
}

interface Product {
  id: string;
  code: string;
  name: string;
  pricing: { region: string; pricePerDoctorPerMonth: number; currency: string }[];
}

export default function HospitalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { session } = useAuth();
  const hospitalId = params.hospitalId as string;

  const [activeTab, setActiveTab] = useState('overview');
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Hospital>>({});
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const pictureInputRef = useRef<HTMLInputElement>(null);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'HOSPITAL_MANAGER' | 'DOCTOR'>('HOSPITAL_MANAGER');
  const [inviting, setInviting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  // Subscription modal state
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [subscriptionForm, setSubscriptionForm] = useState<{ productCode: string; doctorLimit: number; discountCode: string }[]>([]);
  const [updatingSubscription, setUpdatingSubscription] = useState(false);

  // Edit member modal state
  const [showEditMemberModal, setShowEditMemberModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editMemberForm, setEditMemberForm] = useState<{ isPrimary: boolean }>({ isPrimary: false });
  const [updatingMember, setUpdatingMember] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

  const fetchHospital = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch(`${API_BASE}/v1/hospitals/${hospitalId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHospital(data);
        setEditForm(data);
        setLogoPreview(data.logoUrl || null);
        setPicturePreview(data.pictureUrl || null);
      } else {
        setError('Failed to load hospital');
      }
    } catch (e: any) {
      setError(e.message);
    }
  }, [session?.access_token, hospitalId, API_BASE]);

  const fetchMembers = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      // Use compliance endpoint to get enhanced member data with status
      const res = await fetch(`${API_BASE}/v1/hospitals/${hospitalId}/members/compliance`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        setMembers(await res.json());
      } else {
        // Fallback to regular members endpoint
        const fallbackRes = await fetch(`${API_BASE}/v1/hospitals/${hospitalId}/members`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        if (fallbackRes.ok) {
          setMembers(await fallbackRes.json());
        }
      }
    } catch (e) {
      console.error('Failed to fetch members:', e);
    }
  }, [session?.access_token, hospitalId, API_BASE]);

  const fetchInvites = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await apiFetch(`/v1/invites/hospital/${hospitalId}`);
      if (res.ok) {
        const data = await res.json();
        setInvites(data);
      }
    } catch (e) {
      console.error('Failed to fetch invites:', e);
    }
  }, [session?.access_token, hospitalId]);

  const fetchSubscription = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await apiFetch('/v1/products/admin/subscriptions');
      if (res.ok) {
        const subs = await res.json();
        const hospitalSub = subs.find((s: any) => s.hospitalId === hospitalId);
        setSubscription(hospitalSub || null);
      }
    } catch (e) {
      console.error('Failed to fetch subscription:', e);
    }
  }, [session?.access_token, hospitalId]);

  const fetchProducts = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await apiFetch('/v1/products');
      if (res.ok) {
        setProducts(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch products:', e);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (session?.access_token) {
      setLoading(true);
      Promise.all([fetchHospital(), fetchMembers(), fetchInvites(), fetchSubscription(), fetchProducts()])
        .finally(() => setLoading(false));
    }
  }, [session?.access_token, fetchHospital, fetchMembers, fetchInvites, fetchSubscription, fetchProducts]);

  async function handleUpdateHospital() {
    if (!session?.access_token) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/v1/hospitals/${hospitalId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editForm.name,
          addressLine1: editForm.addressLine1,
          addressLine2: editForm.addressLine2,
          city: editForm.city,
          state: editForm.state,
          postal: editForm.postal,
          country: editForm.country,
          region: editForm.region,
          currency: editForm.currency,
          timezone: editForm.timezone,
          phone: editForm.phone,
          email: editForm.email,
          website: editForm.website,
          logoUrl: editForm.logoUrl,
          pictureUrl: editForm.pictureUrl,
        }),
      });
      if (res.ok) {
        setShowEditModal(false);
        setSuccessMsg('Hospital updated successfully');
        setTimeout(() => setSuccessMsg(null), 3000);
        await fetchHospital();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to update hospital');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleInvite() {
    if (!session?.access_token) return;
    setInviting(true);
    try {
      const endpoint = inviteRole === 'HOSPITAL_MANAGER'
        ? '/v1/invites/create-manager'
        : '/v1/invites/create-doctor';
      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          hospitalId,
          email: inviteEmail,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setInviteUrl(data.inviteUrl);
        setInviteEmail('');
        await fetchInvites();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to send invite');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setInviting(false);
    }
  }

  async function handleResendInvite(inviteId: string) {
    try {
      const res = await apiFetch(`/v1/invites/${inviteId}/resend`, { method: 'POST' });
      if (res.ok) {
        setSuccessMsg('Invite resent successfully');
        setTimeout(() => setSuccessMsg(null), 3000);
        await fetchInvites();
      } else {
        setError('Failed to resend invite');
      }
    } catch (e) {
      console.error('Failed to resend invite:', e);
    }
  }

  async function handleCancelInvite(inviteId: string) {
    try {
      const res = await apiFetch(`/v1/invites/${inviteId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchInvites();
      }
    } catch (e) {
      console.error('Failed to cancel invite:', e);
    }
  }

  function openEditMemberModal(member: Member) {
    setEditingMember(member);
    setEditMemberForm({ isPrimary: member.isPrimary });
    setShowEditMemberModal(true);
  }

  async function handleUpdateMember() {
    if (!session?.access_token || !editingMember) return;
    setUpdatingMember(true);
    try {
      const res = await fetch(`${API_BASE}/v1/hospitals/${hospitalId}/members/${editingMember.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isPrimary: editMemberForm.isPrimary,
        }),
      });
      if (res.ok) {
        setShowEditMemberModal(false);
        setEditingMember(null);
        setSuccessMsg('Manager updated successfully');
        setTimeout(() => setSuccessMsg(null), 3000);
        await fetchMembers();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to update manager');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUpdatingMember(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!session?.access_token) return;
    if (!confirm('Are you sure you want to remove this member from the hospital?')) return;
    try {
      const res = await fetch(`${API_BASE}/v1/hospitals/${hospitalId}/members/${memberId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        setSuccessMsg('Member removed successfully');
        setTimeout(() => setSuccessMsg(null), 3000);
        await fetchMembers();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to remove member');
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  function openSubscriptionModal() {
    if (subscription) {
      // Pre-fill with existing subscription items
      setSubscriptionForm(subscription.items.map(item => ({
        productCode: item.productCode,
        doctorLimit: item.doctorLimit,
        discountCode: '',
      })));
    } else {
      // Start fresh with default product
      setSubscriptionForm([{ productCode: 'APPOINTMENTS', doctorLimit: 5, discountCode: '' }]);
    }
    setShowSubscriptionModal(true);
  }

  async function handleUpdateSubscription() {
    if (!session?.access_token) return;
    setUpdatingSubscription(true);
    try {
      const endpoint = subscription
        ? `/v1/products/admin/subscriptions/${hospitalId}`
        : '/v1/products/admin/subscriptions';
      const method = subscription ? 'PATCH' : 'POST';

      const body = subscription
        ? {
            items: subscriptionForm
              .filter(item => item.doctorLimit > 0)
              .map(item => ({
                productCode: item.productCode,
                doctorLimit: item.doctorLimit,
                discountCode: item.discountCode || undefined,
              })),
          }
        : {
            hospitalId,
            startTrial: true,
            trialDays: 14,
            items: subscriptionForm
              .filter(item => item.doctorLimit > 0)
              .map(item => ({
                productCode: item.productCode,
                doctorLimit: item.doctorLimit,
                discountCode: item.discountCode || undefined,
              })),
          };

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowSubscriptionModal(false);
        setSuccessMsg('Subscription updated successfully');
        setTimeout(() => setSuccessMsg(null), 3000);
        await fetchSubscription();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to update subscription');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUpdatingSubscription(false);
    }
  }

  function addProductToSubscription() {
    const existingCodes = subscriptionForm.map(f => f.productCode);
    const availableProduct = products.find(p => !existingCodes.includes(p.code));
    if (availableProduct) {
      setSubscriptionForm([
        ...subscriptionForm,
        { productCode: availableProduct.code, doctorLimit: 5, discountCode: '' },
      ]);
    }
  }

  function removeProductFromSubscription(index: number) {
    setSubscriptionForm(subscriptionForm.filter((_, i) => i !== index));
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
        // For now, we'll use a data URL. In production, you'd upload to storage first.
        setEditForm({ ...editForm, logoUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  }

  function handlePictureChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPicturePreview(reader.result as string);
        setEditForm({ ...editForm, pictureUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  }

  function formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  }

  function getInviteStatusInfo(invite: Invite) {
    const now = new Date();
    const expiresAt = new Date(invite.expiresAt);
    const isExpired = expiresAt < now;

    if (invite.status === 'ACCEPTED') {
      return { label: 'Accepted', color: 'status-pill-active', canResend: false };
    }
    if (invite.status === 'CANCELLED') {
      return { label: 'Cancelled', color: 'status-pill-inactive', canResend: false };
    }
    if (isExpired) {
      return { label: 'Expired', color: 'status-pill-expired', canResend: true };
    }
    return { label: 'Pending', color: 'status-pill-pending', canResend: true };
  }

  function getDaysRemaining(expiresAt: string) {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  }

  function getMemberStatusInfo(member: Member) {
    if (!member.complianceStatus || member.complianceStatus === 'compliant') {
      return {
        label: 'Active',
        color: 'status-pill-active',
        description: null,
      };
    }
    if (member.complianceStatus === 'not_logged_in') {
      return {
        label: 'Not Logged In',
        color: 'status-pill-pending',
        description: 'User has not logged in yet',
      };
    }
    if (member.complianceStatus === 'pending_signatures') {
      return {
        label: 'Pending Signatures',
        color: 'status-pill-warning',
        description: `${member.documentsSigned || 0} of ${member.documentsRequired || 0} documents signed`,
      };
    }
    return {
      label: 'Active',
      color: 'status-pill-active',
      description: null,
    };
  }

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Hospital Details"
          subtitle="Loading..."
          breadcrumbs={[
            { label: 'Hospitals', href: '/admin/hospitals' },
            { label: 'Details' },
          ]}
        />
        <LoadingState type="cards" />
      </div>
    );
  }

  if (!hospital) {
    return (
      <div>
        <PageHeader
          title="Hospital Not Found"
          breadcrumbs={[
            { label: 'Hospitals', href: '/admin/hospitals' },
            { label: 'Not Found' },
          ]}
        />
        <div className="pro-card">
          <div className="admin-empty-state">
            <div className="admin-empty-icon">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
            <h3 className="admin-empty-title">Hospital not found</h3>
            <p className="admin-empty-description">The hospital you're looking for doesn't exist or you don't have access.</p>
            <div className="admin-empty-action">
              <button onClick={() => router.push('/admin/hospitals')} className="btn-primary">
                Back to Hospitals
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const managers = members.filter(m => m.role === 'HOSPITAL_MANAGER');
  const doctors = members.filter(m => m.role === 'DOCTOR');
  const primaryManager = managers.find(m => m.isPrimary);
  const pendingInvites = invites.filter(i => i.status === 'PENDING');
  const managerInvites = invites.filter(i => i.role === 'HOSPITAL_MANAGER' && i.status === 'PENDING');
  const doctorInvites = invites.filter(i => i.role === 'DOCTOR' && i.status === 'PENDING');

  const tabItems = [
    { id: 'overview', label: 'Overview' },
    { id: 'managers', label: 'Managers', count: managers.length + managerInvites.length },
    { id: 'doctors', label: 'Doctors', count: doctors.length + doctorInvites.length },
    { id: 'subscription', label: 'Subscription' },
  ];

  const regionFlags: Record<string, string> = { US: '🇺🇸', UK: '🇬🇧', IN: '🇮🇳' };

  return (
    <div>
      <PageHeader
        title={hospital.name}
        subtitle={hospital.city && hospital.state ? `${hospital.city}, ${hospital.state}` : hospital.country}
        breadcrumbs={[
          { label: 'Hospitals', href: '/admin/hospitals' },
          { label: hospital.name },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={hospital.status.toLowerCase()} />
            <button onClick={() => setShowEditModal(true)} className="btn-secondary">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Hospital
            </button>
          </div>
        }
      />

      {/* Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 text-xl">&times;</button>
        </div>
      )}
      {successMsg && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {successMsg}
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-green-500 hover:text-green-700 text-xl">&times;</button>
        </div>
      )}

      <Tabs tabs={tabItems} activeTab={activeTab} onChange={setActiveTab} />

      {/* Overview Tab */}
      <TabPanel id="overview" activeTab={activeTab}>
        {/* Hospital Banner/Picture */}
        {hospital.pictureUrl && (
          <div className="mb-4 relative rounded-lg overflow-hidden h-40 bg-gray-100">
            <img src={hospital.pictureUrl} alt={`${hospital.name} facility`} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <button
              onClick={() => setShowEditModal(true)}
              className="absolute top-3 right-3 p-2 bg-white/90 hover:bg-white rounded-lg shadow-sm transition-colors"
              title="Edit hospital"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Hospital Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="pro-card">
              <div className="pro-card-header flex items-center justify-between">
                <h3 className="pro-card-title">Hospital Information</h3>
                <button
                  onClick={() => setShowEditModal(true)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Edit hospital info"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
              <div className="pro-card-body">
                <div className="flex items-start gap-6">
                  {/* Logo */}
                  <div className="flex-shrink-0">
                    <div className="w-24 h-24 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                      {hospital.logoUrl ? (
                        <img src={hospital.logoUrl} alt={hospital.name} className="w-full h-full object-cover" />
                      ) : (
                        <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Info Grid */}
                  <div className="flex-1 info-grid grid-cols-2">
                    <div className="info-item">
                      <div className="info-label">Name</div>
                      <div className="info-value">{hospital.name}</div>
                    </div>
                    <div className="info-item">
                      <div className="info-label">Region</div>
                      <div className="info-value flex items-center gap-1">
                        <span>{regionFlags[hospital.region] || ''}</span>
                        {hospital.region}
                      </div>
                    </div>
                    <div className="info-item col-span-2">
                      <div className="info-label">Address</div>
                      <div className="info-value">
                        {[hospital.addressLine1, hospital.addressLine2, hospital.city, hospital.state, hospital.postal, hospital.country]
                          .filter(Boolean)
                          .join(', ') || 'Not specified'}
                      </div>
                    </div>
                    <div className="info-item">
                      <div className="info-label">Currency</div>
                      <div className="info-value">{hospital.currency}</div>
                    </div>
                    <div className="info-item">
                      <div className="info-label">Timezone</div>
                      <div className="info-value">{hospital.timezone}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Info */}
            <div className="pro-card">
              <div className="pro-card-header flex items-center justify-between">
                <h3 className="pro-card-title">Contact Information</h3>
                <button
                  onClick={() => setShowEditModal(true)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Edit contact info"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
              <div className="pro-card-body">
                <div className="info-grid grid-cols-1 sm:grid-cols-3">
                  <div className="info-item">
                    <div className="info-label">Phone</div>
                    <div className="info-value flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {hospital.phone || <span className="text-gray-400">Not specified</span>}
                    </div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">Email</div>
                    <div className="info-value flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {hospital.email ? (
                        <a href={`mailto:${hospital.email}`}>{hospital.email}</a>
                      ) : (
                        <span className="text-gray-400">Not specified</span>
                      )}
                    </div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">Website</div>
                    <div className="info-value flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      {hospital.website ? (
                        <a href={hospital.website} target="_blank" rel="noopener noreferrer">{hospital.website}</a>
                      ) : (
                        <span className="text-gray-400">Not specified</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats Sidebar */}
          <div className="space-y-3">
            {/* Primary Manager */}
            <div className="pro-card">
              <div className="pro-card-body">
                <div className="section-header">
                  <h3 className="section-title">Primary Manager</h3>
                  <button
                    onClick={() => setActiveTab('managers')}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    title="Manage managers"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
                {primaryManager ? (
                  <div className="flex items-center gap-3">
                    <div className="avatar avatar-lg">
                      {(primaryManager.profile?.fullName || primaryManager.fullName)?.charAt(0) ||
                       (primaryManager.profile?.email || primaryManager.email)?.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {primaryManager.profile?.fullName || primaryManager.fullName || 'No name'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {primaryManager.profile?.email || primaryManager.email}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500">No primary manager assigned</p>
                    <button
                      onClick={() => {
                        setInviteRole('HOSPITAL_MANAGER');
                        setShowInviteModal(true);
                        setInviteUrl(null);
                      }}
                      className="text-sm text-[var(--color-primary)] hover:underline mt-2"
                    >
                      Invite a manager
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Team Stats */}
            <div className="pro-card">
              <div className="pro-card-body">
                <div className="section-header">
                  <h3 className="section-title">Team Overview</h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveTab('managers')}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Manage managers"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setActiveTab('doctors')}
                      className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                      title="Manage doctors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-[var(--color-primary-dark)]">{managers.length}</p>
                    <p className="text-xs text-gray-500">Managers</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-700">{doctors.length}</p>
                    <p className="text-xs text-gray-500">Doctors</p>
                  </div>
                </div>
                {pendingInvites.length > 0 && (
                  <div className="mt-3 p-2 bg-yellow-50 rounded-lg text-center">
                    <p className="text-xs text-yellow-700">
                      {pendingInvites.length} pending invite{pendingInvites.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Subscription Summary */}
            <div className="pro-card">
              <div className="pro-card-body">
                <div className="section-header">
                  <h3 className="section-title">Subscription</h3>
                  <button
                    onClick={openSubscriptionModal}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    title="Update subscription"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
                {subscription ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <StatusBadge status={subscription.status.toLowerCase()} />
                      <span className="text-lg font-bold text-gray-900">
                        {formatCurrency(subscription.totalMonthly, hospital.currency)}/mo
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {subscription.items.length} product{subscription.items.length !== 1 ? 's' : ''} subscribed
                    </p>
                    <button
                      onClick={() => setActiveTab('subscription')}
                      className="text-sm text-[var(--color-primary)] hover:underline"
                    >
                      View details →
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500 mb-2">No active subscription</p>
                    <button onClick={openSubscriptionModal} className="btn-primary text-sm">
                      Create Subscription
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      {/* Managers Tab */}
      <TabPanel id="managers" activeTab={activeTab}>
        <div className="pro-card">
          <div className="pro-card-header flex items-center justify-between">
            <div>
              <h3 className="pro-card-title">Hospital Managers</h3>
              <p className="text-xs text-gray-500 mt-1">Manage hospital administrator accounts</p>
            </div>
            <button
              onClick={() => {
                setInviteRole('HOSPITAL_MANAGER');
                setShowInviteModal(true);
                setInviteUrl(null);
              }}
              className="btn-primary"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Invite Manager
            </button>
          </div>
          <div className="pro-card-body">
            {/* Pending Invites */}
            {managerInvites.length > 0 && (
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Invitations ({managerInvites.length})
                </h4>
                <div className="space-y-2">
                  {managerInvites.map((invite) => {
                    const statusInfo = getInviteStatusInfo(invite);
                    const daysRemaining = getDaysRemaining(invite.expiresAt);
                    return (
                      <div key={invite.id} className={`invite-card ${statusInfo.label === 'Expired' ? 'invite-card-expired' : 'invite-card-pending'}`}>
                        <div className="flex items-center gap-3">
                          <div className="avatar avatar-md">
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{invite.invitedEmail}</p>
                            <p className="text-xs text-gray-500">
                              {statusInfo.label === 'Expired'
                                ? `Expired ${new Date(invite.expiresAt).toLocaleDateString()}`
                                : `Expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`
                              }
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`status-pill ${statusInfo.color}`}>{statusInfo.label}</span>
                          {statusInfo.canResend && (
                            <button
                              onClick={() => handleResendInvite(invite.id)}
                              className="quick-action-btn quick-action-btn-secondary"
                            >
                              Resend
                            </button>
                          )}
                          <button
                            onClick={() => handleCancelInvite(invite.id)}
                            className="quick-action-btn quick-action-btn-danger"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active Managers */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Managers ({managers.length})
              </h4>
              <div className="space-y-2">
                {managers.map((member) => {
                  const statusInfo = getMemberStatusInfo(member);
                  return (
                    <div key={member.id} className="member-card">
                      <div className="member-info">
                        <div className="avatar avatar-md">
                          {(member.profile?.fullName || member.fullName)?.charAt(0) ||
                           (member.profile?.email || member.email)?.charAt(0)}
                        </div>
                        <div className="member-details">
                          <p className="member-name">
                            {member.profile?.fullName || member.fullName || 'No name'}
                            {member.isPrimary && (
                              <span className="status-pill status-pill-active ml-2">Primary</span>
                            )}
                          </p>
                          <p className="member-email">{member.profile?.email || member.email}</p>
                          {statusInfo.description && (
                            <p className="text-xs text-gray-400 mt-0.5">{statusInfo.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="member-actions flex items-center gap-2">
                        <span className={`status-pill ${statusInfo.color}`}>{statusInfo.label}</span>
                        <button
                          onClick={() => openEditMemberModal(member)}
                          className="quick-action-btn quick-action-btn-secondary"
                          title="Edit manager"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {!member.isPrimary && (
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            className="quick-action-btn quick-action-btn-danger"
                            title="Remove manager"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {managers.length === 0 && !managerInvites.length && (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <p className="text-sm">No managers yet</p>
                    <p className="text-xs mt-1">Invite your first hospital manager to get started</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      {/* Doctors Tab */}
      <TabPanel id="doctors" activeTab={activeTab}>
        <div className="pro-card">
          <div className="pro-card-header flex items-center justify-between">
            <div>
              <h3 className="pro-card-title">Doctors</h3>
              <p className="text-xs text-gray-500 mt-1">Manage doctor accounts and licenses</p>
            </div>
            <button
              onClick={() => {
                setInviteRole('DOCTOR');
                setShowInviteModal(true);
                setInviteUrl(null);
              }}
              className="btn-primary"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Invite Doctor
            </button>
          </div>
          <div className="pro-card-body">
            {/* License Info */}
            {subscription && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-900">Doctor Licenses</p>
                    <p className="text-xs text-blue-700">
                      {doctors.length} of {subscription.items.reduce((sum, i) => sum + i.doctorLimit, 0)} licenses used
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-blue-900">
                      {subscription.items.reduce((sum, i) => sum + i.doctorLimit, 0) - doctors.length}
                    </p>
                    <p className="text-xs text-blue-700">available</p>
                  </div>
                </div>
              </div>
            )}

            {/* Pending Invites */}
            {doctorInvites.length > 0 && (
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Invitations ({doctorInvites.length})
                </h4>
                <div className="space-y-2">
                  {doctorInvites.map((invite) => {
                    const statusInfo = getInviteStatusInfo(invite);
                    const daysRemaining = getDaysRemaining(invite.expiresAt);
                    return (
                      <div key={invite.id} className={`invite-card ${statusInfo.label === 'Expired' ? 'invite-card-expired' : 'invite-card-pending'}`}>
                        <div className="flex items-center gap-3">
                          <div className="avatar avatar-md">
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{invite.invitedEmail}</p>
                            <p className="text-xs text-gray-500">
                              {statusInfo.label === 'Expired'
                                ? `Expired ${new Date(invite.expiresAt).toLocaleDateString()}`
                                : `Expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`
                              }
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`status-pill ${statusInfo.color}`}>{statusInfo.label}</span>
                          {statusInfo.canResend && (
                            <button
                              onClick={() => handleResendInvite(invite.id)}
                              className="quick-action-btn quick-action-btn-secondary"
                            >
                              Resend
                            </button>
                          )}
                          <button
                            onClick={() => handleCancelInvite(invite.id)}
                            className="quick-action-btn quick-action-btn-danger"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active Doctors */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Doctors ({doctors.length})
              </h4>
              <div className="space-y-2">
                {doctors.map((member) => {
                  const statusInfo = getMemberStatusInfo(member);
                  return (
                    <div key={member.id} className="member-card">
                      <div className="member-info">
                        <div className="avatar avatar-md">
                          {(member.profile?.fullName || member.fullName)?.charAt(0) ||
                           (member.profile?.email || member.email)?.charAt(0)}
                        </div>
                        <div className="member-details">
                          <p className="member-name">
                            {member.profile?.fullName || member.fullName || 'No name'}
                          </p>
                          <p className="member-email">{member.profile?.email || member.email}</p>
                          {statusInfo.description && (
                            <p className="text-xs text-gray-400 mt-0.5">{statusInfo.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="member-actions flex items-center gap-2">
                        <span className={`status-pill ${statusInfo.color}`}>{statusInfo.label}</span>
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="quick-action-btn quick-action-btn-danger"
                          title="Remove doctor"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
                {doctors.length === 0 && !doctorInvites.length && (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm">No doctors yet</p>
                    <p className="text-xs mt-1">Invite doctors to give them access to the platform</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      {/* Subscription Tab */}
      <TabPanel id="subscription" activeTab={activeTab}>
        {subscription ? (
          <div className="space-y-4">
            {/* Subscription Overview */}
            <div className="pro-card">
              <div className="pro-card-header flex items-center justify-between">
                <div>
                  <h3 className="pro-card-title">Subscription Details</h3>
                  <p className="text-xs text-gray-500 mt-1">Current subscription and billing information</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={subscription.status.toLowerCase()} />
                  <button onClick={openSubscriptionModal} className="btn-primary">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Update Subscription
                  </button>
                </div>
              </div>
              <div className="pro-card-body">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="info-item">
                    <div className="info-label">Status</div>
                    <div className="info-value">{subscription.status}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">Billing Cycle Start</div>
                    <div className="info-value">{new Date(subscription.billingCycleStart).toLocaleDateString()}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">Renewal Date</div>
                    <div className="info-value">{new Date(subscription.billingCycleEnd).toLocaleDateString()}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">Monthly Total</div>
                    <div className="text-xl font-bold text-[var(--color-primary-dark)]">
                      {formatCurrency(subscription.totalMonthly, hospital.currency)}
                    </div>
                  </div>
                </div>
                {subscription.trialEndsAt && (
                  <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-100">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm font-medium text-purple-900">
                        Trial Period Active
                      </p>
                    </div>
                    <p className="text-sm text-purple-700 mt-1">
                      Trial ends on {new Date(subscription.trialEndsAt).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Products */}
            <div className="pro-card">
              <div className="pro-card-header">
                <h3 className="pro-card-title">Subscribed Products</h3>
              </div>
              <div className="pro-card-body">
                <div className="space-y-4">
                  {subscription.items.map((item) => (
                    <div key={item.id} className="subscription-product-card">
                      <div className="subscription-product-header">
                        <div>
                          <p className="subscription-product-name">{item.productName}</p>
                          <p className="subscription-product-code">{item.productCode}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-gray-900">
                            {formatCurrency(item.monthlyTotal, item.currency)}
                          </p>
                          <p className="text-xs text-gray-500">per month</p>
                        </div>
                      </div>
                      <div className="subscription-product-stats">
                        <div className="subscription-stat">
                          <p className="subscription-stat-value">{item.doctorLimit}</p>
                          <p className="subscription-stat-label">Doctor Licenses</p>
                        </div>
                        <div className="subscription-stat">
                          <p className="subscription-stat-value">{formatCurrency(item.pricePerDoctor, item.currency)}</p>
                          <p className="subscription-stat-label">Per Doctor/Month</p>
                        </div>
                        <div className="subscription-stat">
                          <p className="subscription-stat-value">{item.currency}</p>
                          <p className="subscription-stat-label">Currency</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="pro-card">
            <div className="admin-empty-state">
              <div className="admin-empty-icon">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
              </div>
              <h3 className="admin-empty-title">No Active Subscription</h3>
              <p className="admin-empty-description">This hospital doesn't have an active subscription yet. Create one to enable access to products.</p>
              <div className="admin-empty-action">
                <button onClick={openSubscriptionModal} className="btn-primary">
                  Create Subscription
                </button>
              </div>
            </div>
          </div>
        )}
      </TabPanel>

      {/* Edit Hospital Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Hospital"
        subtitle="Update hospital information and branding"
        size="lg"
        footer={
          <>
            <button onClick={() => setShowEditModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button onClick={handleUpdateHospital} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </>
        }
      >
        <div className="space-y-6">
          {/* Logo Upload */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-4">Branding & Images</h4>
            <div className="grid grid-cols-2 gap-6">
              {/* Logo Upload */}
              <div>
                <label className="form-label mb-2">Hospital Logo</label>
                <div
                  className={`image-upload-zone w-full h-32 ${logoPreview ? 'has-image' : ''}`}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {logoPreview ? (
                    <>
                      <img src={logoPreview} alt="Logo preview" className="image-upload-preview" />
                      <div className="image-upload-overlay">
                        <button type="button" className="text-white text-sm">Change</button>
                      </div>
                    </>
                  ) : (
                    <div className="image-upload-placeholder">
                      <svg className="image-upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="image-upload-text">Upload Logo</p>
                      <p className="image-upload-hint">Square, 200x200px</p>
                    </div>
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                />
              </div>

              {/* Hospital Picture Upload */}
              <div>
                <label className="form-label mb-2">Hospital Picture</label>
                <div
                  className={`image-upload-zone w-full h-32 ${picturePreview ? 'has-image' : ''}`}
                  onClick={() => pictureInputRef.current?.click()}
                >
                  {picturePreview ? (
                    <>
                      <img src={picturePreview} alt="Hospital picture preview" className="image-upload-preview" />
                      <div className="image-upload-overlay">
                        <button type="button" className="text-white text-sm">Change</button>
                      </div>
                    </>
                  ) : (
                    <div className="image-upload-placeholder">
                      <svg className="image-upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <p className="image-upload-text">Upload Picture</p>
                      <p className="image-upload-hint">Building/Facility photo</p>
                    </div>
                  )}
                </div>
                <input
                  ref={pictureInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePictureChange}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          {/* Basic Info */}
          <div className="border-t pt-6">
            <h4 className="text-sm font-medium text-gray-700 mb-4">Basic Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 form-group">
                <label className="form-label form-label-required">Hospital Name</label>
                <input
                  type="text"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
              <div className="col-span-2 form-group">
                <label className="form-label">Address Line 1</label>
                <input
                  type="text"
                  value={editForm.addressLine1 || ''}
                  onChange={(e) => setEditForm({ ...editForm, addressLine1: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="col-span-2 form-group">
                <label className="form-label">Address Line 2</label>
                <input
                  type="text"
                  value={editForm.addressLine2 || ''}
                  onChange={(e) => setEditForm({ ...editForm, addressLine2: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">City</label>
                <input
                  type="text"
                  value={editForm.city || ''}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">State/Province</label>
                <input
                  type="text"
                  value={editForm.state || ''}
                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Postal Code</label>
                <input
                  type="text"
                  value={editForm.postal || ''}
                  onChange={(e) => setEditForm({ ...editForm, postal: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label form-label-required">Country</label>
                <input
                  type="text"
                  value={editForm.country || ''}
                  onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
            </div>
          </div>

          {/* Region & Settings */}
          <div className="border-t pt-6">
            <h4 className="text-sm font-medium text-gray-700 mb-4">Regional Settings</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="form-group">
                <label className="form-label form-label-required">Region</label>
                <select
                  value={editForm.region || 'US'}
                  onChange={(e) => setEditForm({ ...editForm, region: e.target.value })}
                  className="form-input"
                  required
                >
                  <option value="US">🇺🇸 US</option>
                  <option value="UK">🇬🇧 UK</option>
                  <option value="IN">🇮🇳 India</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label form-label-required">Currency</label>
                <select
                  value={editForm.currency || 'USD'}
                  onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                  className="form-input"
                  required
                >
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="INR">INR (₹)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label form-label-required">Timezone</label>
                <select
                  value={editForm.timezone || 'America/Chicago'}
                  onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })}
                  className="form-input"
                  required
                >
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="America/Chicago">Central Time (CT)</option>
                  <option value="America/Denver">Mountain Time (MT)</option>
                  <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  <option value="Europe/London">London (GMT)</option>
                  <option value="Asia/Kolkata">India (IST)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="border-t pt-6">
            <h4 className="text-sm font-medium text-gray-700 mb-4">Contact Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Phone</label>
                <PhoneInput
                  value={editForm.phone || ''}
                  onChange={(value) => setEditForm({ ...editForm, phone: value })}
                  placeholder="Phone number"
                  useHospitalDefault={false}
                  defaultCountryCode={editForm.region === 'US' ? 'US' : editForm.region === 'UK' ? 'GB' : editForm.region === 'IN' ? 'IN' : 'US'}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  value={editForm.email || ''}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="form-input"
                  placeholder="contact@hospital.com"
                />
              </div>
              <div className="col-span-2 form-group">
                <label className="form-label">Website</label>
                <input
                  type="url"
                  value={editForm.website || ''}
                  onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  className="form-input"
                  placeholder="https://www.hospital.com"
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Invite Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => {
          setShowInviteModal(false);
          setInviteUrl(null);
        }}
        title={`Invite ${inviteRole === 'HOSPITAL_MANAGER' ? 'Manager' : 'Doctor'}`}
        subtitle={`to ${hospital.name}`}
        size="md"
      >
        {inviteUrl ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-green-800">Invite sent successfully!</p>
                  <p className="text-xs text-green-700 mt-1">
                    The invite link has been emailed. You can also share this link directly:
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 border rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Invite Link</p>
              <p className="text-sm break-all font-mono text-gray-700">{inviteUrl}</p>
            </div>
            <button
              onClick={() => {
                setShowInviteModal(false);
                setInviteUrl(null);
              }}
              className="btn-primary w-full"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="form-group">
              <label className="form-label form-label-required">Email Address</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="form-input"
                placeholder={inviteRole === 'HOSPITAL_MANAGER' ? 'manager@hospital.com' : 'doctor@hospital.com'}
                required
              />
              <p className="form-hint mt-1">
                An invitation email will be sent to this address
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowInviteModal(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail}
                className="btn-primary flex-1"
              >
                {inviting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending...
                  </>
                ) : (
                  'Send Invite'
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Member Modal */}
      <Modal
        isOpen={showEditMemberModal}
        onClose={() => {
          setShowEditMemberModal(false);
          setEditingMember(null);
        }}
        title="Edit Manager"
        subtitle={editingMember?.profile?.fullName || editingMember?.fullName || editingMember?.profile?.email || editingMember?.email}
        size="md"
        footer={
          <>
            <button onClick={() => setShowEditMemberModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button onClick={handleUpdateMember} disabled={updatingMember} className="btn-primary">
              {updatingMember ? 'Saving...' : 'Save Changes'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="avatar avatar-lg">
              {(editingMember?.profile?.fullName || editingMember?.fullName)?.charAt(0) ||
               (editingMember?.profile?.email || editingMember?.email)?.charAt(0)}
            </div>
            <div>
              <p className="font-medium text-gray-900">
                {editingMember?.profile?.fullName || editingMember?.fullName || 'No name'}
              </p>
              <p className="text-sm text-gray-500">
                {editingMember?.profile?.email || editingMember?.email}
              </p>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Role</label>
            <div className="form-input bg-gray-50 text-gray-600">
              Hospital Manager
            </div>
            <p className="form-hint">Role cannot be changed for existing members</p>
          </div>

          <div className="form-group">
            <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
              <input
                type="checkbox"
                checked={editMemberForm.isPrimary}
                onChange={(e) => setEditMemberForm({ ...editMemberForm, isPrimary: e.target.checked })}
                className="w-5 h-5 text-[var(--color-primary)] rounded border-gray-300 focus:ring-[var(--color-primary)]"
              />
              <div>
                <p className="font-medium text-gray-900">Primary Manager</p>
                <p className="text-sm text-gray-500">
                  Primary managers have full control over hospital settings and can invite other managers
                </p>
              </div>
            </label>
          </div>

          {editingMember?.isPrimary && !editMemberForm.isPrimary && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm text-yellow-700">
                  Removing primary status will require another manager to be set as primary.
                </p>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Update Subscription Modal */}
      <Modal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        title={subscription ? 'Update Subscription' : 'Create Subscription'}
        subtitle={hospital.name}
        size="lg"
        footer={
          <>
            <button onClick={() => setShowSubscriptionModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleUpdateSubscription}
              disabled={updatingSubscription || subscriptionForm.every(f => f.doctorLimit <= 0)}
              className="btn-primary"
            >
              {updatingSubscription ? 'Saving...' : subscription ? 'Update Subscription' : 'Create Subscription'}
            </button>
          </>
        }
      >
        <div className="space-y-6">
          {/* Products */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-sm font-medium text-gray-900">Products & Licenses</h4>
                <p className="text-xs text-gray-500">Configure products and doctor license quantities</p>
              </div>
              {subscriptionForm.length < products.length && (
                <button
                  onClick={addProductToSubscription}
                  className="text-sm text-[var(--color-primary)] hover:underline flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Product
                </button>
              )}
            </div>

            <div className="space-y-4">
              {subscriptionForm.map((item, index) => {
                const product = products.find(p => p.code === item.productCode);
                const pricing = product?.pricing.find(p => p.region === hospital.region);
                const pricePerDoctor = pricing?.pricePerDoctorPerMonth || 0;
                const currency = pricing?.currency || hospital.currency;
                const itemTotal = item.doctorLimit * pricePerDoctor;

                return (
                  <div key={index} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <select
                          value={item.productCode}
                          onChange={(e) => {
                            const newForm = [...subscriptionForm];
                            newForm[index].productCode = e.target.value;
                            setSubscriptionForm(newForm);
                          }}
                          className="form-input w-full"
                        >
                          {products.map(p => (
                            <option
                              key={p.code}
                              value={p.code}
                              disabled={subscriptionForm.some((f, i) => i !== index && f.productCode === p.code)}
                            >
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {subscriptionForm.length > 1 && (
                        <button
                          onClick={() => removeProductFromSubscription(index)}
                          className="ml-2 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove product"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="form-group">
                        <label className="form-label">Doctor Licenses</label>
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          value={item.doctorLimit}
                          onChange={(e) => {
                            const newForm = [...subscriptionForm];
                            newForm[index].doctorLimit = parseInt(e.target.value) || 0;
                            setSubscriptionForm(newForm);
                          }}
                          className="form-input"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Discount Code</label>
                        <input
                          type="text"
                          value={item.discountCode}
                          onChange={(e) => {
                            const newForm = [...subscriptionForm];
                            newForm[index].discountCode = e.target.value.toUpperCase();
                            setSubscriptionForm(newForm);
                          }}
                          placeholder="Optional"
                          className="form-input"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Monthly Total</label>
                        <div className="form-input bg-gray-100 font-semibold text-gray-900">
                          {formatCurrency(itemTotal, currency)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-gray-500">
                      {formatCurrency(pricePerDoctor, currency)} per doctor/month × {item.doctorLimit} license{item.doctorLimit !== 1 ? 's' : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between p-4 bg-[var(--color-primary-light)] rounded-xl">
              <div>
                <p className="text-sm font-medium text-[var(--color-primary-dark)]">Total Monthly Cost</p>
                <p className="text-xs text-gray-500">
                  {subscriptionForm.reduce((sum, item) => sum + item.doctorLimit, 0)} total doctor licenses
                </p>
              </div>
              <p className="text-2xl font-bold text-[var(--color-primary-dark)]">
                {formatCurrency(
                  subscriptionForm.reduce((sum, item) => {
                    const product = products.find(p => p.code === item.productCode);
                    const pricing = product?.pricing.find(p => p.region === hospital.region);
                    return sum + (item.doctorLimit * (pricing?.pricePerDoctorPerMonth || 0));
                  }, 0),
                  hospital.currency
                )}
                <span className="text-sm font-normal text-gray-500">/mo</span>
              </p>
            </div>
          </div>

          {!subscription && (
            <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-purple-900">14-Day Trial Included</p>
                  <p className="text-xs text-purple-700 mt-1">
                    New subscriptions start with a 14-day free trial. The hospital will not be charged until the trial ends.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
