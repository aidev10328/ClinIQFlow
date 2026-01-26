'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import { PageHeader, LoadingState } from '../../../components/admin/ui';

interface DiscountCode {
  id: string;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  description: string;
  isActive: boolean;
  maxRedemptions: number | null;
  currentRedemptions: number;
  validFrom: string;
  validUntil: string | null;
  minDoctors: number | null;
  maxDoctors: number | null;
  applicableProducts: string[];
  applicableRegions: string[];
  createdAt: string;
}

interface DiscountFormData {
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  description: string;
  maxRedemptions: string;
  validUntil: string;
  minDoctors: string;
  maxDoctors: string;
  applicableProducts: string[];
  applicableRegions: string[];
  isActive: boolean;
}

const emptyFormData: DiscountFormData = {
  code: '',
  discountType: 'PERCENTAGE',
  discountValue: 10,
  description: '',
  maxRedemptions: '',
  validUntil: '',
  minDoctors: '',
  maxDoctors: '',
  applicableProducts: [],
  applicableRegions: [],
  isActive: true,
};

export default function AdminDiscountsPage() {
  const { user } = useAuth();
  const [discounts, setDiscounts] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingDiscount, setEditingDiscount] = useState<DiscountCode | null>(null);
  const [formData, setFormData] = useState<DiscountFormData>(emptyFormData);

  useEffect(() => {
    if (user) {
      fetchDiscounts();
    }
  }, [user]);

  async function fetchDiscounts() {
    try {
      const res = await apiFetch('/v1/products/admin/discounts');
      if (res.ok) {
        const data = await res.json();
        setDiscounts(data);
      }
    } catch (error) {
      console.error('Failed to fetch discounts:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleCreate() {
    setEditingDiscount(null);
    setFormData(emptyFormData);
    setError(null);
    setShowModal(true);
  }

  function handleEdit(discount: DiscountCode) {
    setEditingDiscount(discount);
    setFormData({
      code: discount.code,
      discountType: discount.discountType,
      discountValue: discount.discountValue,
      description: discount.description || '',
      maxRedemptions: discount.maxRedemptions?.toString() || '',
      validUntil: discount.validUntil ? discount.validUntil.split('T')[0] : '',
      minDoctors: discount.minDoctors?.toString() || '',
      maxDoctors: discount.maxDoctors?.toString() || '',
      applicableProducts: discount.applicableProducts || [],
      applicableRegions: discount.applicableRegions || [],
      isActive: discount.isActive,
    });
    setError(null);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      if (editingDiscount) {
        // Update existing discount
        const res = await apiFetch(`/v1/products/admin/discounts/${editingDiscount.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            description: formData.description || undefined,
            discountValue: formData.discountValue,
            isActive: formData.isActive,
            maxRedemptions: formData.maxRedemptions ? parseInt(formData.maxRedemptions) : null,
            validUntil: formData.validUntil || null,
            minDoctors: formData.minDoctors ? parseInt(formData.minDoctors) : null,
            maxDoctors: formData.maxDoctors ? parseInt(formData.maxDoctors) : null,
            applicableProducts: formData.applicableProducts.length > 0 ? formData.applicableProducts : [],
            applicableRegions: formData.applicableRegions.length > 0 ? formData.applicableRegions : [],
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || 'Failed to update discount');
        }
      } else {
        // Create new discount
        if (!formData.code.trim()) {
          throw new Error('Discount code is required');
        }

        const res = await apiFetch('/v1/products/admin/discounts', {
          method: 'POST',
          body: JSON.stringify({
            code: formData.code.toUpperCase(),
            discountType: formData.discountType,
            discountValue: formData.discountValue,
            description: formData.description || undefined,
            maxRedemptions: formData.maxRedemptions ? parseInt(formData.maxRedemptions) : undefined,
            validUntil: formData.validUntil || undefined,
            minDoctors: formData.minDoctors ? parseInt(formData.minDoctors) : undefined,
            maxDoctors: formData.maxDoctors ? parseInt(formData.maxDoctors) : undefined,
            applicableProducts: formData.applicableProducts.length > 0 ? formData.applicableProducts : undefined,
            applicableRegions: formData.applicableRegions.length > 0 ? formData.applicableRegions : undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || 'Failed to create discount');
        }
      }

      setShowModal(false);
      fetchDiscounts();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }

  async function toggleDiscountStatus(discount: DiscountCode) {
    try {
      const res = await apiFetch(`/v1/products/admin/discounts/${discount.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !discount.isActive }),
      });
      if (res.ok) {
        fetchDiscounts();
      }
    } catch (error) {
      console.error('Failed to update discount:', error);
    }
  }

  function formatDiscountValue(discount: DiscountCode): string {
    if (discount.discountType === 'PERCENTAGE') {
      return `${discount.discountValue}%`;
    }
    return `$${discount.discountValue}`;
  }

  function toggleProduct(product: string) {
    const products = formData.applicableProducts.includes(product)
      ? formData.applicableProducts.filter((p) => p !== product)
      : [...formData.applicableProducts, product];
    setFormData({ ...formData, applicableProducts: products });
  }

  function toggleRegion(region: string) {
    const regions = formData.applicableRegions.includes(region)
      ? formData.applicableRegions.filter((r) => r !== region)
      : [...formData.applicableRegions, region];
    setFormData({ ...formData, applicableRegions: regions });
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Discounts" subtitle="Manage discount codes" />
        <LoadingState type="table" rows={5} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Discounts"
        subtitle="Manage discount codes and promotions"
        actions={
          <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Discount
          </button>
        }
      />

      {/* Discounts Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usage</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Restrictions</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valid Until</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {discounts.map((discount) => (
                <tr key={discount.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-mono font-semibold text-gray-900">{discount.code}</div>
                      {discount.description && (
                        <div className="text-xs text-gray-500">{discount.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-green-600">
                      {formatDiscountValue(discount)}
                    </span>
                    <span className="text-xs text-gray-500 ml-1">
                      {discount.discountType === 'PERCENTAGE' ? 'off' : 'per doc'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm">
                      {discount.currentRedemptions}
                      {discount.maxRedemptions && (
                        <span className="text-gray-500">
                          {' '}/ {discount.maxRedemptions}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs space-y-1">
                      {(discount.minDoctors || discount.maxDoctors) && (
                        <div className="text-gray-500">
                          Doctors: {discount.minDoctors || 1} - {discount.maxDoctors || '∞'}
                        </div>
                      )}
                      {discount.applicableProducts && discount.applicableProducts.length > 0 && (
                        <div className="text-gray-500">
                          Products: {discount.applicableProducts.join(', ')}
                        </div>
                      )}
                      {discount.applicableRegions && discount.applicableRegions.length > 0 && (
                        <div className="text-gray-500">
                          Regions: {discount.applicableRegions.join(', ')}
                        </div>
                      )}
                      {!discount.minDoctors && !discount.maxDoctors &&
                       (!discount.applicableProducts || discount.applicableProducts.length === 0) &&
                       (!discount.applicableRegions || discount.applicableRegions.length === 0) && (
                        <span className="text-gray-400">No restrictions</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {discount.validUntil
                      ? new Date(discount.validUntil).toLocaleDateString()
                      : 'No expiry'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${
                      discount.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {discount.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(discount)}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => toggleDiscountStatus(discount)}
                        className={`text-sm ${discount.isActive ? 'text-orange-600 hover:text-orange-800' : 'text-green-600 hover:text-green-800'}`}
                      >
                        {discount.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {discounts.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <p className="text-gray-500 mb-4">No discount codes yet.</p>
            <button onClick={handleCreate} className="btn-primary">
              Create Your First Discount
            </button>
          </div>
        )}
      </div>

      {/* Create/Edit Discount Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingDiscount ? 'Edit Discount Code' : 'Create Discount Code'}
              </h2>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Code *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="input-field font-mono"
                  placeholder="SAVE20"
                  disabled={!!editingDiscount}
                  required={!editingDiscount}
                />
                {editingDiscount && (
                  <p className="text-xs text-gray-500 mt-1">Code cannot be changed after creation</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Discount Type *
                  </label>
                  <select
                    value={formData.discountType}
                    onChange={(e) => setFormData({
                      ...formData,
                      discountType: e.target.value as 'PERCENTAGE' | 'FIXED_AMOUNT',
                    })}
                    className="input-field"
                    disabled={!!editingDiscount}
                  >
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FIXED_AMOUNT">Fixed Amount</option>
                  </select>
                  {editingDiscount && (
                    <p className="text-xs text-gray-500 mt-1">Type cannot be changed</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Value *
                  </label>
                  <input
                    type="number"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({
                      ...formData,
                      discountValue: parseFloat(e.target.value) || 0,
                    })}
                    className="input-field"
                    min="0"
                    step={formData.discountType === 'PERCENTAGE' ? '1' : '0.01'}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input-field"
                  placeholder="Early adopter discount"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Redemptions
                  </label>
                  <input
                    type="number"
                    value={formData.maxRedemptions}
                    onChange={(e) => setFormData({ ...formData, maxRedemptions: e.target.value })}
                    className="input-field"
                    placeholder="Unlimited"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Valid Until
                  </label>
                  <input
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Doctors
                  </label>
                  <input
                    type="number"
                    value={formData.minDoctors}
                    onChange={(e) => setFormData({ ...formData, minDoctors: e.target.value })}
                    className="input-field"
                    placeholder="No minimum"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Doctors
                  </label>
                  <input
                    type="number"
                    value={formData.maxDoctors}
                    onChange={(e) => setFormData({ ...formData, maxDoctors: e.target.value })}
                    className="input-field"
                    placeholder="No maximum"
                    min="1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Applicable Products
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={formData.applicableProducts.includes('APPOINTMENTS')}
                      onChange={() => toggleProduct('APPOINTMENTS')}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    Appointments
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={formData.applicableProducts.includes('CLINIQ_BRIEF')}
                      onChange={() => toggleProduct('CLINIQ_BRIEF')}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    CliniqBrief
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1">Leave empty for all products</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Applicable Regions
                </label>
                <div className="flex gap-4">
                  {['US', 'UK', 'IN'].map((region) => (
                    <label key={region} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={formData.applicableRegions.includes(region)}
                        onChange={() => toggleRegion(region)}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      {region}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">Leave empty for all regions</p>
              </div>

              {editingDiscount && (
                <div className="flex items-center gap-3 pt-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                  <span className="text-sm text-gray-700">Discount is active</span>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? 'Saving...' : editingDiscount ? 'Save Changes' : 'Create Discount'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary flex-1"
                  disabled={saving}
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
