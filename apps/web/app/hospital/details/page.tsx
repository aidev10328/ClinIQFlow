'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
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

interface ValidationErrors {
  [key: string]: string;
}

function validateForm(form: Partial<HospitalDetails>): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!form.name?.trim()) {
    errors.name = 'Hospital name is required';
  } else if (form.name.trim().length < 2) {
    errors.name = 'Name must be at least 2 characters';
  } else if (form.name.trim().length > 100) {
    errors.name = 'Name must be under 100 characters';
  }

  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'Enter a valid email address';
  }

  if (form.website) {
    try {
      new URL(form.website);
    } catch {
      errors.website = 'Enter a valid URL (e.g. https://example.com)';
    }
  }

  if (form.phone) {
    const digits = form.phone.replace(/\D/g, '');
    if (digits.length < 10) {
      errors.phone = 'Phone must have at least 10 digits';
    } else if (digits.length > 15) {
      errors.phone = 'Phone must be under 15 digits';
    }
  }

  if (form.addressLine1 && form.addressLine1.length > 200) {
    errors.addressLine1 = 'Address must be under 200 characters';
  }
  if (form.city && form.city.length > 100) {
    errors.city = 'City must be under 100 characters';
  }
  if (form.state && form.state.length > 100) {
    errors.state = 'State must be under 100 characters';
  }
  if (form.postal) {
    if (!/^[A-Za-z0-9\s\-]{3,10}$/.test(form.postal)) {
      errors.postal = 'Enter a valid postal code';
    }
  }
  if (form.country && form.country.length > 60) {
    errors.country = 'Country must be under 60 characters';
  }

  return errors;
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
      <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      {error}
    </p>
  );
}

function SectionCard({ title, icon, children, errorCount }: { title: string; icon: React.ReactNode; children: React.ReactNode; errorCount?: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
        <span className="text-slate-400">{icon}</span>
        <h2 className="text-sm font-medium text-slate-700">{title}</h2>
        {errorCount ? (
          <span className="ml-auto w-5 h-5 rounded-full bg-red-500 text-white text-xs font-semibold flex items-center justify-center">
            {errorCount}
          </span>
        ) : null}
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

export default function HospitalDetailsPage() {
  const { currentHospital, currentHospitalId, profile, refreshProfile } = useAuth();
  const { canEdit } = useRbac();
  const canEditSettings = canEdit('hospital.settings');

  const isManager = profile?.isSuperAdmin || currentHospital?.role === 'HOSPITAL_MANAGER';
  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-700 mb-1">Access Restricted</h2>
        <p className="text-sm text-slate-500">Only hospital managers can access hospital details.</p>
      </div>
    );
  }

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hospitalForm, setHospitalForm] = useState<Partial<HospitalDetails>>({});
  const [originalForm, setOriginalForm] = useState<Partial<HospitalDetails>>({});
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function fetchHospitalDetails() {
      if (!currentHospitalId) return;
      try {
        const res = await apiFetch(`/v1/hospitals/${currentHospitalId}`);
        if (res.ok) {
          const data = await res.json();
          const formData = {
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
          };
          setHospitalForm(formData);
          setOriginalForm(formData);
          setLogoPreview(data.logoUrl || null);
          setPicturePreview(data.pictureUrl || null);
        }
      } catch (error) {
        console.error('Failed to fetch hospital details:', error);
      }
    }
    fetchHospitalDetails();
  }, [currentHospitalId]);

  const updateField = useCallback((field: string, value: string) => {
    setHospitalForm(prev => ({ ...prev, [field]: value }));
    setTouched(prev => ({ ...prev, [field]: true }));
  }, []);

  useEffect(() => {
    const allErrors = validateForm(hospitalForm);
    const visibleErrors: ValidationErrors = {};
    Object.keys(allErrors).forEach(key => {
      if (touched[key]) visibleErrors[key] = allErrors[key];
    });
    setErrors(visibleErrors);
  }, [hospitalForm, touched]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setMessage({ type: 'error', text: 'Logo must be under 2MB' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
        setHospitalForm(prev => ({ ...prev, logoUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  }

  function handlePictureChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setMessage({ type: 'error', text: 'Picture must be under 5MB' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPicturePreview(reader.result as string);
        setHospitalForm(prev => ({ ...prev, pictureUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  }

  function handleCancel() {
    setHospitalForm(originalForm);
    setLogoPreview(originalForm.logoUrl || null);
    setPicturePreview(originalForm.pictureUrl || null);
    setEditMode(false);
    setErrors({});
    setTouched({});
    setMessage(null);
  }

  async function handleSave() {
    const allErrors = validateForm(hospitalForm);
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      setTouched(Object.keys(allErrors).reduce((acc, k) => ({ ...acc, [k]: true }), {}));
      setMessage({ type: 'error', text: 'Please fix the validation errors before saving' });
      return;
    }

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
        setOriginalForm(hospitalForm);
        setTouched({});
        refreshProfile();
      } else {
        const error = await res.json();
        setMessage({ type: 'error', text: error.message || 'Failed to update hospital' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to update hospital' });
    } finally {
      setSaving(false);
    }
  }

  function inputCls(field: string) {
    return `w-full px-3 py-2.5 text-sm border rounded-lg transition-colors focus:outline-none focus:ring-2 ${
      errors[field]
        ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
        : 'border-slate-200 focus:border-navy-500 focus:ring-navy-500/20'
    }`;
  }

  const generalErrors = ['name', 'email', 'website', 'phone'].filter(k => errors[k]).length;
  const addressErrors = ['addressLine1', 'city', 'state', 'postal', 'country'].filter(k => errors[k]).length;

  const generalIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
  const addressIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
  const brandingIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Hospital Details</h1>
          <p className="text-sm text-slate-500">Manage your hospital information and settings</p>
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Save Changes
                  </>
                )}
              </button>
            </>
          ) : canEditSettings ? (
            <button
              onClick={() => setEditMode(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Details
            </button>
          ) : null}
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            {message.type === 'success' ? (
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            )}
          </svg>
          {message.text}
        </div>
      )}

      {/* Section Cards */}
      <div className="space-y-4">
        {/* General Info */}
        <SectionCard title="General Information" icon={generalIcon} errorCount={generalErrors}>
          {editMode ? (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Hospital Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={hospitalForm.name || ''}
                  onChange={(e) => updateField('name', e.target.value)}
                  className={inputCls('name')}
                  placeholder="Hospital name"
                />
                <FieldError error={errors.name} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                <PhoneInput value={hospitalForm.phone || ''} onChange={(v) => updateField('phone', v)} placeholder="Phone number" />
                <FieldError error={errors.phone} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={hospitalForm.email || ''}
                  onChange={(e) => updateField('email', e.target.value)}
                  className={inputCls('email')}
                  placeholder="contact@hospital.com"
                />
                <FieldError error={errors.email} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Website</label>
                <input
                  type="url"
                  value={hospitalForm.website || ''}
                  onChange={(e) => updateField('website', e.target.value)}
                  className={inputCls('website')}
                  placeholder="https://hospital.com"
                />
                <FieldError error={errors.website} />
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <InfoRow label="Hospital Name" value={hospitalForm.name} />
              <InfoRow label="Phone" value={hospitalForm.phone} />
              <InfoRow label="Email" value={hospitalForm.email} />
              <InfoRow label="Website" value={hospitalForm.website} link />
            </div>
          )}
        </SectionCard>

        {/* Address */}
        <SectionCard title="Address" icon={addressIcon} errorCount={addressErrors}>
          {editMode ? (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Street Address</label>
                <input
                  type="text"
                  value={hospitalForm.addressLine1 || ''}
                  onChange={(e) => updateField('addressLine1', e.target.value)}
                  className={inputCls('addressLine1')}
                  placeholder="123 Medical Center Blvd"
                />
                <FieldError error={errors.addressLine1} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Address Line 2</label>
                <input
                  type="text"
                  value={hospitalForm.addressLine2 || ''}
                  onChange={(e) => updateField('addressLine2', e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500"
                  placeholder="Suite, floor (optional)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">City</label>
                <input
                  type="text"
                  value={hospitalForm.city || ''}
                  onChange={(e) => updateField('city', e.target.value)}
                  className={inputCls('city')}
                  placeholder="City"
                />
                <FieldError error={errors.city} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">State</label>
                <input
                  type="text"
                  value={hospitalForm.state || ''}
                  onChange={(e) => updateField('state', e.target.value)}
                  className={inputCls('state')}
                  placeholder="State"
                />
                <FieldError error={errors.state} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Postal Code</label>
                <input
                  type="text"
                  value={hospitalForm.postal || ''}
                  onChange={(e) => updateField('postal', e.target.value)}
                  className={inputCls('postal')}
                  placeholder="12345"
                />
                <FieldError error={errors.postal} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Country</label>
                <input
                  type="text"
                  value={hospitalForm.country || ''}
                  onChange={(e) => updateField('country', e.target.value)}
                  className={inputCls('country')}
                  placeholder="Country"
                />
                <FieldError error={errors.country} />
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <InfoRow label="Street Address" value={hospitalForm.addressLine1} />
              {hospitalForm.addressLine2 && <InfoRow label="Address Line 2" value={hospitalForm.addressLine2} />}
              <InfoRow label="City" value={hospitalForm.city} />
              <InfoRow label="State" value={hospitalForm.state} />
              <InfoRow label="Postal Code" value={hospitalForm.postal} />
              <InfoRow label="Country" value={hospitalForm.country} />
            </div>
          )}
        </SectionCard>

        {/* Branding */}
        <SectionCard title="Branding" icon={brandingIcon}>
          {editMode ? (
            <div className="flex gap-6 items-start">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Logo <span className="text-slate-400 font-normal">(max 2MB)</span>
                </label>
                {logoPreview ? (
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                    <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => { setLogoPreview(null); setHospitalForm(prev => ({ ...prev, logoUrl: '' })); }}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all">
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span className="text-xs text-slate-500 font-medium mt-1">Upload</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                  </label>
                )}
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Picture <span className="text-slate-400 font-normal">(max 5MB)</span>
                </label>
                {picturePreview ? (
                  <div className="relative w-full h-20 rounded-lg overflow-hidden border border-slate-200">
                    <img src={picturePreview} alt="Picture preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => { setPicturePreview(null); setHospitalForm(prev => ({ ...prev, pictureUrl: '' })); }}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all">
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs text-slate-500 font-medium mt-1">Upload</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handlePictureChange} />
                  </label>
                )}
              </div>
            </div>
          ) : (
            <div className="flex gap-6 items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-2">Logo</p>
                {hospitalForm.logoUrl ? (
                  <div className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                    <img src={hospitalForm.logoUrl} alt="Hospital logo" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center">
                    <span className="text-xs text-slate-400">No logo</span>
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-500 mb-2">Picture</p>
                {hospitalForm.pictureUrl ? (
                  <div className="h-20 rounded-lg overflow-hidden border border-slate-200">
                    <img src={hospitalForm.pictureUrl} alt="Hospital" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-20 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center">
                    <span className="text-xs text-slate-400">No picture</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function InfoRow({ label, value, link }: { label: string; value?: string; link?: boolean }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
      {link && value ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-navy-600 hover:underline">
          {value}
        </a>
      ) : (
        <p className="text-sm text-slate-900">{value || <span className="text-slate-400">—</span>}</p>
      )}
    </div>
  );
}
