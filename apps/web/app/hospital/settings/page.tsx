'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import PhoneInput from '../../../components/PhoneInput';
import { useRbac } from '../../../lib/rbac/RbacContext';

export default function SettingsPage() {
  const { currentHospital, profile, refreshProfile } = useAuth();
  const { canEdit } = useRbac();

  // Only hospital managers and super admins can access this page
  const isManager = profile?.isSuperAdmin || currentHospital?.role === 'HOSPITAL_MANAGER';
  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h2 className="text-lg font-semibold text-gray-700 mb-1">Access Restricted</h2>
        <p className="text-sm text-gray-500">Only hospital managers can access settings.</p>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security'>('profile');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Profile form state
  const [profileEditMode, setProfileEditMode] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    phone: '',
  });

  useEffect(() => {
    if (profile) {
      setProfileForm({
        fullName: profile.fullName || '',
        phone: profile.phone || '',
      });
    }
  }, [profile]);

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
          <p className="admin-page-subtitle">Manage your profile and preferences</p>
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
