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

type StatusType = 'active' | 'pending' | 'not_logged_in' | 'unknown';

function getDoctorStatusInfo(doctor: Doctor): { label: string; type: StatusType; description: string | null; canAssignLicense: boolean } {
  if (!doctor.complianceStatus || doctor.complianceStatus === 'compliant') {
    return { label: 'Active', type: 'active', description: 'Ready to use products', canAssignLicense: true };
  }
  if (doctor.complianceStatus === 'not_logged_in') {
    return { label: 'Not Logged In', type: 'not_logged_in', description: 'Waiting for first login', canAssignLicense: false };
  }
  if (doctor.complianceStatus === 'pending_signatures') {
    return {
      label: 'Pending Signatures',
      type: 'pending',
      description: `${doctor.documentsSigned || 0} of ${doctor.documentsRequired || 0} documents signed`,
      canAssignLicense: false
    };
  }
  return { label: 'Unknown', type: 'unknown', description: null, canAssignLicense: false };
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
  const [activeTab, setActiveTab] = useState<'doctors' | 'invites'>('doctors');

  // Invite modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [resendingInvite, setResendingInvite] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
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
        body: JSON.stringify({ email: inviteEmail, message: inviteMessage || undefined }),
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
      const res = await apiFetch(`/v1/invites/${inviteId}/resend`, { method: 'POST' });
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
      const res = await apiFetch(`/v1/invites/${inviteId}`, { method: 'DELETE' });
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

  // Stats
  const activeCount = doctors.filter(d => d.complianceStatus === 'compliant' || !d.complianceStatus).length;
  const pendingCount = doctors.filter(d => d.complianceStatus === 'pending_signatures' || d.complianceStatus === 'not_logged_in').length;

  // Filter doctors
  const filteredDoctors = doctors.filter(doctor => {
    const matchesSearch =
      doctor.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doctor.fullName?.toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'active') return matchesSearch && (doctor.complianceStatus === 'compliant' || !doctor.complianceStatus);
    if (statusFilter === 'pending') return matchesSearch && (doctor.complianceStatus === 'pending_signatures' || doctor.complianceStatus === 'not_logged_in');
    return matchesSearch;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const totalPages = Math.ceil(filteredDoctors.length / ITEMS_PER_PAGE);
  const paginatedDoctors = filteredDoctors.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Doctors</h1>
          <p className="text-sm text-slate-500">Manage doctors at {currentHospital?.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Stats badges */}
          <div className="hidden md:flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-medium text-slate-600">
              {doctors.length} total
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 rounded-lg text-xs font-medium text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {activeCount} active
            </span>
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 rounded-lg text-xs font-medium text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {pendingCount} pending
              </span>
            )}
          </div>
          <PermissionGate resource="hospital.doctors" action="add">
            <button
              onClick={() => { setShowInviteModal(true); setInviteUrl(null); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Invite Doctor
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('doctors')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'doctors'
              ? 'border-navy-600 text-navy-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          All Doctors
        </button>
        <button
          onClick={() => setActiveTab('invites')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'invites'
              ? 'border-navy-600 text-navy-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Pending Invites
          {pendingInvites.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
              {pendingInvites.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'doctors' ? (
        <>
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 bg-white"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 bg-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="pending">Pending Setup</option>
            </select>
          </div>

          {/* Doctors Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {paginatedDoctors.length > 0 ? (
              <>
                {/* Table Header */}
                <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <div className="col-span-5 text-xs font-medium text-slate-500 uppercase tracking-wide">Doctor</div>
                  <div className="col-span-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</div>
                  <div className="col-span-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Joined</div>
                  <div className="col-span-2 text-xs font-medium text-slate-500 uppercase tracking-wide text-right">Actions</div>
                </div>

                {/* Table Body */}
                <div className="divide-y divide-slate-100">
                  {paginatedDoctors.map((doctor) => {
                    const statusInfo = getDoctorStatusInfo(doctor);
                    const statusStyles = {
                      active: 'bg-emerald-50 text-emerald-700',
                      pending: 'bg-amber-50 text-amber-700',
                      not_logged_in: 'bg-slate-100 text-slate-600',
                      unknown: 'bg-slate-100 text-slate-500',
                    };
                    return (
                      <div key={doctor.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 px-4 py-4 hover:bg-slate-50/50 transition-colors items-center">
                        {/* Doctor Info */}
                        <div className="col-span-5 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-navy-600 text-sm font-semibold">
                            {doctor.fullName?.charAt(0) || doctor.email.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              Dr. {doctor.fullName || doctor.email.split('@')[0]}
                            </p>
                            <p className="text-xs text-slate-500 truncate">{doctor.email}</p>
                          </div>
                        </div>

                        {/* Status */}
                        <div className="col-span-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${statusStyles[statusInfo.type]}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              statusInfo.type === 'active' ? 'bg-emerald-500' :
                              statusInfo.type === 'pending' ? 'bg-amber-500' : 'bg-slate-400'
                            }`} />
                            {statusInfo.label}
                          </span>
                          {statusInfo.description && (
                            <p className="text-[11px] text-slate-400 mt-0.5">{statusInfo.description}</p>
                          )}
                        </div>

                        {/* Joined Date */}
                        <div className="col-span-2">
                          <p className="text-sm text-slate-600">
                            {new Date(doctor.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="col-span-2 flex items-center justify-end gap-2">
                          <Link
                            href={`/hospital/doctors/${doctor.userId}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            View
                          </Link>
                          {statusInfo.canAssignLicense && (
                            <Link
                              href={`/hospital/billing?doctor=${doctor.userId}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-navy-600 bg-navy-50 rounded-lg hover:bg-blue-100 transition-colors"
                              title="Assign License"
                            >
                              License
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
                    <p className="text-sm text-slate-500">
                      Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredDoctors.length)} of {filteredDoctors.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <span className="px-3 text-sm text-slate-600">{currentPage} / {totalPages}</span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-16 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <p className="text-base font-medium text-slate-700">No doctors found</p>
                <p className="text-sm text-slate-500 mt-1">
                  {searchQuery || statusFilter !== 'all' ? 'Try adjusting your search or filters' : 'Invite doctors to join your hospital'}
                </p>
                {!searchQuery && statusFilter === 'all' && (
                  <PermissionGate resource="hospital.doctors" action="add">
                    <button
                      onClick={() => { setShowInviteModal(true); setInviteUrl(null); }}
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 transition-colors"
                    >
                      Invite First Doctor
                    </button>
                  </PermissionGate>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Pending Invites Tab */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {pendingInvites.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {pendingInvites.map((invite) => {
                const isExpired = new Date(invite.expiresAt) < new Date();
                return (
                  <div key={invite.id} className="px-4 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{invite.invitedEmail}</p>
                        <p className="text-xs text-slate-500">
                          Sent {new Date(invite.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {isExpired ? (
                            <span className="text-red-500 ml-1">· Expired</span>
                          ) : (
                            <span className="text-slate-400 ml-1">· Expires {new Date(invite.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-lg ${isExpired ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                        {isExpired ? 'Expired' : 'Pending'}
                      </span>
                      <button
                        onClick={() => handleResendInvite(invite.id)}
                        disabled={resendingInvite === invite.id}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                      >
                        {resendingInvite === invite.id ? 'Sending...' : 'Resend'}
                      </button>
                      <PermissionGate resource="hospital.doctors" action="delete">
                        <button
                          onClick={() => handleRevokeInvite(invite.id)}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          Revoke
                        </button>
                      </PermissionGate>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-base font-medium text-slate-700">No pending invites</p>
              <p className="text-sm text-slate-500 mt-1">All invitations have been accepted or expired</p>
            </div>
          )}
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowInviteModal(false)}>
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Invite Doctor</h2>
                <p className="text-sm text-slate-500">Send an invitation to join your hospital</p>
              </div>
              <button onClick={() => setShowInviteModal(false)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5">
              {inviteUrl ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-emerald-800">Invite sent successfully!</p>
                      <p className="text-xs text-emerald-600 mt-0.5">The invitation has been emailed. You can also share the link directly.</p>
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Invitation Link</p>
                    <p className="text-sm font-mono text-slate-700 break-all">{inviteUrl}</p>
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(inviteUrl); alert('Link copied!'); }}
                    className="w-full py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy Link
                  </button>
                </div>
              ) : (
                <form onSubmit={handleInviteDoctor} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500"
                      placeholder="doctor@example.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Personal Message (optional)</label>
                    <textarea
                      value={inviteMessage}
                      onChange={(e) => setInviteMessage(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 resize-none"
                      rows={3}
                      placeholder="Add a personal message to the invitation email..."
                    />
                  </div>
                </form>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
              {inviteUrl ? (
                <button
                  onClick={() => { setShowInviteModal(false); setInviteUrl(null); }}
                  className="px-4 py-2 text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 transition-colors"
                >
                  Done
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInviteDoctor}
                    disabled={inviting || !inviteEmail}
                    className="px-4 py-2 text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                  >
                    {inviting && (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
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
        <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DoctorsPageContent />
    </Suspense>
  );
}
