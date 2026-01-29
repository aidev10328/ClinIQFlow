'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import PhoneInput from '../../../components/PhoneInput';

const ITEMS_PER_PAGE = 10;

interface StaffMember {
  id: string;
  email: string;
  displayName: string;
  title?: string | null;
  phone?: string | null;
  status: string;
  hospitalId: string;
  hospitalName?: string;
  assignedDoctorIds?: string[] | null;
  createdAt: string;
}

interface Doctor {
  id: string;
  userId: string;
  email: string;
  fullName?: string;
  role: string;
}

function StaffPageContent() {
  const searchParams = useSearchParams();
  const { currentHospital } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    title: '',
    phone: '',
  });

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
  const [assignAll, setAssignAll] = useState(true);
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>([]);

  // Delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingStaff, setDeletingStaff] = useState<StaffMember | null>(null);

  // Password reset modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordResetStaff, setPasswordResetStaff] = useState<StaffMember | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  useEffect(() => {
    fetchData();
    if (searchParams.get('action') === 'add') {
      setShowModal(true);
    }
  }, [searchParams]);

  async function fetchData() {
    try {
      const [staffRes, membersRes] = await Promise.all([
        apiFetch('/v1/staff'),
        apiFetch('/v1/hospitals/members/compliance'),
      ]);
      if (staffRes.ok) setStaff(await staffRes.json());
      if (membersRes.ok) {
        const m = await membersRes.json();
        setDoctors(m.filter((x: any) => x.role === 'DOCTOR'));
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormData({ email: '', password: '', firstName: '', lastName: '', title: '', phone: '' });
    setEditingStaff(null);
    setAssignAll(true);
    setSelectedDoctorIds([]);
  }

  function handleEdit(staffMember: StaffMember) {
    setEditingStaff(staffMember);
    const nameParts = (staffMember.displayName || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    setFormData({
      email: staffMember.email,
      password: '',
      firstName,
      lastName,
      title: staffMember.title || '',
      phone: staffMember.phone || '',
    });
    if (staffMember.assignedDoctorIds && staffMember.assignedDoctorIds.length > 0) {
      setAssignAll(false);
      setSelectedDoctorIds(staffMember.assignedDoctorIds);
    } else {
      setAssignAll(true);
      setSelectedDoctorIds([]);
    }
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const assignedDoctorIds = assignAll ? null : selectedDoctorIds;
    const displayName = `${formData.firstName} ${formData.lastName}`.trim();

    try {
      if (editingStaff) {
        const res = await apiFetch(`/v1/staff/${editingStaff.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            displayName,
            title: formData.title || undefined,
            phone: formData.phone || undefined,
            assignedDoctorIds,
          }),
        });

        if (res.ok) {
          setShowModal(false);
          resetForm();
          fetchData();
          setMessage({ type: 'success', text: 'Staff updated' });
        } else {
          const error = await res.json();
          alert(error.message || 'Failed to update staff');
        }
      } else {
        const res = await apiFetch('/v1/staff', {
          method: 'POST',
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            displayName,
            title: formData.title || undefined,
            phone: formData.phone || undefined,
            assignedDoctorIds,
          }),
        });

        if (res.ok) {
          setShowModal(false);
          resetForm();
          fetchData();
          setMessage({ type: 'success', text: 'Staff created' });
        } else {
          const error = await res.json();
          alert(error.message || 'Failed to create staff account');
        }
      }
    } catch (error) {
      console.error('Failed to save staff:', error);
      alert('Failed to save staff account');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(staffMember: StaffMember) {
    const newStatus = staffMember.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await apiFetch(`/v1/staff/${staffMember.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchData();
    } catch (error) {
      console.error('Failed to update staff:', error);
    }
  }

  async function handleDelete() {
    if (!deletingStaff) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/v1/staff/${deletingStaff.id}`, { method: 'DELETE' });
      if (res.ok) {
        setShowDeleteModal(false);
        setDeletingStaff(null);
        fetchData();
        setMessage({ type: 'success', text: 'Staff deleted' });
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to delete staff');
      }
    } catch (error) {
      console.error('Failed to delete staff:', error);
      alert('Failed to delete staff');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordResetStaff) return;
    setResettingPassword(true);
    try {
      const res = await apiFetch(`/v1/staff/${passwordResetStaff.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      });
      if (res.ok) {
        setShowPasswordModal(false);
        setPasswordResetStaff(null);
        setNewPassword('');
        setMessage({ type: 'success', text: `Password reset for ${passwordResetStaff.displayName}` });
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to reset password');
      }
    } catch (error) {
      console.error('Failed to reset password:', error);
      alert('Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  }

  function getDoctorAssignmentLabel(s: StaffMember): string {
    if (!s.assignedDoctorIds || s.assignedDoctorIds.length === 0) return 'All';
    return `${s.assignedDoctorIds.length} doctor${s.assignedDoctorIds.length > 1 ? 's' : ''}`;
  }

  // Filter staff
  const filteredStaff = staff.filter(s => {
    const matchesSearch =
      s.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.title || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && s.status === 'ACTIVE') ||
      (statusFilter === 'inactive' && s.status === 'INACTIVE');

    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const totalPages = Math.ceil(filteredStaff.length / ITEMS_PER_PAGE);
  const paginatedStaff = filteredStaff.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  if (loading) return null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="admin-page-header flex items-center justify-between">
        <div>
          <h1 className="admin-page-title">Staff</h1>
          <p className="admin-page-subtitle">
            Manage staff members at {currentHospital?.name}
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="btn-primary"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Staff
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto hover:opacity-70">x</button>
        </div>
      )}

      {/* Info Banner */}
      <div className="bg-navy-50 border border-navy-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-navy-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-navy-700">Staff Login</p>
            <p className="text-xs text-navy-600 mt-1">
              Staff members can log in using their email and password at the main login page.
              They have access to view hospital and doctor information, and can manage patients.
            </p>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="search-input-wrapper flex-1">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search staff by name, email, or title..."
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
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Staff Table */}
      <div className="admin-data-table-wrapper">
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="admin-table-th">Staff Member</th>
                <th className="admin-table-th hidden md:table-cell">Title</th>
                <th className="admin-table-th hidden md:table-cell">Contact</th>
                <th className="admin-table-th hidden lg:table-cell">Doctors</th>
                <th className="admin-table-th">Status</th>
                <th className="admin-table-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedStaff.length > 0 ? (
                paginatedStaff.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="admin-table-td">
                      <div className="flex items-center gap-3">
                        <div className="avatar avatar-md bg-purple-500">
                          {s.displayName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{s.displayName}</p>
                          <p className="text-xs text-gray-500">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="admin-table-td hidden md:table-cell">
                      <span className="text-sm text-gray-700">{s.title || '—'}</span>
                    </td>
                    <td className="admin-table-td hidden md:table-cell">
                      <p className="text-sm text-gray-900">{s.email}</p>
                      <p className="text-xs text-gray-500">{s.phone || '-'}</p>
                    </td>
                    <td className="admin-table-td hidden lg:table-cell">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        !s.assignedDoctorIds || s.assignedDoctorIds.length === 0
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-purple-50 text-purple-700'
                      }`}>
                        {getDoctorAssignmentLabel(s)}
                      </span>
                    </td>
                    <td className="admin-table-td">
                      <span className={`status-pill ${s.status === 'ACTIVE' ? 'status-pill-active' : 'status-pill-inactive'}`}>
                        {s.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="admin-table-td">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEdit(s)}
                          className="quick-action-btn quick-action-btn-secondary"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setPasswordResetStaff(s);
                            setNewPassword('');
                            setShowPasswordModal(true);
                          }}
                          className="quick-action-btn quick-action-btn-secondary"
                        >
                          Reset Pwd
                        </button>
                        <button
                          onClick={() => handleToggleStatus(s)}
                          className={`quick-action-btn ${s.status === 'ACTIVE' ? 'quick-action-btn-warning' : 'quick-action-btn-primary'}`}
                        >
                          {s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => {
                            setDeletingStaff(s);
                            setShowDeleteModal(true);
                          }}
                          className="quick-action-btn quick-action-btn-danger"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="admin-table-td">
                    <div className="admin-empty-state py-12">
                      <div className="admin-empty-icon">
                        <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      </div>
                      <p className="admin-empty-title">No staff members found</p>
                      <p className="admin-empty-description">
                        {searchQuery || statusFilter !== 'all'
                          ? 'Try adjusting your search or filters'
                          : 'Add your first staff member to get started'}
                      </p>
                      {!searchQuery && statusFilter === 'all' && (
                        <div className="admin-empty-action">
                          <button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary">
                            Add First Staff Member
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredStaff.length)} of {filteredStaff.length} staff
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

      {/* Create/Edit Staff Modal */}
      {showModal && (
        <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="admin-modal max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h2 className="admin-modal-title">
                  {editingStaff ? 'Edit Staff' : 'Add Staff Member'}
                </h2>
                <p className="admin-modal-subtitle">
                  {editingStaff ? 'Update staff information' : 'Create a new staff account'}
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="admin-modal-close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="admin-modal-body space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="form-group">
                    <label className="form-label form-label-required">First Name</label>
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className="form-input"
                      placeholder="John"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label form-label-required">Last Name</label>
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className="form-input"
                      placeholder="Smith"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Title / Role</label>
                  <select
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="form-input"
                  >
                    <option value="">Select Title / Role</option>
                    {staffTitleOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {!editingStaff && (
                  <>
                    <div className="form-group">
                      <label className="form-label form-label-required">Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="form-input"
                        placeholder="staff@hospital.com"
                        required
                      />
                      <p className="form-hint">Staff will use this email to log in</p>
                    </div>

                    <div className="form-group">
                      <label className="form-label form-label-required">Password</label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="form-input"
                        placeholder="••••••••"
                        required
                        minLength={8}
                      />
                      <p className="form-hint">Minimum 8 characters</p>
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <PhoneInput
                    value={formData.phone}
                    onChange={(value) => setFormData({ ...formData, phone: value })}
                    placeholder="Phone number"
                  />
                </div>

                {/* Doctor Assignment */}
                <div className="form-group">
                  <label className="form-label">Assigned Doctors</label>
                  <div className="flex items-center gap-3 mb-2">
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="doctorAssign"
                        checked={assignAll}
                        onChange={() => { setAssignAll(true); setSelectedDoctorIds([]); }}
                        className="w-3.5 h-3.5 text-[var(--color-primary)]"
                      />
                      All Doctors
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="doctorAssign"
                        checked={!assignAll}
                        onChange={() => setAssignAll(false)}
                        className="w-3.5 h-3.5 text-[var(--color-primary)]"
                      />
                      Specific Doctors
                    </label>
                  </div>
                  {!assignAll && (
                    <div className="max-h-[140px] overflow-auto border border-gray-200 rounded-lg p-2 space-y-1">
                      {doctors.length > 0 ? doctors.map(d => (
                        <label key={d.userId} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                          <input
                            type="checkbox"
                            checked={selectedDoctorIds.includes(d.userId)}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedDoctorIds([...selectedDoctorIds, d.userId]);
                              } else {
                                setSelectedDoctorIds(selectedDoctorIds.filter(id => id !== d.userId));
                              }
                            }}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-[var(--color-primary)]"
                          />
                          Dr. {d.fullName || d.email.split('@')[0]}
                        </label>
                      )) : (
                        <p className="text-xs text-gray-400 py-2 text-center">No doctors in this hospital</p>
                      )}
                    </div>
                  )}
                  <p className="form-hint mt-1">
                    {assignAll
                      ? 'Staff will manage appointments for all doctors'
                      : `${selectedDoctorIds.length} doctor${selectedDoctorIds.length !== 1 ? 's' : ''} selected`}
                  </p>
                </div>
              </div>
              <div className="admin-modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !formData.displayName || (!editingStaff && (!formData.email || !formData.password))}
                  className="btn-primary"
                >
                  {saving ? 'Saving...' : editingStaff ? 'Update' : 'Create Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordModal && passwordResetStaff && (
        <div className="admin-modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="admin-modal max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h2 className="admin-modal-title">Reset Password</h2>
                <p className="admin-modal-subtitle">
                  Set a new password for {passwordResetStaff.displayName}
                </p>
              </div>
              <button onClick={() => setShowPasswordModal(false)} className="admin-modal-close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleResetPassword}>
              <div className="admin-modal-body space-y-4">
                <div className="form-group">
                  <label className="form-label form-label-required">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="form-input"
                    placeholder="••••••••"
                    required
                    minLength={8}
                  />
                  <p className="form-hint">Minimum 8 characters. Staff will use this to log in.</p>
                </div>
              </div>
              <div className="admin-modal-footer">
                <button type="button" onClick={() => setShowPasswordModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resettingPassword || newPassword.length < 8}
                  className="btn-primary"
                >
                  {resettingPassword ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deletingStaff && (
        <div className="admin-modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="admin-modal max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h2 className="admin-modal-title">Delete Staff Member</h2>
                <p className="admin-modal-subtitle">
                  Are you sure you want to delete {deletingStaff.displayName}?
                </p>
              </div>
              <button onClick={() => setShowDeleteModal(false)} className="admin-modal-close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="admin-modal-body">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-red-800">This action cannot be undone</p>
                    <p className="text-xs text-red-700 mt-1">
                      The staff member's account and access will be permanently removed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button type="button" onClick={() => setShowDeleteModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={handleDelete} disabled={saving} className="btn-danger">
                {saving ? 'Deleting...' : 'Delete Staff'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StaffPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <StaffPageContent />
    </Suspense>
  );
}
