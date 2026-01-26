'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import { PermissionGate } from '../../../components/rbac';

const ITEMS_PER_PAGE = 10;

interface Doctor {
  id: string;
  userId: string;
  role: 'DOCTOR';
  email: string;
  fullName?: string;
  complianceStatus?: 'compliant' | 'pending_signatures' | 'not_logged_in';
  documentsRequired?: number;
  documentsSigned?: number;
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

function getDoctorStatusInfo(doctor: Doctor) {
  if (!doctor.complianceStatus || doctor.complianceStatus === 'compliant') {
    return {
      label: 'Active',
      color: 'bg-green-100 text-green-700',
      description: 'Ready to use products',
      canAssignLicense: true
    };
  }
  if (doctor.complianceStatus === 'not_logged_in') {
    return {
      label: 'Not Logged In',
      color: 'bg-yellow-100 text-yellow-700',
      description: 'Waiting for first login',
      canAssignLicense: false
    };
  }
  if (doctor.complianceStatus === 'pending_signatures') {
    return {
      label: 'Pending Signatures',
      color: 'bg-orange-100 text-orange-700',
      description: `${doctor.documentsSigned || 0} of ${doctor.documentsRequired || 0} documents signed`,
      canAssignLicense: false
    };
  }
  return { label: 'Unknown', color: 'bg-gray-100 text-gray-700', description: null, canAssignLicense: false };
}

function DoctorsPageContent() {
  const searchParams = useSearchParams();
  const { currentHospital } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Invite modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [resendingInvite, setResendingInvite] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    // Check if action=invite in URL
    if (searchParams.get('action') === 'invite') {
      setShowInviteModal(true);
    }
  }, [searchParams]);

  async function fetchData() {
    try {
      const [membersRes, invitesRes] = await Promise.all([
        apiFetch('/v1/hospitals/members/compliance'),
        apiFetch('/v1/invites/pending'),
      ]);

      if (membersRes.ok) {
        const data = await membersRes.json();
        setDoctors(data.filter((m: any) => m.role === 'DOCTOR'));
      }

      if (invitesRes.ok) {
        const data = await invitesRes.json();
        setPendingInvites(data.filter((inv: Invite) => inv.status === 'PENDING' && inv.role === 'DOCTOR'));
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleInviteDoctor(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await apiFetch('/v1/invites/create-doctor', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail,
          message: inviteMessage || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setInviteUrl(data.inviteUrl);
        setInviteEmail('');
        setInviteMessage('');
        fetchData();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to send invite');
      }
    } catch (error) {
      console.error('Failed to invite doctor:', error);
    } finally {
      setInviting(false);
    }
  }

  async function handleResendInvite(inviteId: string) {
    setResendingInvite(inviteId);
    try {
      const res = await apiFetch(`/v1/invites/${inviteId}/resend`, {
        method: 'POST',
      });

      if (res.ok) {
        alert('Invite resent successfully!');
        fetchData();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to resend invite');
      }
    } catch (error) {
      console.error('Failed to resend invite:', error);
      alert('Failed to resend invite');
    } finally {
      setResendingInvite(null);
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    if (!confirm('Are you sure you want to revoke this invite?')) return;

    try {
      const res = await apiFetch(`/v1/invites/${inviteId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchData();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to revoke invite');
      }
    } catch (error) {
      console.error('Failed to revoke invite:', error);
    }
  }

  // Filter doctors
  const filteredDoctors = doctors.filter(doctor => {
    const matchesSearch =
      doctor.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doctor.fullName?.toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'active') return matchesSearch && doctor.complianceStatus === 'compliant';
    if (statusFilter === 'pending') return matchesSearch && (doctor.complianceStatus === 'pending_signatures' || doctor.complianceStatus === 'not_logged_in');
    return matchesSearch;
  });

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredDoctors.length / ITEMS_PER_PAGE);
  const paginatedDoctors = filteredDoctors.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="admin-page-header flex items-center justify-between">
        <div>
          <h1 className="admin-page-title">Doctors</h1>
          <p className="admin-page-subtitle">
            Manage doctors at {currentHospital?.name}
          </p>
        </div>
        <PermissionGate resource="hospital.doctors" action="add">
          <button
            onClick={() => {
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
        </PermissionGate>
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div className="pro-card">
          <div className="pro-card-header flex items-center justify-between">
            <h3 className="pro-card-title flex items-center gap-2">
              <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Pending Invites ({pendingInvites.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {pendingInvites.map((invite) => {
              const isExpired = new Date(invite.expiresAt) < new Date();
              return (
                <div key={invite.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{invite.invitedEmail}</p>
                      <p className="text-xs text-gray-500">
                        Sent {new Date(invite.createdAt).toLocaleDateString()} ·
                        {isExpired ? (
                          <span className="text-red-600"> Expired</span>
                        ) : (
                          ` Expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`status-pill ${isExpired ? 'status-pill-expired' : 'status-pill-pending'}`}>
                      {isExpired ? 'Expired' : 'Pending'}
                    </span>
                    <button
                      onClick={() => handleResendInvite(invite.id)}
                      disabled={resendingInvite === invite.id}
                      className="quick-action-btn quick-action-btn-secondary"
                    >
                      {resendingInvite === invite.id ? 'Sending...' : 'Resend'}
                    </button>
                    <PermissionGate resource="hospital.doctors" action="delete">
                      <button
                        onClick={() => handleRevokeInvite(invite.id)}
                        className="quick-action-btn quick-action-btn-danger"
                      >
                        Revoke
                      </button>
                    </PermissionGate>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="search-input-wrapper flex-1">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search doctors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="form-input w-full sm:w-40"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending Setup</option>
        </select>
      </div>

      {/* Doctors List */}
      <div className="pro-card">
        <div className="pro-card-header">
          <h3 className="pro-card-title">Doctors ({filteredDoctors.length})</h3>
        </div>
        {paginatedDoctors.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {paginatedDoctors.map((doctor) => {
              const statusInfo = getDoctorStatusInfo(doctor);
              return (
                <div key={doctor.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="avatar avatar-lg">
                        {doctor.fullName?.charAt(0) || doctor.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Dr. {doctor.fullName || doctor.email}
                        </p>
                        <p className="text-xs text-gray-500">{doctor.email}</p>
                        {statusInfo.description && (
                          <p className="text-xs text-gray-400 mt-0.5">{statusInfo.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`status-pill ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/hospital/doctors/${doctor.userId}`}
                          className="quick-action-btn quick-action-btn-secondary"
                        >
                          View Details
                        </Link>
                        {statusInfo.canAssignLicense && (
                          <Link
                            href={`/hospital/licenses?doctor=${doctor.userId}`}
                            className="quick-action-btn quick-action-btn-primary"
                          >
                            Assign License
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="admin-empty-state">
            <div className="admin-empty-icon">
              <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <p className="admin-empty-title">No doctors found</p>
            <p className="admin-empty-description">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Invite doctors to join your hospital'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <PermissionGate resource="hospital.doctors" action="add">
                <div className="admin-empty-action">
                  <button
                    onClick={() => {
                      setShowInviteModal(true);
                      setInviteUrl(null);
                    }}
                    className="btn-primary"
                  >
                    Invite First Doctor
                  </button>
                </div>
              </PermissionGate>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredDoctors.length)} of {filteredDoctors.length} doctors
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                .map((page, idx, arr) => (
                  <React.Fragment key={page}>
                    {idx > 0 && arr[idx - 1] !== page - 1 && (
                      <span className="px-2 text-gray-400">...</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 text-sm rounded ${
                        currentPage === page
                          ? 'bg-[var(--color-primary)] text-white'
                          : 'border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="admin-modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="admin-modal max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h2 className="admin-modal-title">Invite Doctor</h2>
                <p className="admin-modal-subtitle">Send an invitation to join your hospital</p>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="admin-modal-close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="admin-modal-body">
              {inviteUrl ? (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-green-800">Invite sent successfully!</p>
                        <p className="text-xs text-green-700 mt-1">
                          The invitation has been emailed. You can also share this link directly:
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 border rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Invitation Link</p>
                    <p className="text-xs font-mono break-all text-gray-700">{inviteUrl}</p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(inviteUrl);
                      alert('Link copied to clipboard!');
                    }}
                    className="btn-secondary w-full"
                  >
                    Copy Link
                  </button>
                </div>
              ) : (
                <form onSubmit={handleInviteDoctor} className="space-y-4">
                  <div className="form-group">
                    <label className="form-label form-label-required">Email Address</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="form-input"
                      placeholder="doctor@example.com"
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
                      placeholder="Add a personal message to the invitation email..."
                    />
                  </div>
                </form>
              )}
            </div>
            <div className="admin-modal-footer">
              {inviteUrl ? (
                <button
                  onClick={() => {
                    setShowInviteModal(false);
                    setInviteUrl(null);
                  }}
                  className="btn-primary"
                >
                  Done
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInviteDoctor}
                    disabled={inviting || !inviteEmail}
                    className="btn-primary"
                  >
                    {inviting ? 'Sending...' : 'Send Invite'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DoctorsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DoctorsPageContent />
    </Suspense>
  );
}
