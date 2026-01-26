'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import { PageHeader, StatusBadge, LoadingState, Modal } from '../../../components/admin/ui';

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
  cancelledAt: string | null;
  createdAt: string;
  items: SubscriptionItem[];
  totalMonthly: number;
}

interface SubscriptionStats {
  totalSubscriptions: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  totalMRR: number;
  currency: string;
  byProduct: {
    productCode: string;
    productName: string;
    activeSubscriptions: number;
    totalDoctors: number;
    mrr: number;
  }[];
}

interface Hospital {
  id: string;
  name: string;
  region: string;
  currency: string;
}

export default function AdminSubscriptionsPage() {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newSubscription, setNewSubscription] = useState({
    hospitalId: '',
    startTrial: true,
    trialDays: 14,
    items: [
      { productCode: 'APPOINTMENTS', doctorLimit: 5, discountCode: '' },
    ],
  });

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  async function fetchData() {
    try {
      const [subsRes, statsRes, hospitalsRes] = await Promise.all([
        apiFetch('/v1/products/admin/subscriptions'),
        apiFetch('/v1/products/admin/subscriptions/stats'),
        apiFetch('/v1/hospitals'),
      ]);

      if (subsRes.ok) {
        setSubscriptions(await subsRes.json());
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      if (hospitalsRes.ok) {
        setHospitals(await hospitalsRes.json());
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSubscription(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await apiFetch('/v1/products/admin/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          hospitalId: newSubscription.hospitalId,
          startTrial: newSubscription.startTrial,
          trialDays: newSubscription.trialDays,
          items: newSubscription.items
            .filter((item) => item.doctorLimit > 0)
            .map((item) => ({
              productCode: item.productCode,
              doctorLimit: item.doctorLimit,
              discountCode: item.discountCode || undefined,
            })),
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setNewSubscription({
          hospitalId: '',
          startTrial: true,
          trialDays: 14,
          items: [{ productCode: 'APPOINTMENTS', doctorLimit: 5, discountCode: '' }],
        });
        fetchData();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to create subscription');
      }
    } catch (error) {
      console.error('Failed to create subscription:', error);
    } finally {
      setCreating(false);
    }
  }

  async function updateSubscriptionStatus(hospitalId: string, status: string) {
    try {
      const res = await apiFetch(`/v1/products/admin/subscriptions/${hospitalId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Failed to update subscription:', error);
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
        return 'bg-blue-100 text-blue-700';
      case 'PAST_DUE':
        return 'bg-yellow-100 text-yellow-700';
      case 'CANCELLED':
      case 'EXPIRED':
        return 'bg-gray-100 text-gray-500';
      default:
        return 'bg-gray-100 text-gray-500';
    }
  }

  // Get hospitals without active subscriptions
  const availableHospitals = hospitals.filter(
    (h) => !subscriptions.some((s) => s.hospitalId === h.id && ['ACTIVE', 'TRIAL', 'PAST_DUE'].includes(s.status))
  );

  if (loading) {
    return (
      <div>
        <PageHeader title="Subscriptions" subtitle="Manage hospital subscriptions" />
        <LoadingState type="cards" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        subtitle="Manage hospital subscriptions and billing"
        actions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
            disabled={availableHospitals.length === 0}
          >
            Create Subscription
          </button>
        }
      />

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="card p-4">
            <div className="text-sm text-gray-500">Total Subscriptions</div>
            <div className="text-2xl font-semibold text-gray-900">{stats.totalSubscriptions}</div>
          </div>
          <div className="card p-4">
            <div className="text-sm text-gray-500">Active</div>
            <div className="text-2xl font-semibold text-green-600">{stats.activeSubscriptions}</div>
          </div>
          <div className="card p-4">
            <div className="text-sm text-gray-500">Trial</div>
            <div className="text-2xl font-semibold text-blue-600">{stats.trialSubscriptions}</div>
          </div>
          <div className="card p-4">
            <div className="text-sm text-gray-500">Monthly Revenue</div>
            <div className="text-2xl font-semibold text-gray-900">
              {formatCurrency(stats.totalMRR, stats.currency)}
            </div>
          </div>
        </div>
      )}

      {/* Product Breakdown */}
      {stats && stats.byProduct.length > 0 && (
        <div className="card p-4 mb-6">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Revenue by Product</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {stats.byProduct.map((product) => (
              <div key={product.productCode} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <div>
                  <div className="font-medium text-gray-900">{product.productName}</div>
                  <div className="text-xs text-gray-500">
                    {product.activeSubscriptions} subscriptions, {product.totalDoctors} doctors
                  </div>
                </div>
                <div className="font-semibold text-gray-900">
                  {formatCurrency(product.mrr)}/mo
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subscriptions Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hospital</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Products</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monthly</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {subscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{sub.hospitalName}</div>
                    <div className="text-xs text-gray-500">
                      Since {new Date(sub.createdAt).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {sub.items.map((item) => (
                      <div key={item.id} className="text-sm">
                        <span className="font-medium">{item.productName}</span>
                        <span className="text-gray-500 ml-1">
                          ({item.doctorLimit} doctors)
                        </span>
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">
                      {formatCurrency(sub.totalMonthly, sub.items[0]?.currency || 'USD')}
                    </div>
                    {sub.items.some((i) => i.discountAmount > 0) && (
                      <div className="text-xs text-green-600">Discount applied</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${getStatusColor(sub.status)}`}>
                      {sub.status}
                    </span>
                    {sub.trialEndsAt && sub.status === 'TRIAL' && (
                      <div className="text-xs text-gray-500 mt-1">
                        Ends {new Date(sub.trialEndsAt).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {sub.status === 'TRIAL' && (
                      <button
                        onClick={() => updateSubscriptionStatus(sub.hospitalId, 'ACTIVE')}
                        className="text-sm text-green-600 hover:text-green-800"
                      >
                        Activate
                      </button>
                    )}
                    {(sub.status === 'ACTIVE' || sub.status === 'TRIAL') && (
                      <button
                        onClick={() => updateSubscriptionStatus(sub.hospitalId, 'CANCELLED')}
                        className="text-sm text-red-600 hover:text-red-800 ml-3"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {subscriptions.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No subscriptions yet. Create a subscription for a hospital.
          </div>
        )}
      </div>

      {/* Create Subscription Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Create Subscription</h2>
            <form onSubmit={handleCreateSubscription} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hospital *
                </label>
                <select
                  value={newSubscription.hospitalId}
                  onChange={(e) => setNewSubscription({ ...newSubscription, hospitalId: e.target.value })}
                  className="input-field"
                  required
                >
                  <option value="">Select a hospital</option>
                  {availableHospitals.map((hospital) => (
                    <option key={hospital.id} value={hospital.id}>
                      {hospital.name} ({hospital.region})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newSubscription.startTrial}
                    onChange={(e) => setNewSubscription({
                      ...newSubscription,
                      startTrial: e.target.checked,
                    })}
                  />
                  Start with trial period
                </label>
                {newSubscription.startTrial && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={newSubscription.trialDays}
                      onChange={(e) => setNewSubscription({
                        ...newSubscription,
                        trialDays: parseInt(e.target.value),
                      })}
                      className="input-field w-20"
                      min="1"
                      max="90"
                    />
                    <span className="text-sm text-gray-500">days</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Products
                </label>
                {newSubscription.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <select
                      value={item.productCode}
                      onChange={(e) => {
                        const items = [...newSubscription.items];
                        items[idx].productCode = e.target.value;
                        setNewSubscription({ ...newSubscription, items });
                      }}
                      className="input-field flex-1"
                    >
                      <option value="APPOINTMENTS">Appointments</option>
                      <option value="CLINIQ_BRIEF">CliniqBrief</option>
                    </select>
                    <input
                      type="number"
                      value={item.doctorLimit}
                      onChange={(e) => {
                        const items = [...newSubscription.items];
                        items[idx].doctorLimit = parseInt(e.target.value);
                        setNewSubscription({ ...newSubscription, items });
                      }}
                      className="input-field w-24"
                      placeholder="Doctors"
                      min="1"
                    />
                    <input
                      type="text"
                      value={item.discountCode}
                      onChange={(e) => {
                        const items = [...newSubscription.items];
                        items[idx].discountCode = e.target.value.toUpperCase();
                        setNewSubscription({ ...newSubscription, items });
                      }}
                      className="input-field w-32"
                      placeholder="Discount"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setNewSubscription({
                    ...newSubscription,
                    items: [...newSubscription.items, { productCode: 'CLINIQ_BRIEF', doctorLimit: 5, discountCode: '' }],
                  })}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  + Add Product
                </button>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" className="btn-primary flex-1" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Subscription'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
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
