'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../AuthProvider';
import { useImpersonation } from '../../lib/ImpersonationContext';

interface Hospital {
  id: string;
  name: string;
  city?: string;
  state?: string;
  country: string;
  region: string;
}

interface User {
  id: string;
  email: string;
  fullName?: string;
  role?: string;
  hospitalId?: string;
}

interface ViewAsUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ViewAsUserModal({ isOpen, onClose }: ViewAsUserModalProps) {
  const { session } = useAuth();
  const { startImpersonation } = useImpersonation();

  const [step, setStep] = useState<'hospital' | 'role' | 'user'>('hospital');
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected values
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

  // Fetch hospitals on open
  useEffect(() => {
    if (isOpen && session?.access_token) {
      fetchHospitals();
    }
  }, [isOpen, session?.access_token]);

  const fetchHospitals = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/admin/hospitals`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setHospitals(data);
      }
    } catch (error) {
      console.error('Failed to fetch hospitals:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = useCallback(async (hospitalId: string, role: string) => {
    setLoading(true);
    try {
      let url = `${API_BASE}/v1/admin/users?hospitalId=${hospitalId}`;
      if (role) {
        url += `&role=${role}`;
      }
      if (searchQuery) {
        url += `&search=${encodeURIComponent(searchQuery)}`;
      }

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, API_BASE, searchQuery]);

  // Fetch users when role is selected
  useEffect(() => {
    if (selectedHospital && selectedRole) {
      fetchUsers(selectedHospital.id, selectedRole);
    }
  }, [selectedHospital, selectedRole, fetchUsers]);

  const handleHospitalSelect = (hospital: Hospital) => {
    setSelectedHospital(hospital);
    setStep('role');
  };

  const handleRoleSelect = (role: string) => {
    setSelectedRole(role);
    setStep('user');
  };

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
  };

  const handleStartViewing = () => {
    if (selectedUser && selectedHospital) {
      // Set the hospital ID in localStorage before impersonating
      localStorage.setItem('clinqflow_hospital_id', selectedHospital.id);

      startImpersonation({
        id: selectedUser.id,
        email: selectedUser.email,
        fullName: selectedUser.fullName,
        role: selectedUser.role,
        hospitalId: selectedHospital.id,
        hospitalName: selectedHospital.name,
      });
    }
  };

  const handleBack = () => {
    if (step === 'user') {
      setStep('role');
      setSelectedRole(null);
      setSelectedUser(null);
    } else if (step === 'role') {
      setStep('hospital');
      setSelectedHospital(null);
    }
  };

  const handleClose = () => {
    setStep('hospital');
    setSelectedHospital(null);
    setSelectedRole(null);
    setSelectedUser(null);
    setSearchQuery('');
    onClose();
  };

  if (!isOpen) return null;

  const roles = [
    { value: 'HOSPITAL_MANAGER', label: 'Hospital Manager', description: 'Full hospital management access' },
    { value: 'DOCTOR', label: 'Doctor', description: 'Doctor view with patient access' },
  ];

  return (
    <div className="admin-modal-overlay" onClick={handleClose}>
      <div className="admin-modal max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="flex items-center gap-3">
            {step !== 'hospital' && (
              <button
                onClick={handleBack}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <h2 className="admin-modal-title">View as User</h2>
              <p className="admin-modal-subtitle">
                {step === 'hospital' && 'Select a hospital'}
                {step === 'role' && `${selectedHospital?.name} - Select a role`}
                {step === 'user' && `${selectedHospital?.name} - ${selectedRole} - Select a user`}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="admin-modal-close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="admin-modal-body max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Step 1: Select Hospital */}
              {step === 'hospital' && (
                <div className="space-y-2">
                  {hospitals.map((hospital) => (
                    <button
                      key={hospital.id}
                      onClick={() => handleHospitalSelect(hospital)}
                      className="w-full p-4 text-left border border-gray-200 rounded-lg hover:border-[var(--color-primary)] hover:bg-blue-50 transition-colors"
                    >
                      <div className="font-medium text-gray-900">{hospital.name}</div>
                      <div className="text-sm text-gray-500">
                        {hospital.city}, {hospital.state} · {hospital.region}
                      </div>
                    </button>
                  ))}
                  {hospitals.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No hospitals found
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Select Role */}
              {step === 'role' && (
                <div className="space-y-2">
                  {roles.map((role) => (
                    <button
                      key={role.value}
                      onClick={() => handleRoleSelect(role.value)}
                      className="w-full p-4 text-left border border-gray-200 rounded-lg hover:border-[var(--color-primary)] hover:bg-blue-50 transition-colors"
                    >
                      <div className="font-medium text-gray-900">{role.label}</div>
                      <div className="text-sm text-gray-500">{role.description}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 3: Select User */}
              {step === 'user' && (
                <div className="space-y-4">
                  {/* Search */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search by name or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="form-input pl-10"
                    />
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>

                  {/* User List */}
                  <div className="space-y-2">
                    {users.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => handleUserSelect(user)}
                        className={`w-full p-4 text-left border rounded-lg transition-colors ${
                          selectedUser?.id === user.id
                            ? 'border-[var(--color-primary)] bg-blue-50'
                            : 'border-gray-200 hover:border-[var(--color-primary)] hover:bg-blue-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                            <span className="text-gray-600 font-medium">
                              {user.fullName?.charAt(0) || user.email.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              {user.fullName || 'No name'}
                            </div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                          </div>
                          {selectedUser?.id === user.id && (
                            <svg
                              className="w-5 h-5 text-[var(--color-primary)] ml-auto"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </button>
                    ))}
                    {users.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        No users found with role {selectedRole} in this hospital
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {step === 'user' && selectedUser && (
          <div className="admin-modal-footer">
            <button onClick={handleClose} className="btn-secondary">
              Cancel
            </button>
            <button onClick={handleStartViewing} className="btn-primary">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              View as {selectedUser.fullName || selectedUser.email}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
