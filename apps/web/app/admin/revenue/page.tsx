'use client';

import React, { useState, useEffect } from 'react';
import { PageHeader, StatCard, LoadingState } from '../../../components/admin/ui';
import { apiFetch } from '../../../lib/api';

interface RevenueData {
  mrr: number;
  arr: number;
  byProduct: { productName: string; revenue: number }[];
  byRegion: { region: string; revenue: number }[];
}

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRevenueData();
  }, []);

  async function fetchRevenueData() {
    try {
      const subsRes = await apiFetch('/v1/products/admin/subscriptions');
      const subscriptions = subsRes.ok ? await subsRes.json() : [];

      const byProduct: Record<string, number> = {};
      const byRegion: Record<string, number> = {};
      let totalMrr = 0;

      subscriptions.forEach((sub: any) => {
        if (sub.status === 'ACTIVE' && sub.items) {
          sub.items.forEach((item: any) => {
            const itemTotal = item.monthlyTotal || 0;
            totalMrr += itemTotal;
            byProduct[item.productName] = (byProduct[item.productName] || 0) + itemTotal;
          });
          // Assuming we have region from hospital data - using a placeholder for now
          const region = 'US'; // This would come from hospital data
          byRegion[region] = (byRegion[region] || 0) + (sub.totalMonthly || 0);
        }
      });

      setData({
        mrr: totalMrr,
        arr: totalMrr * 12,
        byProduct: Object.entries(byProduct)
          .map(([productName, revenue]) => ({ productName, revenue }))
          .sort((a, b) => b.revenue - a.revenue),
        byRegion: Object.entries(byRegion)
          .map(([region, revenue]) => ({ region, revenue }))
          .sort((a, b) => b.revenue - a.revenue),
      });
    } catch (error) {
      console.error('Failed to fetch revenue data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Revenue"
          subtitle="Financial overview and analytics"
        />
        <LoadingState type="cards" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Revenue"
        subtitle="Financial overview and analytics"
      />

      {/* Revenue KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Monthly Revenue (MRR)"
          value={`$${(data?.mrr || 0).toLocaleString()}`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Annual Revenue (ARR)"
          value={`$${(data?.arr || 0).toLocaleString()}`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />
        <StatCard
          label="Avg Revenue / Hospital"
          value={`$${data?.byProduct.length ? Math.round(data.mrr / data.byProduct.length).toLocaleString() : 0}`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
        <StatCard
          label="Products Sold"
          value={data?.byProduct.length || 0}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
      </div>

      {/* Revenue Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Product */}
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Revenue by Product</h3>
          <div className="space-y-4">
            {data?.byProduct.map((item) => (
              <div key={item.productName}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{item.productName}</span>
                  <span className="text-sm font-semibold text-gray-900">${item.revenue.toLocaleString()}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-primary)] rounded-full"
                    style={{ width: `${(item.revenue / (data?.mrr || 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {(!data?.byProduct || data.byProduct.length === 0) && (
              <p className="text-sm text-gray-500 text-center py-4">No revenue data yet</p>
            )}
          </div>
        </div>

        {/* By Region */}
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Revenue by Region</h3>
          <div className="space-y-4">
            {data?.byRegion.map((item) => (
              <div key={item.region}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <span>
                      {item.region === 'US' ? '🇺🇸' : item.region === 'UK' ? '🇬🇧' : item.region === 'IN' ? '🇮🇳' : '🌍'}
                    </span>
                    {item.region}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">${item.revenue.toLocaleString()}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${(item.revenue / (data?.mrr || 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {(!data?.byRegion || data.byRegion.length === 0) && (
              <p className="text-sm text-gray-500 text-center py-4">No revenue data yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
