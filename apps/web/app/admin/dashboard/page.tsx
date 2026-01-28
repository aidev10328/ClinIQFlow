'use client';

import React, { useMemo } from 'react';
import { PageHeader, StatCard } from '../../../components/admin/ui';
import { useApiQuery } from '../../../lib/hooks/useApiQuery';

interface DashboardStats {
  hospitals: {
    total: number;
    byRegion: { region: string; count: number }[];
  };
  subscriptions: {
    total: number;
    active: number;
    trial: number;
    pastDue: number;
  };
  revenue: {
    mrr: number;
    currency: string;
  };
  trialsExpiring: {
    hospitalName: string;
    expiresIn: number;
  }[];
}

export default function AdminDashboardPage() {
  const { data: hospitals = [], isLoading: hospitalsLoading } = useApiQuery<any[]>(
    ['admin', 'hospitals'],
    '/v1/hospitals'
  );

  const { data: subscriptions = [], isLoading: subsLoading } = useApiQuery<any[]>(
    ['admin', 'subscriptions'],
    '/v1/products/admin/subscriptions'
  );

  const loading = hospitalsLoading || subsLoading;

  const stats = useMemo<DashboardStats | null>(() => {
    if (loading) return null;

    const byRegion: Record<string, number> = {};
    hospitals.forEach((h: any) => {
      byRegion[h.region] = (byRegion[h.region] || 0) + 1;
    });

    let totalMrr = 0;
    let activeCount = 0;
    let trialCount = 0;
    let pastDueCount = 0;
    const trialsExpiring: { hospitalName: string; expiresIn: number }[] = [];

    subscriptions.forEach((sub: any) => {
      if (sub.status === 'ACTIVE') {
        activeCount++;
        totalMrr += sub.totalMonthly || 0;
      } else if (sub.status === 'TRIAL') {
        trialCount++;
        if (sub.trialEndsAt) {
          const expiresAt = new Date(sub.trialEndsAt);
          const now = new Date();
          const daysUntil = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysUntil > 0 && daysUntil <= 7) {
            trialsExpiring.push({ hospitalName: sub.hospitalName, expiresIn: daysUntil });
          }
        }
      } else if (sub.status === 'PAST_DUE') {
        pastDueCount++;
      }
    });

    return {
      hospitals: {
        total: hospitals.length,
        byRegion: Object.entries(byRegion).map(([region, count]) => ({ region, count })),
      },
      subscriptions: { total: subscriptions.length, active: activeCount, trial: trialCount, pastDue: pastDueCount },
      revenue: { mrr: totalMrr, currency: 'USD' },
      trialsExpiring: trialsExpiring.sort((a, b) => a.expiresIn - b.expiresIn),
    };
  }, [hospitals, subscriptions, loading]);

  if (loading) {
    return null;
  }

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of your ClinQflow platform" />

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Total Hospitals"
          value={stats?.hospitals.total || 0}
          href="/admin/hospitals"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
        <StatCard
          label="Monthly Revenue"
          value={`$${(stats?.revenue.mrr || 0).toLocaleString()}`}
          href="/admin/revenue"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Active Subscriptions"
          value={stats?.subscriptions.active || 0}
          subtitle={`${stats?.subscriptions.trial || 0} trials`}
          href="/admin/subscriptions"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }
        />
        <StatCard
          label="Past Due"
          value={stats?.subscriptions.pastDue || 0}
          href="/admin/subscriptions"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hospitals by Region */}
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Hospitals by Region</h3>
          <div className="space-y-3">
            {stats?.hospitals.byRegion.map((item) => (
              <div key={item.region} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">
                    {item.region === 'US' ? '\u{1F1FA}\u{1F1F8}' : item.region === 'UK' ? '\u{1F1EC}\u{1F1E7}' : item.region === 'IN' ? '\u{1F1EE}\u{1F1F3}' : '\u{1F30D}'}
                  </span>
                  <span className="text-sm font-medium text-gray-700">{item.region}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-primary)] rounded-full"
                      style={{ width: `${(item.count / (stats?.hospitals.total || 1)) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 w-8 text-right">{item.count}</span>
                </div>
              </div>
            ))}
            {(!stats?.hospitals.byRegion || stats.hospitals.byRegion.length === 0) && (
              <p className="text-sm text-gray-500 text-center py-4">No hospitals yet</p>
            )}
          </div>
        </div>

        {/* Alerts Panel */}
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Alerts</h3>
          <div className="space-y-3">
            {stats?.trialsExpiring.map((trial, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{trial.hospitalName}</p>
                  <p className="text-xs text-yellow-700">Trial expires in {trial.expiresIn} day{trial.expiresIn !== 1 ? 's' : ''}</p>
                </div>
              </div>
            ))}
            {(stats?.subscriptions.pastDue || 0) > 0 && (
              <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{stats?.subscriptions.pastDue} Past Due</p>
                  <p className="text-xs text-red-700">Subscriptions need attention</p>
                </div>
              </div>
            )}
            {(!stats?.trialsExpiring?.length && !stats?.subscriptions.pastDue) && (
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">All Clear</p>
                  <p className="text-xs text-green-700">No pending alerts</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <a href="/admin/hospitals" className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg border border-gray-100 hover:border-[var(--color-primary)] hover:shadow-sm transition-all">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-[var(--color-primary)]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">Add Hospital</span>
          </a>
          <a href="/admin/subscriptions" className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg border border-gray-100 hover:border-[var(--color-primary)] hover:shadow-sm transition-all">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">New Subscription</span>
          </a>
          <a href="/admin/discounts" className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg border border-gray-100 hover:border-[var(--color-primary)] hover:shadow-sm transition-all">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">Create Discount</span>
          </a>
          <a href="/admin/compliance" className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg border border-gray-100 hover:border-[var(--color-primary)] hover:shadow-sm transition-all">
            <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">Compliance</span>
          </a>
        </div>
      </div>
    </div>
  );
}
