'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';

interface SubscriptionItem {
  id: string;
  productCode: string;
  productName: string;
  doctorLimit: number;
  pricePerDoctor: number;
  currency: string;
  discountAmount: number;
  monthlyTotal: number;
}

interface Subscription {
  id: string;
  hospitalId: string;
  hospitalName: string;
  status: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
  billingCycleStart: string;
  billingCycleEnd: string;
  trialEndsAt: string | null;
  items: SubscriptionItem[];
  totalMonthly: number;
}

interface LicenseStats {
  hospitalId: string;
  hospitalName: string;
  byProduct: {
    productCode: string;
    productName: string;
    totalLicenses: number;
    usedLicenses: number;
    availableLicenses: number;
  }[];
}

interface License {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorEmail: string;
  productCode: string;
  productName: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  assignedAt: string;
  assignedByName: string;
}

interface Doctor {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
}

export default function HospitalBillingPage() {
  const router = useRouter();
  const { user, profile, currentHospital, loading: authLoading, legalStatus } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [licenseStats, setLicenseStats] = useState<LicenseStats | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const [assignForm, setAssignForm] = useState({
    doctorId: '',
    productCode: 'APPOINTMENTS',
  });

  useEffect(() => {
    console.log('[Billing] useEffect - authLoading:', authLoading, 'user:', !!user, 'currentHospital:', currentHospital?.id, 'role:', currentHospital?.role, 'isSuperAdmin:', profile?.isSuperAdmin);
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (!authLoading && currentHospital && currentHospital.role !== 'HOSPITAL_MANAGER' && !profile?.isSuperAdmin) {
      console.log('[Billing] Redirecting to dashboard - not a manager');
      router.push('/dashboard');
      return;
    }
    if (!authLoading && user && currentHospital) {
      console.log('[Billing] Calling fetchData');
      fetchData();
    } else {
      console.log('[Billing] Not fetching data - conditions not met');
    }
  }, [user, profile, currentHospital, authLoading, router]);

  async function fetchData() {
    console.log('[Billing] Fetching data for hospital:', currentHospital?.id, currentHospital?.name);
    try {
      const [subRes, statsRes, licensesRes, membersRes] = await Promise.all([
        apiFetch('/v1/products/subscription'),
        apiFetch('/v1/products/subscription/license-stats'),
        apiFetch('/v1/products/licenses'),
        apiFetch('/v1/hospitals/members'),
      ]);

      console.log('[Billing] Subscription response status:', subRes.status, subRes.ok);
      if (subRes.ok) {
        const subData = await subRes.json();
        console.log('[Billing] Subscription data:', subData);
        setSubscription(subData);
      } else {
        const errorText = await subRes.text();
        console.error('[Billing] Subscription error:', errorText);
      }
      if (statsRes.ok) {
        setLicenseStats(await statsRes.json());
      }
      if (licensesRes.ok) {
        setLicenses(await licensesRes.json());
      }
      if (membersRes.ok) {
        const members = await membersRes.json();
        console.log('[Billing] Members response:', members);
        const filteredDoctors = members.filter((m: Doctor) => m.role === 'DOCTOR' && m.status === 'ACTIVE');
        console.log('[Billing] Filtered doctors:', filteredDoctors);
        setDoctors(filteredDoctors);
      } else {
        console.error('[Billing] Members API error:', membersRes.status, await membersRes.text());
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignLicense(e: React.FormEvent) {
    e.preventDefault();
    setAssigning(true);
    try {
      const res = await apiFetch('/v1/products/licenses/assign', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: assignForm.doctorId,
          productCode: assignForm.productCode,
        }),
      });

      if (res.ok) {
        setShowAssignModal(false);
        setAssignForm({ doctorId: '', productCode: 'APPOINTMENTS' });
        fetchData();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to assign license');
      }
    } catch (error) {
      console.error('Failed to assign license:', error);
    } finally {
      setAssigning(false);
    }
  }

  async function handleRevokeLicense(licenseId: string) {
    if (!confirm('Are you sure you want to revoke this license?')) return;

    try {
      const res = await apiFetch(`/v1/products/licenses/${licenseId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Failed to revoke license:', error);
    }
  }

  function formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-700';
      case 'TRIAL':
        return 'bg-navy-100 text-navy-700';
      case 'PAST_DUE':
        return 'bg-yellow-100 text-yellow-700';
      case 'REVOKED':
      case 'EXPIRED':
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-500';
      default:
        return 'bg-gray-100 text-gray-500';
    }
  }

  // Get doctors without licenses for the selected product
  const availableDoctors = doctors.filter(
    (d) => !licenses.some(
      (l) => l.doctorId === d.userId && l.productCode === assignForm.productCode && l.status === 'ACTIVE'
    )
  );

  if (authLoading || loading || legalStatus === 'checking' || legalStatus === 'unknown') {
    return null;
  }

  // Don't render if redirecting to legal page
  if (legalStatus === 'pending') {
    return <div className="p-4 text-gray-500">Redirecting...</div>;
  }

  if (!currentHospital || (currentHospital.role !== 'HOSPITAL_MANAGER' && !profile?.isSuperAdmin)) {
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="page-title text-xl sm:text-2xl mb-6">Billing & Licenses</h1>

      {/* Subscription Card */}
      <div className="card p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Subscription</h2>
            <p className="text-sm text-gray-500">{currentHospital.name}</p>
          </div>
          {subscription && (
            <span className={`text-xs px-2 py-1 rounded ${getStatusColor(subscription.status)}`}>
              {subscription.status}
            </span>
          )}
        </div>

        {subscription ? (
          <>
            {subscription.status === 'TRIAL' && subscription.trialEndsAt && (
              <div className="bg-navy-50 border border-navy-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-navy-700">
                  Your trial ends on {new Date(subscription.trialEndsAt).toLocaleDateString()}.
                  Contact support to activate your subscription.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {subscription.items.map((item) => (
                <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                    <div className="font-medium text-gray-900">{item.productName}</div>
                    <div className="text-xs text-gray-500">
                      {item.doctorLimit} doctor licenses @ {formatCurrency(item.pricePerDoctor, item.currency)}/doctor/month
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">
                      {formatCurrency(item.monthlyTotal, item.currency)}
                    </div>
                    {item.discountAmount > 0 && (
                      <div className="text-xs text-green-600">
                        -{formatCurrency(item.discountAmount, item.currency)} discount
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
              <span className="font-medium text-gray-900">Total Monthly</span>
              <span className="text-xl font-semibold text-gray-900">
                {formatCurrency(subscription.totalMonthly, subscription.items[0]?.currency || 'USD')}
              </span>
            </div>

            <div className="mt-4 text-xs text-gray-500">
              Billing cycle: {new Date(subscription.billingCycleStart).toLocaleDateString()} - {new Date(subscription.billingCycleEnd).toLocaleDateString()}
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No active subscription.</p>
            <p className="text-sm mt-2">Contact your ClinQflow administrator to set up a subscription.</p>
          </div>
        )}
      </div>

      {/* License Stats */}
      {licenseStats && licenseStats.byProduct.length > 0 && (
        <div className="card p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">License Usage</h2>
            <button
              onClick={() => setShowAssignModal(true)}
              className="btn-primary text-sm"
              disabled={!subscription || !availableDoctors.length}
            >
              Assign License
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {licenseStats.byProduct.map((product) => (
              <div key={product.productCode} className="p-4 bg-gray-50 rounded">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-gray-900">{product.productName}</span>
                  <span className="text-sm text-gray-500">
                    {product.usedLicenses} / {product.totalLicenses}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-navy-600 h-2 rounded-full"
                    style={{
                      width: `${product.totalLicenses > 0 ? (product.usedLicenses / product.totalLicenses) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {product.availableLicenses} available
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Licenses */}
      {licenses.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Active Licenses</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Doctor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {licenses.filter((l) => l.status === 'ACTIVE').map((license) => (
                  <tr key={license.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">Dr. {license.doctorName}</div>
                      <div className="text-xs text-gray-500">{license.doctorEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-900">{license.productName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-500">
                        {new Date(license.assignedAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-400">by {license.assignedByName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded ${getStatusColor(license.status)}`}>
                        {license.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRevokeLicense(license.id)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assign License Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-lg font-semibold mb-4">Assign License</h2>
            <form onSubmit={handleAssignLicense} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product *
                </label>
                <select
                  value={assignForm.productCode}
                  onChange={(e) => setAssignForm({ ...assignForm, productCode: e.target.value })}
                  className="input-field"
                >
                  {subscription?.items.map((item) => (
                    <option key={item.productCode} value={item.productCode}>
                      {item.productName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Doctor *
                </label>
                <select
                  value={assignForm.doctorId}
                  onChange={(e) => setAssignForm({ ...assignForm, doctorId: e.target.value })}
                  className="input-field"
                  required
                >
                  <option value="">Select a doctor</option>
                  {availableDoctors.map((doctor) => (
                    <option key={doctor.userId} value={doctor.userId}>
                      Dr. {doctor.fullName} ({doctor.email})
                    </option>
                  ))}
                </select>
                {availableDoctors.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    All doctors already have licenses for this product.
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={assigning || !assignForm.doctorId}
                >
                  {assigning ? 'Assigning...' : 'Assign License'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
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
