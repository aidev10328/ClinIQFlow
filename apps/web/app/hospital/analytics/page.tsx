'use client';

import React, { useState } from 'react';
import { useAuth } from '../../../components/AuthProvider';
import { useAnalyticsData } from '../../../components/analytics/useAnalyticsData';
import InsightsTab from '../../../components/analytics/InsightsTab';
import DataReportsTab from '../../../components/analytics/DataReportsTab';
import LogsTab from '../../../components/analytics/LogsTab';

type AnalyticsTab = 'insights' | 'reports' | 'logs';

export default function AnalyticsPage() {
  const { profile, currentHospital } = useAuth();
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('insights');

  const isManager = profile?.isSuperAdmin || currentHospital?.role === 'HOSPITAL_MANAGER';

  const analyticsData = useAnalyticsData();

  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h2 className="text-lg font-semibold text-gray-700 mb-1">Access Restricted</h2>
        <p className="text-sm text-gray-500">Only hospital managers can access analytics.</p>
      </div>
    );
  }

  const tabs: { id: AnalyticsTab; label: string }[] = [
    { id: 'insights', label: 'Insights' },
    { id: 'reports', label: 'Data Reports' },
    { id: 'logs', label: 'Logs' },
  ];

  return (
    <div className="page-fullheight flex flex-col overflow-auto lg:overflow-hidden p-2 gap-1.5">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-sm font-semibold text-slate-800">Analytics</h1>
        <p className="text-[10px] text-slate-400">Hospital performance metrics, reports, and daily logs</p>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 gap-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold transition-all text-center rounded-md ${
              activeTab === t.id
                ? 'bg-[#1e3a5f] text-white shadow-sm'
                : 'bg-white border border-[#1e3a5f]/30 text-[#1e3a5f]/70 hover:text-[#1e3a5f] hover:border-[#1e3a5f]/50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === 'insights' && <InsightsTab data={analyticsData} />}
        {activeTab === 'reports' && <DataReportsTab data={analyticsData} />}
        {activeTab === 'logs' && <LogsTab data={analyticsData} />}
      </div>
    </div>
  );
}
