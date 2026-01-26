'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import { useHospitalTimezone } from '../../../hooks/useHospitalTimezone';
import { TIMEZONE_FULL_NAMES } from '../../../lib/timezone';
import PhoneInput from '../../../components/PhoneInput';
import { useRbac } from '../../../lib/rbac/RbacContext';

interface HospitalDetails {
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
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  pictureUrl?: string;
}

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
];

export default function SettingsPage() {
  const { currentHospital, currentHospitalId, profile, refreshProfile } = useAuth();
  const { timezoneLabel, currencySymbol } = useHospitalTimezone();
  const { canEdit } = useRbac();
  const canEditSettings = canEdit('hospital.settings');

  const [activeTab, setActiveTab] = useState<'hospital' | 'profile' | 'notifications' | 'security'>('hospital');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Hospital form state
  const [hospitalEditMode, setHospitalEditMode] = useState(false);
  const [hospitalForm, setHospitalForm] = useState<Partial<HospitalDetails>>({});
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);

  // Profile form state
  const [profileEditMode, setProfileEditMode] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    phone: '',
  });

  // Fetch full hospital details
  useEffect(() => {
    async function fetchHospitalDetails() {
      if (!currentHospitalId) return;
      try {
        const res = await apiFetch(`/v1/hospitals/${currentHospitalId}`);
        if (res.ok) {
          const data = await res.json();
          setHospitalForm({
            name: data.name,
            addressLine1: data.addressLine1,
            addressLine2: data.addressLine2,
            city: data.city,
            state: data.state,
            postal: data.postal,
            country: data.country,
            region: data.region,
            currency: data.currency,
            timezone: data.timezone,
            phone: data.phone,
            email: data.email,
            website: data.website,
            logoUrl: data.logoUrl,
            pictureUrl: data.pictureUrl,
          });
          setLogoPreview(data.logoUrl || null);
          setPicturePreview(data.pictureUrl || null);
        }
      } catch (error) {
        console.error('Failed to fetch hospital details:', error);
      }
    }
    fetchHospitalDetails();
  }, [currentHospitalId]);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        fullName: profile.fullName || '',
        phone: profile.phone || '',
      });
    }
  }, [profile]);

  // Image upload handlers
  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
        setHospitalForm({ ...hospitalForm, logoUrl: reader.result as string });
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
        setHospitalForm({ ...hospitalForm, pictureUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  }

  async function handleSaveHospital(e: React.FormEvent) {
    e.preventDefault();
    if (!currentHospitalId) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await apiFetch(`/v1/hospitals/${currentHospitalId}`, {
        method: 'PATCH',
        body: JSON.stringify(hospitalForm),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Hospital information updated successfully' });
        setHospitalEditMode(false);
        refreshProfile();
      } else {
        const error = await res.json();
        setMessage({ type: 'error', text: error.message || 'Failed to update hospital' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update hospital' });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();

    setSaving(true);
    setMessage(null);

    try {
      const res = await apiFetch('/v1/me', {
        method: 'PATCH',
        body: JSON.stringify(profileForm),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Profile updated successfully' });
        setProfileEditMode(false);
        refreshProfile();
      } else {
        const error = await res.json();
        setMessage({ type: 'error', text: error.message || 'Failed to update profile' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Settings</h1>
          <p className="admin-page-subtitle">Manage hospital settings and your profile</p>
        </div>
      </div>

      {/* Success/Error Message */}
      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="admin-tabs">
        <div className="admin-tabs-list">
          <button onClick={() => setActiveTab('hospital')} className={`admin-tab ${activeTab === 'hospital' ? 'active' : ''}`}>
            <svg className="admin-tab-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            Hospital
          </button>
          <button onClick={() => setActiveTab('profile')} className={`admin-tab ${activeTab === 'profile' ? 'active' : ''}`}>
            <svg className="admin-tab-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            My Profile
          </button>
          <button onClick={() => setActiveTab('notifications')} className={`admin-tab ${activeTab === 'notifications' ? 'active' : ''}`}>
            <svg className="admin-tab-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            Notifications
          </button>
          <button onClick={() => setActiveTab('security')} className={`admin-tab ${activeTab === 'security' ? 'active' : ''}`}>
            <svg className="admin-tab-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Security
          </button>
        </div>
      </div>

      {/* Hospital Settings Tab */}
      {activeTab === 'hospital' && (
        <div className="space-y-6">
          <div className="pro-card">
            <div className="pro-card-header flex items-center justify-between">
              <h3 className="pro-card-title">Hospital Information</h3>
              {!hospitalEditMode && canEditSettings && (
                <button onClick={() => setHospitalEditMode(true)} className="text-sm font-medium text-[var(--color-primary)] hover:underline">
                  Edit
                </button>
              )}
            </div>
            <div className="pro-card-body">
              {hospitalEditMode ? (
                <form onSubmit={handleSaveHospital} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="form-group">
                      <label className="form-label form-label-required">Hospital Name</label>
                      <input type="text" value={hospitalForm.name || ''} onChange={(e) => setHospitalForm({ ...hospitalForm, name: e.target.value })} className="form-input" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Phone</label>
                      <PhoneInput
                        value={hospitalForm.phone || ''}
                        onChange={(value) => setHospitalForm({ ...hospitalForm, phone: value })}
                        placeholder="Phone number"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Email</label>
                      <input type="email" value={hospitalForm.email || ''} onChange={(e) => setHospitalForm({ ...hospitalForm, email: e.target.value })} className="form-input" placeholder="contact@hospital.com" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Website</label>
                      <input type="url" value={hospitalForm.website || ''} onChange={(e) => setHospitalForm({ ...hospitalForm, website: e.target.value })} className="form-input" placeholder="https://hospital.com" />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-sm font-medium text-gray-700 mb-3">Address</p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="form-group sm:col-span-2">
                        <label className="form-label">Street Address</label>
                        <input type="text" value={hospitalForm.addressLine1 || ''} onChange={(e) => setHospitalForm({ ...hospitalForm, addressLine1: e.target.value })} className="form-input" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">City</label>
                        <input type="text" value={hospitalForm.city || ''} onChange={(e) => setHospitalForm({ ...hospitalForm, city: e.target.value })} className="form-input" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">State/Province</label>
                        <input type="text" value={hospitalForm.state || ''} onChange={(e) => setHospitalForm({ ...hospitalForm, state: e.target.value })} className="form-input" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Postal Code</label>
                        <input type="text" value={hospitalForm.postal || ''} onChange={(e) => setHospitalForm({ ...hospitalForm, postal: e.target.value })} className="form-input" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Country</label>
                        <input type="text" value={hospitalForm.country || ''} onChange={(e) => setHospitalForm({ ...hospitalForm, country: e.target.value })} className="form-input" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-sm font-medium text-gray-700 mb-3">Regional Settings</p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="form-group">
                        <label className="form-label">Timezone</label>
                        <select value={hospitalForm.timezone || ''} onChange={(e) => setHospitalForm({ ...hospitalForm, timezone: e.target.value })} className="form-input">
                          {TIMEZONES.map((tz) => (
                            <option key={tz.value} value={tz.value}>{tz.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Currency</label>
                        <select value={hospitalForm.currency || ''} onChange={(e) => setHospitalForm({ ...hospitalForm, currency: e.target.value })} className="form-input">
                          <option value="USD">USD - US Dollar ($)</option>
                          <option value="GBP">GBP - British Pound (£)</option>
                          <option value="INR">INR - Indian Rupee (₹)</option>
                          <option value="EUR">EUR - Euro (€)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-sm font-medium text-gray-700 mb-3">Branding</p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="form-group">
                        <label className="form-label mb-2">Hospital Logo</label>
                        <div className="relative">
                          {logoPreview ? (
                            <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-gray-200">
                              <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => { setLogoPreview(null); setHospitalForm({ ...hospitalForm, logoUrl: '' }); }}
                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors">
                              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                              <span className="mt-1 text-xs text-gray-500">Upload Logo</span>
                              <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                            </label>
                          )}
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label mb-2">Hospital Picture</label>
                        <div className="relative">
                          {picturePreview ? (
                            <div className="relative w-full h-32 rounded-lg overflow-hidden border border-gray-200">
                              <img src={picturePreview} alt="Picture preview" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => { setPicturePreview(null); setHospitalForm({ ...hospitalForm, pictureUrl: '' }); }}
                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors">
                              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className="mt-1 text-xs text-gray-500">Upload Picture</span>
                              <input type="file" accept="image/*" className="hidden" onChange={handlePictureChange} />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={() => setHospitalEditMode(false)} className="btn-secondary">Cancel</button>
                    <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="info-item">
                      <p className="info-label">Hospital Name</p>
                      <p className="info-value">{hospitalForm.name || '-'}</p>
                    </div>
                    <div className="info-item">
                      <p className="info-label">Phone</p>
                      <p className="info-value">{hospitalForm.phone || '-'}</p>
                    </div>
                    <div className="info-item">
                      <p className="info-label">Email</p>
                      <p className="info-value">{hospitalForm.email || '-'}</p>
                    </div>
                    <div className="info-item">
                      <p className="info-label">Website</p>
                      <p className="info-value">{hospitalForm.website || '-'}</p>
                    </div>
                    <div className="info-item sm:col-span-2">
                      <p className="info-label">Address</p>
                      <p className="info-value">
                        {hospitalForm.addressLine1 && <>{hospitalForm.addressLine1}<br /></>}
                        {hospitalForm.city && `${hospitalForm.city}, `}
                        {hospitalForm.state && `${hospitalForm.state} `}
                        {hospitalForm.postal && hospitalForm.postal}
                        {hospitalForm.country && <><br />{hospitalForm.country}</>}
                        {!hospitalForm.addressLine1 && !hospitalForm.city && '-'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-sm font-medium text-gray-700 mb-3">Regional Settings</p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="info-item">
                        <p className="info-label">Region</p>
                        <p className="info-value">{hospitalForm.region || '-'}</p>
                      </div>
                      <div className="info-item">
                        <p className="info-label">Currency</p>
                        <p className="info-value">{hospitalForm.currency} ({currencySymbol})</p>
                      </div>
                      <div className="info-item">
                        <p className="info-label">Timezone</p>
                        <p className="info-value">{timezoneLabel}</p>
                      </div>
                      <div className="info-item">
                        <p className="info-label">Timezone Name</p>
                        <p className="info-value text-sm">{TIMEZONE_FULL_NAMES[hospitalForm.timezone || ''] || hospitalForm.timezone}</p>
                      </div>
                    </div>
                  </div>

                  {(hospitalForm.logoUrl || hospitalForm.pictureUrl) && (
                    <div className="pt-4 border-t border-gray-100">
                      <p className="text-sm font-medium text-gray-700 mb-3">Branding</p>
                      <div className="flex gap-6">
                        {hospitalForm.logoUrl && (
                          <div>
                            <p className="text-xs text-gray-500 mb-2">Logo</p>
                            <div className="w-24 h-24 rounded-lg overflow-hidden border border-gray-200">
                              <img src={hospitalForm.logoUrl} alt="Hospital logo" className="w-full h-full object-cover" />
                            </div>
                          </div>
                        )}
                        {hospitalForm.pictureUrl && (
                          <div className="flex-1 max-w-md">
                            <p className="text-xs text-gray-500 mb-2">Picture</p>
                            <div className="h-24 rounded-lg overflow-hidden border border-gray-200">
                              <img src={hospitalForm.pictureUrl} alt="Hospital" className="w-full h-full object-cover" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="pro-card">
            <div className="pro-card-header flex items-center justify-between">
              <h3 className="pro-card-title">Personal Information</h3>
              {!profileEditMode && (
                <button onClick={() => setProfileEditMode(true)} className="text-sm font-medium text-[var(--color-primary)] hover:underline">
                  Edit
                </button>
              )}
            </div>
            <div className="pro-card-body">
              {profileEditMode ? (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="form-group">
                      <label className="form-label">Full Name</label>
                      <input type="text" value={profileForm.fullName} onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })} className="form-input" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Email</label>
                      <input type="email" value={profile?.email || ''} disabled className="form-input bg-gray-50 cursor-not-allowed" />
                      <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Phone</label>
                      <PhoneInput
                        value={profileForm.phone}
                        onChange={(value) => setProfileForm({ ...profileForm, phone: value })}
                        placeholder="Phone number"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={() => setProfileEditMode(false)} className="btn-secondary">Cancel</button>
                    <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
                  </div>
                </form>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="info-item">
                    <p className="info-label">Full Name</p>
                    <p className="info-value">{profile?.fullName || '-'}</p>
                  </div>
                  <div className="info-item">
                    <p className="info-label">Email</p>
                    <p className="info-value">{profile?.email}</p>
                  </div>
                  <div className="info-item">
                    <p className="info-label">Role</p>
                    <p className="info-value">Hospital Manager</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pro-card">
            <div className="pro-card-header">
              <h3 className="pro-card-title">Account Information</h3>
            </div>
            <div className="pro-card-body">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="info-item">
                  <p className="info-label">Account Type</p>
                  <p className="info-value">
                    {profile?.isSuperAdmin ? (
                      <span className="inline-flex items-center gap-1">Super Admin<span className="w-2 h-2 rounded-full bg-purple-500"></span></span>
                    ) : 'Hospital Manager'}
                  </p>
                </div>
                <div className="info-item">
                  <p className="info-label">Hospital</p>
                  <p className="info-value">{currentHospital?.name}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Settings */}
      {activeTab === 'notifications' && (
        <div className="pro-card">
          <div className="pro-card-header">
            <h3 className="pro-card-title">Email Notifications</h3>
          </div>
          <div className="pro-card-body space-y-4">
            <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
              <div>
                <p className="text-sm font-medium text-gray-900">New Doctor Joined</p>
                <p className="text-xs text-gray-500">Receive email when a doctor accepts an invite</p>
              </div>
              <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]" />
            </label>
            <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
              <div>
                <p className="text-sm font-medium text-gray-900">Document Signed</p>
                <p className="text-xs text-gray-500">Receive email when a doctor signs required documents</p>
              </div>
              <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]" />
            </label>
            <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
              <div>
                <p className="text-sm font-medium text-gray-900">Subscription Updates</p>
                <p className="text-xs text-gray-500">Receive email about subscription renewals and changes</p>
              </div>
              <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]" />
            </label>
            <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
              <div>
                <p className="text-sm font-medium text-gray-900">Weekly Summary</p>
                <p className="text-xs text-gray-500">Receive weekly activity summary</p>
              </div>
              <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]" />
            </label>
          </div>
          <div className="pro-card-footer">
            <button className="btn-primary">Save Preferences</button>
          </div>
        </div>
      )}

      {/* Security Settings */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="pro-card">
            <div className="pro-card-header">
              <h3 className="pro-card-title">Password</h3>
            </div>
            <div className="pro-card-body">
              <p className="text-sm text-gray-600 mb-4">Change your account password. You'll need to enter your current password.</p>
              <button className="btn-secondary">Change Password</button>
            </div>
          </div>

          <div className="pro-card">
            <div className="pro-card-header">
              <h3 className="pro-card-title">Active Sessions</h3>
            </div>
            <div className="pro-card-body">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-green-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Current Session</p>
                    <p className="text-xs text-gray-500">This device · Just now</p>
                  </div>
                </div>
                <span className="status-pill status-pill-active">Active</span>
              </div>
            </div>
          </div>

          <div className="pro-card">
            <div className="pro-card-header">
              <h3 className="pro-card-title">Two-Factor Authentication</h3>
            </div>
            <div className="pro-card-body">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Not Enabled</p>
                  <p className="text-xs text-gray-500 mb-3">Add an extra layer of security to your account by enabling two-factor authentication.</p>
                  <button className="btn-secondary text-sm">Enable 2FA</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
