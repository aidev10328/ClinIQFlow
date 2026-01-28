'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';

interface Member {
  id: string;
  userId: string;
  role: 'HOSPITAL_MANAGER' | 'DOCTOR';
  user: {
    email: string;
    displayName?: string;
  };
  complianceStatus?: 'compliant' | 'pending_signatures' | 'not_logged_in';
  documentsRequired?: number;
  documentsSigned?: number;
}

interface StaffAccount {
  id: string;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string;
}

interface Invite {
  id: string;
  invitedEmail: string;
  role: string;
  status: string;
  expiresAt: string;
}

function getMemberStatusInfo(member: Member) {
  if (!member.complianceStatus || member.complianceStatus === 'compliant') {
    return { label: 'Active', color: 'bg-green-100 text-green-700', description: null };
  }
  if (member.complianceStatus === 'not_logged_in') {
    return { label: 'Not Logged In', color: 'bg-yellow-100 text-yellow-700', description: 'User has not logged in yet' };
  }
  if (member.complianceStatus === 'pending_signatures') {
    return {
      label: 'Pending Signatures',
      color: 'bg-orange-100 text-orange-700',
      description: `${member.documentsSigned || 0} of ${member.documentsRequired || 0} documents signed`
    };
  }
  return { label: 'Active', color: 'bg-green-100 text-green-700', description: null };
}

export default function HospitalUsersPage() {
  const router = useRouter();
  const { user, profile, hospitals, currentHospitalId, loading: authLoading, legalStatus } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'doctors' | 'staff'>('doctors');
  const [resendingInvite, setResendingInvite] = useState<string | null>(null);

  // Invite doctor modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  // Create staff modal
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [newStaff, setNewStaff] = useState({
    username: '',
    password: '',
    displayName: '',
    role: 'receptionist',
  });
  const [creatingStaff, setCreatingStaff] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (!authLoading && profile && !currentHospitalId) {
      router.push('/select-hospital');
      return;
    }
    if (!authLoading && user && currentHospitalId) {
      fetchData();
    }
  }, [user, profile, currentHospitalId, authLoading, router]);

  async function fetchData() {
    try {
      const [membersRes, staffRes, invitesRes] = await Promise.all([
        apiFetch('/v1/hospitals/members/compliance'),
        apiFetch('/v1/staff'),
        apiFetch('/v1/invites/pending'),
      ]);

      if (membersRes.ok) {
        const data = await membersRes.json();
        setMembers(data);
      }

      if (staffRes.ok) {
        const data = await staffRes.json();
        setStaff(data);
      }

      if (invitesRes.ok) {
        const data = await invitesRes.json();
        setPendingInvites(data.filter((inv: Invite) => inv.status === 'PENDING'));
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

  async function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault();
    setCreatingStaff(true);
    try {
      const res = await apiFetch('/v1/staff', {
        method: 'POST',
        body: JSON.stringify(newStaff),
      });

      if (res.ok) {
        setShowStaffModal(false);
        setNewStaff({
          username: '',
          password: '',
          displayName: '',
          role: 'receptionist',
        });
        fetchData();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to create staff');
      }
    } catch (error) {
      console.error('Failed to create staff:', error);
    } finally {
      setCreatingStaff(false);
    }
  }

  async function handleToggleStaffStatus(staffId: string, currentStatus: boolean) {
    try {
      const res = await apiFetch(`/v1/staff/${staffId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !currentStatus }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Failed to update staff:', error);
    }
  }

  if (authLoading || loading || legalStatus === 'checking' || legalStatus === 'unknown') {
    return null;
  }

  // Don't render if redirecting to legal page
  if (legalStatus === 'pending') {
    return <div className="p-4 text-gray-500">Redirecting...</div>;
  }

  const currentHospital = hospitals.find(h => h.id === currentHospitalId);
  const isManager = currentHospital?.role === 'HOSPITAL_MANAGER' || profile?.isSuperAdmin;

  // Separate managers and doctors
  const managers = members.filter(m => m.role === 'HOSPITAL_MANAGER');
  const doctors = members.filter(m => m.role === 'DOCTOR');

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="page-title text-xl sm:text-2xl">Team Management</h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('doctors')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'doctors'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Doctors & Managers
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'staff'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Staff Accounts
          </button>
        </nav>
      </div>

      {/* Doctors Tab */}
      {activeTab === 'doctors' && (
        <div className="space-y-6">
          {isManager && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setShowInviteModal(true);
                  setInviteUrl(null);
                }}
                className="btn-primary"
              >
                Invite Doctor
              </button>
            </div>
          )}

          {/* Pending Invites */}
          {pendingInvites.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Pending Invites</h3>
              <div className="space-y-2">
                {pendingInvites.map((invite) => {
                  const isExpired = new Date(invite.expiresAt) < new Date();
                  return (
                    <div
                      key={invite.id}
                      className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0"
                    >
                      <div>
                        <p className="text-sm text-gray-900">{invite.invitedEmail}</p>
                        <p className="text-xs text-gray-500">
                          {invite.role === 'DOCTOR' ? 'Doctor' : 'Manager'} ·
                          {isExpired ? (
                            <span className="text-red-600"> Expired</span>
                          ) : (
                            ` Expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded ${isExpired ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {isExpired ? 'Expired' : 'Pending'}
                        </span>
                        {isManager && (
                          <button
                            onClick={() => handleResendInvite(invite.id)}
                            disabled={resendingInvite === invite.id}
                            className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                          >
                            {resendingInvite === invite.id ? 'Sending...' : 'Resend'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Managers Section */}
          {managers.length > 0 && (
            <div className="card">
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-sm font-medium text-gray-700">Hospital Managers</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {managers.map((manager) => {
                  const statusInfo = getMemberStatusInfo(manager);
                  return (
                    <div key={manager.id} className="p-4 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {manager.user.displayName || manager.user.email}
                        </p>
                        <p className="text-xs text-gray-500">{manager.user.email}</p>
                        {statusInfo.description && (
                          <p className="text-xs text-gray-400 mt-1">{statusInfo.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                        <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700">
                          Manager
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Doctors Section */}
          <div className="card">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-700">Doctors</h3>
            </div>
            {doctors.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {doctors.map((doctor) => {
                  const statusInfo = getMemberStatusInfo(doctor);
                  return (
                    <div key={doctor.id} className="p-4 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {doctor.user.displayName || doctor.user.email}
                        </p>
                        <p className="text-xs text-gray-500">{doctor.user.email}</p>
                        {statusInfo.description && (
                          <p className="text-xs text-gray-400 mt-1">{statusInfo.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                        <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
                          Doctor
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                No doctors yet. Invite doctors to get started.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Staff Tab */}
      {activeTab === 'staff' && (
        <div className="space-y-6">
          {isManager && (
            <div className="flex justify-end">
              <button onClick={() => setShowStaffModal(true)} className="btn-primary">
                Create Staff Account
              </button>
            </div>
          )}

          <div className="card">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-700">Staff Accounts</h3>
            </div>
            {staff.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {staff.map((s) => (
                  <div key={s.id} className="p-4 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.displayName}</p>
                      <p className="text-xs text-gray-500">
                        @{s.username} · {s.role}
                      </p>
                      {s.lastLoginAt && (
                        <p className="text-xs text-gray-400">
                          Last login: {new Date(s.lastLoginAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          s.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {isManager && (
                        <button
                          onClick={() => handleToggleStaffStatus(s.id, s.isActive)}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          {s.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                No staff accounts yet. Create one to allow staff login.
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Staff Login URL:</strong>{' '}
              <code className="bg-blue-100 px-2 py-0.5 rounded">/staff/login</code>
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Staff accounts use username/password authentication, separate from doctor accounts.
            </p>
          </div>
        </div>
      )}

      {/* Invite Doctor Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-lg font-semibold mb-4">Invite Doctor</h2>

            {inviteUrl ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800 font-medium mb-2">
                    Invite sent successfully!
                  </p>
                  <p className="text-xs text-green-700 mb-2">
                    The invite link has been emailed. You can also share this link directly:
                  </p>
                  <div className="bg-white border rounded p-2 text-xs break-all">
                    {inviteUrl}
                  </div>
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
              <form onSubmit={handleInviteDoctor} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="input-field"
                    placeholder="doctor@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message (optional)
                  </label>
                  <textarea
                    value={inviteMessage}
                    onChange={(e) => setInviteMessage(e.target.value)}
                    className="input-field"
                    rows={3}
                    placeholder="Personal message to include in the invite email..."
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="submit" className="btn-primary flex-1" disabled={inviting}>
                    {inviting ? 'Sending...' : 'Send Invite'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Create Staff Modal */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-lg font-semibold mb-4">Create Staff Account</h2>
            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name *
                </label>
                <input
                  type="text"
                  value={newStaff.displayName}
                  onChange={(e) => setNewStaff({ ...newStaff, displayName: e.target.value })}
                  className="input-field"
                  placeholder="John Smith"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  value={newStaff.username}
                  onChange={(e) => setNewStaff({ ...newStaff, username: e.target.value.toLowerCase() })}
                  className="input-field"
                  placeholder="jsmith"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Staff will login with this username
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  value={newStaff.password}
                  onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                  className="input-field"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role *
                </label>
                <select
                  value={newStaff.role}
                  onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                  className="input-field"
                  required
                >
                  <option value="receptionist">Receptionist</option>
                  <option value="nurse">Nurse</option>
                  <option value="billing">Billing</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="btn-primary flex-1" disabled={creatingStaff}>
                  {creatingStaff ? 'Creating...' : 'Create Account'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowStaffModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
