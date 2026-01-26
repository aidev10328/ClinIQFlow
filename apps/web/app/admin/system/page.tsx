'use client';

import React from 'react';
import { PageHeader, StatusBadge } from '../../../components/admin/ui';

export default function AdminSystemPage() {
  return (
    <div>
      <PageHeader
        title="System"
        subtitle="Platform health and configuration"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* API Health */}
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">API Health</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">API Server</p>
                  <p className="text-xs text-gray-500">localhost:4000</p>
                </div>
              </div>
              <StatusBadge status="active" label="Healthy" />
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Database</p>
                  <p className="text-xs text-gray-500">Supabase PostgreSQL</p>
                </div>
              </div>
              <StatusBadge status="active" label="Connected" />
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Authentication</p>
                  <p className="text-xs text-gray-500">Supabase Auth</p>
                </div>
              </div>
              <StatusBadge status="active" label="Active" />
            </div>
          </div>
        </div>

        {/* Feature Flags */}
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Feature Flags</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Legal Gating</p>
                <p className="text-xs text-gray-500">Require legal document acceptance</p>
              </div>
              <div className="w-10 h-6 bg-green-500 rounded-full relative">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Email Notifications</p>
                <p className="text-xs text-gray-500">Send email for invites and alerts</p>
              </div>
              <div className="w-10 h-6 bg-green-500 rounded-full relative">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Trial Mode</p>
                <p className="text-xs text-gray-500">Allow trial subscriptions</p>
              </div>
              <div className="w-10 h-6 bg-green-500 rounded-full relative">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4 text-center">Feature flags are read-only in this view</p>
        </div>

        {/* Support Tools */}
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Support Tools</h3>
          <div className="space-y-3">
            <button className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">View as Hospital</p>
                  <p className="text-xs text-gray-500">Impersonate hospital context</p>
                </div>
              </div>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Resync Subscriptions</p>
                  <p className="text-xs text-gray-500">Recalculate all subscription states</p>
                </div>
              </div>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Environment Info */}
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Environment</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Environment</span>
              <span className="text-sm font-medium text-gray-900">Development</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">API URL</span>
              <span className="text-sm font-medium text-gray-900 font-mono">localhost:4000</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Web URL</span>
              <span className="text-sm font-medium text-gray-900 font-mono">localhost:3000</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-500">Version</span>
              <span className="text-sm font-medium text-gray-900">1.0.0-dev</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
