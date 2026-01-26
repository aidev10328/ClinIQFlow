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
  phone?: string | null;
  status: string;
  hospitalId: string;
  hospitalName?: string;
  assignedDoctorIds?: string[] | null;
  createdAt: string;
}

function StaffPageContent() {
  const searchParams = useSearchParams();
  const { currentHospital } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    displayName: '',
    phone: '',
  });

  // Delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingStaff, setDeletingStaff] = useState<StaffMember | null>(null);

  useEffect(() => {
    fetchStaff();
    if (searchParams.get('action') === 'add') {
      setShowModal(true);
    }
  }, [searchParams]);

  async function fetchStaff() {
    try {
      const res = await apiFetch('/v1/staff');
      if (res.ok) {
        const data = await res.json();
        setStaff(data);
      }
    } catch (error) {
      console.error('Failed to fetch staff:', error);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormData({
      email: '',
      password: '',
      displayName: '',
      phone: '',
    });
    setEditingStaff(null);
  }

  function handleEdit(staffMember: StaffMember) {
    setEditingStaff(staffMember);
    setFormData({
      email: staffMember.email,
      password: '',
      displayName: staffMember.displayName,
      phone: staffMember.phone || '',
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingStaff) {
        // Update existing staff
        const res = await apiFetch(`/v1/staff/${editingStaff.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            displayName: formData.displayName,
            phone: formData.phone || undefined,
          }),
        });

        if (res.ok) {
          setShowModal(false);
          resetForm();
          fetchStaff();
        } else {
          const error = await res.json();
          alert(error.message || 'Failed to update staff');
        }
      } else {
        // Create new staff
        const res = await apiFetch('/v1/staff', {
          method: 'POST',
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            displayName: formData.displayName,
            phone: formData.phone || undefined,
          }),
        });

        if (res.ok) {
          setShowModal(false);
          resetForm();
          fetchStaff();
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

      if (res.ok) {
        fetchStaff();
      }
    } catch (error) {
      console.error('Failed to update staff:', error);
    }
  }

  async function handleDelete() {
    if (!deletingStaff) return;

    setSaving(true);
    try {
      const res = await apiFetch(`/v1/staff/${deletingStaff.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setShowDeleteModal(false);
        setDeletingStaff(null);
        fetchStaff();
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

  // Filter staff
  const filteredStaff = staff.filter(s => {
    const matchesSearch =
      s.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && s.status === 'ACTIVE') ||
      (statusFilter === 'inactive' && s.status === 'INACTIVE');

    return matchesSearch && matchesStatus;
  });

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredStaff.length / ITEMS_PER_PAGE);
  const paginatedStaff = filteredStaff.slice(
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
          <h1 className="admin-page-title">Staff</h1>
          <p className="admin-page-subtitle">
            Manage staff members at {currentHospital?.name}
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="btn-primary"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Staff
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-800">Staff Login</p>
            <p className="text-xs text-blue-700 mt-1">
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
            placeholder="Search staff by name or email..."
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
                <th className="admin-table-th hidden md:table-cell">Contact</th>
                <th className="admin-table-th hidden lg:table-cell">Created</th>
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
                      <p className="text-sm text-gray-900">{s.email}</p>
                      <p className="text-xs text-gray-500">{s.phone || '-'}</p>
                    </td>
                    <td className="admin-table-td hidden lg:table-cell">
                      <span className="text-sm text-gray-500">
                        {new Date(s.createdAt).toLocaleDateString()}
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
                  <td colSpan={5} className="admin-table-td">
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
                          <button
                            onClick={() => {
                              resetForm();
                              setShowModal(true);
                            }}
                            className="btn-primary"
                          >
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
              <button
                onClick={() => setShowModal(false)}
                className="admin-modal-close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="admin-modal-body space-y-4">
                <div className="form-group">
                  <label className="form-label form-label-required">Display Name</label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="form-input"
                    placeholder="John Smith"
                    required
                  />
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
              </div>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                >
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
              <button
                onClick={() => setShowDeleteModal(false)}
                className="admin-modal-close"
              >
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
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="btn-danger"
              >
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
