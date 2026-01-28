'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import { PageHeader, StatusBadge, LoadingState } from '../../../components/admin/ui';
import PhoneInput from '../../../components/PhoneInput';

interface Hospital {
  id: string;
  name: string;
  city?: string;
  state?: string;
  country: string;
  region: string;
  currency: string;
  timezone: string;
  status: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
}

interface Invite {
  id: string;
  hospitalId: string;
  hospitalName: string;
  invitedEmail: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export default function AdminHospitalsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [hospitalInvites, setHospitalInvites] = useState<Record<string, Invite[]>>({});
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Create hospital form
  const [newHospital, setNewHospital] = useState({
    name: '',
    city: '',
    state: '',
    country: 'USA',
    region: 'US',
    currency: 'USD',
    timezone: 'America/Chicago',
    phone: '',
    email: '',
    website: '',
  });

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (user) {
      fetchHospitals();
    }
  }, [user]);

  async function fetchHospitals() {
    try {
      const res = await apiFetch('/v1/hospitals');
      if (res.ok) {
        const data = await res.json();
        setHospitals(data);
        // Fetch invites for each hospital
        const invitesMap: Record<string, Invite[]> = {};
        await Promise.all(
          data.map(async (hospital: Hospital) => {
            try {
              const invitesRes = await apiFetch(`/v1/invites/hospital/${hospital.id}`);
              if (invitesRes.ok) {
                const invites = await invitesRes.json();
                invitesMap[hospital.id] = invites.filter((inv: Invite) => inv.status === 'PENDING');
              }
            } catch (e) {
              console.error(`Failed to fetch invites for ${hospital.id}:`, e);
            }
          })
        );
        setHospitalInvites(invitesMap);
      }
    } catch (error) {
      console.error('Failed to fetch hospitals:', error);
    } finally {
      setLoading(false);
    }
  }

  // Filtered hospitals based on search and filters
  const filteredHospitals = useMemo(() => {
    return hospitals.filter((hospital) => {
      const matchesSearch =
        searchQuery === '' ||
        hospital.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        hospital.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        hospital.state?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        hospital.email?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRegion = regionFilter === '' || hospital.region === regionFilter;
      const matchesStatus = statusFilter === '' || hospital.status === statusFilter;

      return matchesSearch && matchesRegion && matchesStatus;
    });
  }, [hospitals, searchQuery, regionFilter, statusFilter]);

  async function handleCreateHospital(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await apiFetch('/v1/hospitals', {
        method: 'POST',
        body: JSON.stringify(newHospital),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setNewHospital({
          name: '',
          city: '',
          state: '',
          country: 'USA',
          region: 'US',
          currency: 'USD',
          timezone: 'America/Chicago',
          phone: '',
          email: '',
          website: '',
        });
        fetchHospitals();
      }
    } catch (error) {
      console.error('Failed to create hospital:', error);
    }
  }

  async function handleInviteManager(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedHospital) return;

    setInviting(true);
    try {
      const res = await apiFetch('/v1/invites/create-manager', {
        method: 'POST',
        body: JSON.stringify({
          hospitalId: selectedHospital.id,
          email: inviteEmail,
          message: inviteMessage || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setInviteUrl(data.inviteUrl);
        setInviteEmail('');
        setInviteMessage('');
        fetchHospitals();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to send invite');
      }
    } catch (error) {
      console.error('Failed to invite manager:', error);
    } finally {
      setInviting(false);
    }
  }

  const regionFlags: Record<string, string> = {
    US: '🇺🇸',
    UK: '🇬🇧',
    IN: '🇮🇳',
  };

  if (loading) {
    return null;
  }

  return (
    <div>
      <PageHeader
        title="Hospitals"
        subtitle={`${hospitals.length} hospital${hospitals.length !== 1 ? 's' : ''} registered`}
        actions={
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Hospital
          </button>
        }
      />

      {/* Search and Filters */}
      <div className="pro-card mb-4">
        <div className="p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="flex-1">
              <div className="search-input-wrapper">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search hospitals..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>

            {/* Region Filter */}
            <div className="w-full sm:w-32">
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                className="form-input"
              >
                <option value="">All Regions</option>
                <option value="US">🇺🇸 US</option>
                <option value="UK">🇬🇧 UK</option>
                <option value="IN">🇮🇳 India</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="w-full sm:w-32">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="form-input"
              >
                <option value="">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>
          </div>

          {/* Active Filters Display */}
          {(searchQuery || regionFilter || statusFilter) && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">Filters:</span>
              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                  "{searchQuery}"
                  <button onClick={() => setSearchQuery('')} className="hover:text-gray-900">×</button>
                </span>
              )}
              {regionFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                  {regionFlags[regionFilter]} {regionFilter}
                  <button onClick={() => setRegionFilter('')} className="hover:text-blue-900">×</button>
                </span>
              )}
              {statusFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-full">
                  {statusFilter}
                  <button onClick={() => setStatusFilter('')} className="hover:text-green-900">×</button>
                </span>
              )}
              <button
                onClick={() => {
                  setSearchQuery('');
                  setRegionFilter('');
                  setStatusFilter('');
                }}
                className="text-xs text-gray-500 hover:text-gray-700 ml-2"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results Count */}
      {filteredHospitals.length !== hospitals.length && (
        <p className="text-sm text-gray-500 mb-4">
          Showing {filteredHospitals.length} of {hospitals.length} hospitals
        </p>
      )}

      {/* Hospitals Grid */}
      <div className="hospital-grid">
        {filteredHospitals.map((hospital) => {
          const pendingInvites = hospitalInvites[hospital.id] || [];
          return (
            <div
              key={hospital.id}
              className="hospital-card"
              onClick={() => router.push(`/admin/hospitals/${hospital.id}`)}
            >
              <div className="hospital-card-header">
                <div className="flex items-start">
                  <div className="hospital-logo">
                    {hospital.logoUrl ? (
                      <img src={hospital.logoUrl} alt={hospital.name} />
                    ) : (
                      <svg className="hospital-logo-placeholder" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    )}
                  </div>
                  <div className="hospital-info">
                    <h3 className="hospital-name">
                      {hospital.name}
                    </h3>
                    <p className="hospital-location">
                      {hospital.city && hospital.state
                        ? `${hospital.city}, ${hospital.state}`
                        : hospital.country}
                    </p>
                  </div>
                </div>
                <StatusBadge status={hospital.status?.toLowerCase() || 'active'} size="sm" />
              </div>

              <div className="hospital-meta">
                <span className="hospital-tag hospital-tag-region">
                  {regionFlags[hospital.region] || ''} {hospital.region}
                </span>
                <span className="hospital-tag hospital-tag-currency">
                  {hospital.currency}
                </span>
                {pendingInvites.length > 0 && (
                  <span className="hospital-tag hospital-tag-invites">
                    {pendingInvites.length} pending
                  </span>
                )}
              </div>

              {/* Quick Contact Info */}
              {(hospital.phone || hospital.email) && (
                <div className="mt-3 pt-2 border-t border-gray-100 space-y-1">
                  {hospital.phone && (
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {hospital.phone}
                    </p>
                  )}
                  {hospital.email && (
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {hospital.email}
                    </p>
                  )}
                </div>
              )}

              {/* Actions - always at bottom */}
              <div className="flex items-center gap-2 mt-auto pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => {
                    setSelectedHospital(hospital);
                    setShowInviteModal(true);
                    setInviteUrl(null);
                  }}
                  className="quick-action-btn quick-action-btn-secondary flex-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Invite Manager
                </button>
                <button
                  onClick={() => router.push(`/admin/hospitals/${hospital.id}`)}
                  className="quick-action-btn quick-action-btn-primary flex-1"
                >
                  View Details
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredHospitals.length === 0 && (
        <div className="pro-card">
          <div className="admin-empty-state">
            <div className="admin-empty-icon">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            </div>
            <h3 className="admin-empty-title">
              {hospitals.length === 0 ? 'No hospitals yet' : 'No hospitals match your filters'}
            </h3>
            <p className="admin-empty-description">
              {hospitals.length === 0
                ? 'Create your first hospital to get started with ClinQflow.'
                : 'Try adjusting your search or filter criteria.'}
            </p>
            <div className="admin-empty-action">
              {hospitals.length === 0 ? (
                <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Hospital
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setRegionFilter('');
                    setStatusFilter('');
                  }}
                  className="btn-secondary"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Hospital Modal */}
      {showCreateModal && (
        <div className="admin-modal-overlay">
          <div className="admin-modal max-w-lg">
            <div className="admin-modal-header">
              <div>
                <h2 className="admin-modal-title">Add New Hospital</h2>
                <p className="admin-modal-subtitle">Enter hospital details below</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="admin-modal-close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateHospital}>
              <div className="admin-modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label form-label-required">Hospital Name</label>
                    <input
                      type="text"
                      value={newHospital.name}
                      onChange={(e) => setNewHospital({ ...newHospital, name: e.target.value })}
                      className="form-input"
                      placeholder="Enter hospital name"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-group">
                      <label className="form-label">City</label>
                      <input
                        type="text"
                        value={newHospital.city}
                        onChange={(e) => setNewHospital({ ...newHospital, city: e.target.value })}
                        className="form-input"
                        placeholder="City"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">State/Province</label>
                      <input
                        type="text"
                        value={newHospital.state}
                        onChange={(e) => setNewHospital({ ...newHospital, state: e.target.value })}
                        className="form-input"
                        placeholder="State"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-group">
                      <label className="form-label form-label-required">Country</label>
                      <input
                        type="text"
                        value={newHospital.country}
                        onChange={(e) => setNewHospital({ ...newHospital, country: e.target.value })}
                        className="form-input"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label form-label-required">Region</label>
                      <select
                        value={newHospital.region}
                        onChange={(e) => setNewHospital({ ...newHospital, region: e.target.value })}
                        className="form-input"
                        required
                      >
                        <option value="US">🇺🇸 US</option>
                        <option value="UK">🇬🇧 UK</option>
                        <option value="IN">🇮🇳 India</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-group">
                      <label className="form-label form-label-required">Currency</label>
                      <select
                        value={newHospital.currency}
                        onChange={(e) => setNewHospital({ ...newHospital, currency: e.target.value })}
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
                        value={newHospital.timezone}
                        onChange={(e) => setNewHospital({ ...newHospital, timezone: e.target.value })}
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

                  <div className="border-t border-gray-100 pt-4 mt-2">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Contact Information</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="form-group">
                        <label className="form-label">Phone</label>
                        <PhoneInput
                          value={newHospital.phone}
                          onChange={(value) => setNewHospital({ ...newHospital, phone: value })}
                          placeholder="Phone number"
                          useHospitalDefault={false}
                          defaultCountryCode={newHospital.region === 'US' ? 'US' : newHospital.region === 'UK' ? 'GB' : newHospital.region === 'IN' ? 'IN' : 'US'}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Email</label>
                        <input
                          type="email"
                          value={newHospital.email}
                          onChange={(e) => setNewHospital({ ...newHospital, email: e.target.value })}
                          className="form-input"
                          placeholder="contact@hospital.com"
                        />
                      </div>
                    </div>
                    <div className="form-group mt-4">
                      <label className="form-label">Website</label>
                      <input
                        type="url"
                        value={newHospital.website}
                        onChange={(e) => setNewHospital({ ...newHospital, website: e.target.value })}
                        className="form-input"
                        placeholder="https://www.hospital.com"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="admin-modal-footer">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Hospital
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Manager Modal */}
      {showInviteModal && selectedHospital && (
        <div className="admin-modal-overlay">
          <div className="admin-modal max-w-md">
            <div className="admin-modal-header">
              <div>
                <h2 className="admin-modal-title">Invite Hospital Manager</h2>
                <p className="admin-modal-subtitle">to {selectedHospital.name}</p>
              </div>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteUrl(null);
                }}
                className="admin-modal-close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {inviteUrl ? (
              <div className="admin-modal-body">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  className="btn-primary w-full mt-4"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleInviteManager}>
                <div className="admin-modal-body">
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label form-label-required">Email Address</label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="form-input"
                        placeholder="manager@hospital.com"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Personal Message (optional)</label>
                      <textarea
                        value={inviteMessage}
                        onChange={(e) => setInviteMessage(e.target.value)}
                        className="form-input"
                        rows={3}
                        placeholder="Add a personal message to the invite email..."
                      />
                    </div>
                  </div>
                </div>
                <div className="admin-modal-footer">
                  <button type="button" onClick={() => setShowInviteModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={inviting}>
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
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
