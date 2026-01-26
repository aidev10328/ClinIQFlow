'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';

interface License {
  id: string;
  productCode: string;
  productName: string;
  assignedToUserId?: string;
  assignedToEmail?: string;
  assignedToName?: string;
  status: 'active' | 'unassigned' | 'expired';
  expiresAt?: string;
}

interface Doctor {
  id: string;
  userId: string;
  email: string;
  displayName?: string;
  complianceStatus: string;
}

function LicensesPageContent() {
  const searchParams = useSearchParams();
  const { currentHospital, entitlements } = useAuth();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  // Assign modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      // Fetch active doctors
      const membersRes = await apiFetch('/v1/hospitals/members/compliance');
      if (membersRes.ok) {
        const members = await membersRes.json();
        const activeDoctors = members.filter(
          (m: any) => m.role === 'DOCTOR' && m.complianceStatus === 'compliant'
        );
        setDoctors(activeDoctors.map((d: any) => ({
          id: d.id,
          userId: d.userId,
          email: d.user?.email || '',
          displayName: d.user?.displayName,
          complianceStatus: d.complianceStatus,
        })));
      }

      // Mock licenses data - in production, this would come from /v1/licenses
      // This simulates the subscription items as licenses
      const mockLicenses: License[] = [];
      if (entitlements?.products) {
        entitlements.products.forEach((product, idx) => {
          // Create some mock licenses for each product
          for (let i = 0; i < 3; i++) {
            mockLicenses.push({
              id: `${product.code}-${i}`,
              productCode: product.code,
              productName: product.name,
              status: i === 0 ? 'active' : 'unassigned',
              assignedToUserId: i === 0 ? 'user-1' : undefined,
              assignedToEmail: i === 0 ? 'doctor@example.com' : undefined,
              assignedToName: i === 0 ? 'Dr. Example' : undefined,
            });
          }
        });
      }
      setLicenses(mockLicenses);

      // Check if doctor param in URL
      const doctorParam = searchParams.get('doctor');
      if (doctorParam) {
        // Auto-open assign modal for this doctor
        const unassignedLicense = mockLicenses.find(l => l.status === 'unassigned');
        if (unassignedLicense) {
          setSelectedLicense(unassignedLicense);
          setSelectedDoctorId(doctorParam);
          setShowAssignModal(true);
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignLicense(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLicense || !selectedDoctorId) return;

    setAssigning(true);
    try {
      // In production, this would call /v1/licenses/:id/assign
      const doctor = doctors.find(d => d.userId === selectedDoctorId);
      setLicenses(prev => prev.map(l =>
        l.id === selectedLicense.id
          ? {
              ...l,
              status: 'active' as const,
              assignedToUserId: selectedDoctorId,
              assignedToEmail: doctor?.email,
              assignedToName: doctor?.displayName,
            }
          : l
      ));
      setShowAssignModal(false);
      setSelectedLicense(null);
      setSelectedDoctorId('');
      alert('License assigned successfully!');
    } catch (error) {
      console.error('Failed to assign license:', error);
      alert('Failed to assign license');
    } finally {
      setAssigning(false);
    }
  }

  async function handleRevokeLicense(license: License) {
    if (!confirm('Are you sure you want to revoke this license assignment?')) return;

    try {
      setLicenses(prev => prev.map(l =>
        l.id === license.id
          ? {
              ...l,
              status: 'unassigned' as const,
              assignedToUserId: undefined,
              assignedToEmail: undefined,
              assignedToName: undefined,
            }
          : l
      ));
    } catch (error) {
      console.error('Failed to revoke license:', error);
    }
  }

  // Group licenses by product
  const licensesByProduct = licenses.reduce((acc, license) => {
    if (!acc[license.productCode]) {
      acc[license.productCode] = {
        productName: license.productName,
        productCode: license.productCode,
        licenses: [],
      };
    }
    acc[license.productCode].licenses.push(license);
    return acc;
  }, {} as Record<string, { productName: string; productCode: string; licenses: License[] }>);

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
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Product Licenses</h1>
          <p className="admin-page-subtitle">
            Manage product license assignments for doctors
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="admin-stat-card">
          <p className="admin-stat-label">Total Licenses</p>
          <p className="admin-stat-value">{licenses.length}</p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">Assigned</p>
          <p className="admin-stat-value text-green-600">
            {licenses.filter(l => l.status === 'active').length}
          </p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">Unassigned</p>
          <p className="admin-stat-value text-yellow-600">
            {licenses.filter(l => l.status === 'unassigned').length}
          </p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">Active Doctors</p>
          <p className="admin-stat-value">{doctors.length}</p>
        </div>
      </div>

      {/* Licenses by Product */}
      {Object.values(licensesByProduct).length > 0 ? (
        Object.values(licensesByProduct).map((group) => (
          <div key={group.productCode} className="pro-card">
            <div className="pro-card-header flex items-center justify-between">
              <div>
                <h3 className="pro-card-title">{group.productName}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {group.licenses.filter(l => l.status === 'active').length} of {group.licenses.length} assigned
                </p>
              </div>
              <span className="text-xs font-mono text-gray-400">{group.productCode}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {group.licenses.map((license) => (
                <div key={license.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      license.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                      </svg>
                    </div>
                    <div>
                      {license.status === 'active' && license.assignedToName ? (
                        <>
                          <p className="text-sm font-medium text-gray-900">{license.assignedToName}</p>
                          <p className="text-xs text-gray-500">{license.assignedToEmail}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-gray-500">Unassigned</p>
                          <p className="text-xs text-gray-400">Available for assignment</p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`status-pill ${license.status === 'active' ? 'status-pill-active' : 'status-pill-pending'}`}>
                      {license.status === 'active' ? 'Assigned' : 'Unassigned'}
                    </span>
                    {license.status === 'active' ? (
                      <button
                        onClick={() => handleRevokeLicense(license)}
                        className="quick-action-btn quick-action-btn-danger"
                      >
                        Revoke
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedLicense(license);
                          setShowAssignModal(true);
                        }}
                        className="quick-action-btn quick-action-btn-primary"
                      >
                        Assign
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="pro-card">
          <div className="admin-empty-state py-12">
            <div className="admin-empty-icon">
              <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
            </div>
            <p className="admin-empty-title">No licenses available</p>
            <p className="admin-empty-description">
              Contact your administrator to add product subscriptions
            </p>
          </div>
        </div>
      )}

      {/* Assign License Modal */}
      {showAssignModal && selectedLicense && (
        <div className="admin-modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="admin-modal max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h2 className="admin-modal-title">Assign License</h2>
                <p className="admin-modal-subtitle">
                  Assign {selectedLicense.productName} license to a doctor
                </p>
              </div>
              <button
                onClick={() => setShowAssignModal(false)}
                className="admin-modal-close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAssignLicense}>
              <div className="admin-modal-body">
                {doctors.length > 0 ? (
                  <div className="form-group">
                    <label className="form-label form-label-required">Select Doctor</label>
                    <select
                      value={selectedDoctorId}
                      onChange={(e) => setSelectedDoctorId(e.target.value)}
                      className="form-input"
                      required
                    >
                      <option value="">Choose a doctor...</option>
                      {doctors.map((doctor) => (
                        <option key={doctor.userId} value={doctor.userId}>
                          {doctor.displayName || doctor.email}
                        </option>
                      ))}
                    </select>
                    <p className="form-hint">Only active doctors are shown</p>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                      No active doctors available. Doctors must complete their setup before licenses can be assigned.
                    </p>
                    <Link href="/hospital/doctors" className="text-sm text-[var(--color-primary)] hover:underline mt-2 inline-block">
                      View Doctors
                    </Link>
                  </div>
                )}
              </div>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning || !selectedDoctorId}
                  className="btn-primary"
                >
                  {assigning ? 'Assigning...' : 'Assign License'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LicensesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LicensesPageContent />
    </Suspense>
  );
}
