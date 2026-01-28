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

export default function HospitalDetailsPage() {
  const { currentHospital, currentHospitalId, profile, refreshProfile } = useAuth();
  const { timezoneLabel, currencySymbol } = useHospitalTimezone();
  const { canEdit } = useRbac();
  const canEditSettings = canEdit('hospital.settings');

  // Only hospital managers and super admins can access this page
  const isManager = profile?.isSuperAdmin || currentHospital?.role === 'HOSPITAL_MANAGER';
  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h2 className="text-lg font-semibold text-gray-700 mb-1">Access Restricted</h2>
        <p className="text-sm text-gray-500">Only hospital managers can access hospital details.</p>
      </div>
    );
  }

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hospitalForm, setHospitalForm] = useState<Partial<HospitalDetails>>({});
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);

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

  async function handleSave(e: React.FormEvent) {
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
        setEditMode(false);
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Hospital Details</h1>
          <p className="admin-page-subtitle">View and manage your hospital information</p>
        </div>
        {!editMode && canEditSettings && (
          <button onClick={() => setEditMode(true)} className="btn-primary">
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit Details
          </button>
        )}
      </div>

      {/* Success/Error Message */}
      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {editMode ? (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Basic Info */}
          <div className="pro-card">
            <div className="pro-card-header">
              <h3 className="pro-card-title">Basic Information</h3>
            </div>
            <div className="pro-card-body">
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
            </div>
          </div>

          {/* Address */}
          <div className="pro-card">
            <div className="pro-card-header">
              <h3 className="pro-card-title">Address</h3>
            </div>
            <div className="pro-card-body">
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
          </div>

          {/* Regional Settings */}
          <div className="pro-card">
            <div className="pro-card-header">
              <h3 className="pro-card-title">Regional Settings</h3>
            </div>
            <div className="pro-card-body">
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
          </div>

          {/* Branding */}
          <div className="pro-card">
            <div className="pro-card-header">
              <h3 className="pro-card-title">Branding</h3>
            </div>
            <div className="pro-card-body">
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
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditMode(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      ) : (
        <div className="space-y-6">
          {/* Basic Info Card */}
          <div className="pro-card">
            <div className="pro-card-header">
              <h3 className="pro-card-title">Basic Information</h3>
            </div>
            <div className="pro-card-body">
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
            </div>
          </div>

          {/* Regional Settings Card */}
          <div className="pro-card">
            <div className="pro-card-header">
              <h3 className="pro-card-title">Regional Settings</h3>
            </div>
            <div className="pro-card-body">
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
          </div>

          {/* Branding Card */}
          {(hospitalForm.logoUrl || hospitalForm.pictureUrl) && (
            <div className="pro-card">
              <div className="pro-card-header">
                <h3 className="pro-card-title">Branding</h3>
              </div>
              <div className="pro-card-body">
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
