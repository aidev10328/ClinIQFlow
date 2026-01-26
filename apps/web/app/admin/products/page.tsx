'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import { PageHeader, LoadingState } from '../../../components/admin/ui';

interface ProductPricing {
  id: string;
  productId: string;
  region: string;
  currency: string;
  pricePerDoctorPerMonth: number;
  isActive: boolean;
  effectiveAt: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  description: string;
  features: string[];
  isActive: boolean;
  sortOrder: number;
  pricing: ProductPricing[];
}

interface ProductFormData {
  code: string;
  name: string;
  description: string;
  features: string[];
  isActive: boolean;
}

interface PricingFormData {
  US: string;
  UK: string;
  IN: string;
}

const REGION_CURRENCIES: Record<string, string> = {
  US: 'USD',
  UK: 'GBP',
  IN: 'INR',
};

export default function AdminProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState<string>('');

  // Modal states
  const [showProductModal, setShowProductModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [pricingProduct, setPricingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [productForm, setProductForm] = useState<ProductFormData>({
    code: '',
    name: '',
    description: '',
    features: [],
    isActive: true,
  });
  const [featureInput, setFeatureInput] = useState('');
  const [pricingForm, setPricingForm] = useState<PricingFormData>({
    US: '',
    UK: '',
    IN: '',
  });

  useEffect(() => {
    if (user) {
      fetchProducts();
    }
  }, [user]);

  async function fetchProducts() {
    try {
      const url = selectedRegion
        ? `/v1/products?region=${selectedRegion}`
        : '/v1/products';
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      fetchProducts();
    }
  }, [selectedRegion, user]);

  function formatPrice(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  }

  // Open modal to add new product
  function handleAddProduct() {
    setEditingProduct(null);
    setProductForm({
      code: '',
      name: '',
      description: '',
      features: [],
      isActive: true,
    });
    setFeatureInput('');
    setError(null);
    setShowProductModal(true);
  }

  // Open modal to edit existing product
  function handleEditProduct(product: Product) {
    setEditingProduct(product);
    setProductForm({
      code: product.code,
      name: product.name,
      description: product.description || '',
      features: [...product.features],
      isActive: product.isActive,
    });
    setFeatureInput('');
    setError(null);
    setShowProductModal(true);
  }

  // Open modal to edit pricing
  function handleEditPricing(product: Product) {
    setPricingProduct(product);
    const pricing: PricingFormData = { US: '', UK: '', IN: '' };
    product.pricing.forEach((p) => {
      if (p.region in pricing) {
        pricing[p.region as keyof PricingFormData] = p.pricePerDoctorPerMonth.toString();
      }
    });
    setPricingForm(pricing);
    setError(null);
    setShowPricingModal(true);
  }

  // Add feature to list
  function handleAddFeature() {
    const trimmed = featureInput.trim();
    if (trimmed && !productForm.features.includes(trimmed)) {
      setProductForm({ ...productForm, features: [...productForm.features, trimmed] });
      setFeatureInput('');
    }
  }

  // Remove feature from list
  function handleRemoveFeature(index: number) {
    const newFeatures = productForm.features.filter((_, i) => i !== index);
    setProductForm({ ...productForm, features: newFeatures });
  }

  // Save product (create or update)
  async function handleSaveProduct() {
    setError(null);
    setSaving(true);

    try {
      if (editingProduct) {
        // Update existing product
        const res = await apiFetch(`/v1/products/admin/products/${editingProduct.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: productForm.name,
            description: productForm.description,
            features: productForm.features,
            isActive: productForm.isActive,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || 'Failed to update product');
        }
      } else {
        // Create new product
        if (!productForm.code.trim()) {
          throw new Error('Product code is required');
        }
        if (!productForm.name.trim()) {
          throw new Error('Product name is required');
        }

        const res = await apiFetch('/v1/products/admin/products', {
          method: 'POST',
          body: JSON.stringify({
            code: productForm.code.trim().toUpperCase(),
            name: productForm.name.trim(),
            description: productForm.description.trim(),
            features: productForm.features,
            isActive: productForm.isActive,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || 'Failed to create product');
        }
      }

      setShowProductModal(false);
      await fetchProducts();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }

  // Save pricing updates
  async function handleSavePricing() {
    if (!pricingProduct) return;

    setError(null);
    setSaving(true);

    try {
      const regions: (keyof PricingFormData)[] = ['US', 'UK', 'IN'];

      for (const region of regions) {
        const priceValue = pricingForm[region];
        if (priceValue !== '') {
          const price = parseFloat(priceValue);
          if (isNaN(price) || price < 0) {
            throw new Error(`Invalid price for ${region}`);
          }

          const res = await apiFetch(
            `/v1/products/admin/products/${pricingProduct.id}/pricing/${region}`,
            {
              method: 'PATCH',
              body: JSON.stringify({ pricePerDoctorPerMonth: price }),
            }
          );

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.message || `Failed to update ${region} pricing`);
          }
        }
      }

      setShowPricingModal(false);
      await fetchProducts();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Products" subtitle="Manage products and pricing" />
        <LoadingState type="cards" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Manage products and regional pricing"
        actions={
          <div className="flex items-center gap-3">
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="input-field text-sm"
            >
              <option value="">All Regions</option>
              <option value="US">US</option>
              <option value="UK">UK</option>
              <option value="IN">India</option>
            </select>
            <button
              onClick={handleAddProduct}
              className="btn-primary text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Product
            </button>
          </div>
        }
      />

      {/* Products Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <div key={product.id} className="card p-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{product.name}</h2>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                  {product.code}
                </span>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${
                product.isActive
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {product.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <p className="text-sm text-gray-600 mb-4">{product.description}</p>

            {/* Features */}
            {product.features.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Features</h3>
                <ul className="space-y-1">
                  {product.features.map((feature, idx) => (
                    <li key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">&#x2713;</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Pricing Table */}
            {product.pricing.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Pricing per Doctor/Month</h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {product.pricing.map((price) => (
                    <div key={price.id} className="p-2 bg-gray-50 rounded">
                      <div className="text-xs text-gray-500 uppercase">{price.region}</div>
                      <div className="font-semibold text-gray-900">
                        {formatPrice(price.pricePerDoctorPerMonth, price.currency)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => handleEditProduct(product)}
                className="flex-1 btn-secondary text-xs py-2"
              >
                Edit Product
              </button>
              <button
                onClick={() => handleEditPricing(product)}
                className="flex-1 btn-secondary text-xs py-2"
              >
                Edit Rates
              </button>
            </div>
          </div>
        ))}
      </div>

      {products.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="text-gray-500 mb-4">No products found.</p>
          <button onClick={handleAddProduct} className="btn-primary">
            Create Your First Product
          </button>
        </div>
      )}

      {/* Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product Code
                </label>
                <input
                  type="text"
                  value={productForm.code}
                  onChange={(e) => setProductForm({ ...productForm, code: e.target.value })}
                  className="input-field"
                  placeholder="e.g., EMR_BASIC"
                  disabled={!!editingProduct}
                />
                {editingProduct && (
                  <p className="text-xs text-gray-500 mt-1">Code cannot be changed after creation</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product Name
                </label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="input-field"
                  placeholder="e.g., EMR Basic"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  className="input-field"
                  rows={3}
                  placeholder="Brief description of this product..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Features
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={featureInput}
                    onChange={(e) => setFeatureInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddFeature())}
                    className="input-field flex-1"
                    placeholder="Add a feature..."
                  />
                  <button
                    type="button"
                    onClick={handleAddFeature}
                    className="btn-secondary px-4"
                  >
                    Add
                  </button>
                </div>
                {productForm.features.length > 0 && (
                  <ul className="space-y-1">
                    {productForm.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded text-sm">
                        <span>{feature}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFeature(idx)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productForm.isActive}
                    onChange={(e) => setProductForm({ ...productForm, isActive: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
                <span className="text-sm text-gray-700">Product is active</span>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="btn-secondary"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProduct}
                className="btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Modal */}
      {showPricingModal && pricingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                Edit Pricing - {pricingProduct.name}
              </h2>
              <p className="text-sm text-gray-500 mt-1">Set price per doctor per month</p>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {(['US', 'UK', 'IN'] as const).map((region) => (
                <div key={region}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {region === 'US' ? 'United States' : region === 'UK' ? 'United Kingdom' : 'India'} ({REGION_CURRENCIES[region]})
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                      {region === 'US' ? '$' : region === 'UK' ? '£' : '₹'}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pricingForm[region]}
                      onChange={(e) => setPricingForm({ ...pricingForm, [region]: e.target.value })}
                      className="input-field pl-8"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPricingModal(false)}
                className="btn-secondary"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePricing}
                className="btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Pricing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
