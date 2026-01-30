'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../components/AuthProvider';
import { PageHeader, Tabs, TabPanel, LoadingState } from '../../../components/admin/ui';

// ─── Types ──────────────────────────────────────────────────────
interface ScopingRule {
  id: string;
  role: string;
  dataDomain: string;
  scopeType: string;
  description: string | null;
  isActive: boolean;
}

// ─── Constants ──────────────────────────────────────────────────
const ROLE_TABS = [
  { id: 'HOSPITAL_MANAGER', label: 'Hospital Manager' },
  { id: 'DOCTOR', label: 'Doctor' },
  { id: 'HOSPITAL_STAFF', label: 'Hospital Staff' },
  { id: 'PATIENT', label: 'Patient' },
  { id: 'SALES_MANAGER', label: 'Sales Manager' },
  { id: 'SALES_PERSONNEL', label: 'Sales Personnel' },
  { id: 'CUSTOMER_SERVICE_MANAGER', label: 'CS Manager' },
  { id: 'CUSTOMER_SERVICE_PERSONNEL', label: 'CS Personnel' },
];

const DOMAIN_LABELS: Record<string, { label: string; description: string }> = {
  doctors: { label: 'Doctors', description: 'Which doctors this role can see' },
  patients: { label: 'Patients', description: 'Which patients this role can access' },
  appointments: { label: 'Appointments', description: 'Which appointments are visible' },
  schedule: { label: 'Schedule', description: 'Which schedules are accessible' },
  metrics: { label: 'Metrics / KPIs', description: 'What metrics and analytics data is shown' },
  staff: { label: 'Staff', description: 'Which staff members are visible' },
};

const SCOPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  doctors: [
    { value: 'all_hospital', label: 'All Hospital' },
    { value: 'self_only', label: 'Self Only' },
    { value: 'assigned_only', label: 'Assigned Only' },
    { value: 'none', label: 'No Access' },
  ],
  patients: [
    { value: 'all_hospital', label: 'All Hospital' },
    { value: 'by_doctor_scope', label: 'By Doctor Scope' },
    { value: 'self_record', label: 'Own Record Only' },
    { value: 'none', label: 'No Access' },
  ],
  appointments: [
    { value: 'all_hospital', label: 'All Hospital' },
    { value: 'by_doctor_scope', label: 'By Doctor Scope' },
    { value: 'self_only', label: 'Self Only' },
    { value: 'none', label: 'No Access' },
  ],
  schedule: [
    { value: 'all_hospital', label: 'All Hospital' },
    { value: 'by_doctor_scope', label: 'By Doctor Scope' },
    { value: 'self_only', label: 'Self Only' },
    { value: 'none', label: 'No Access' },
  ],
  metrics: [
    { value: 'hospital_wide', label: 'Hospital Wide' },
    { value: 'by_doctor_scope', label: 'By Doctor Scope' },
    { value: 'self_only', label: 'Self Only' },
    { value: 'none', label: 'No Access' },
  ],
  staff: [
    { value: 'all_hospital', label: 'All Hospital' },
    { value: 'same_doctors', label: 'Same Doctors' },
    { value: 'none', label: 'No Access' },
  ],
};

const SCOPE_BADGE_COLORS: Record<string, string> = {
  all_hospital: 'bg-green-100 text-green-800',
  hospital_wide: 'bg-green-100 text-green-800',
  self_only: 'bg-blue-100 text-blue-800',
  assigned_only: 'bg-amber-100 text-amber-800',
  by_doctor_scope: 'bg-purple-100 text-purple-800',
  self_record: 'bg-cyan-100 text-cyan-800',
  same_doctors: 'bg-indigo-100 text-indigo-800',
  none: 'bg-red-100 text-red-800',
};

const DOMAIN_ORDER = ['doctors', 'patients', 'appointments', 'schedule', 'metrics', 'staff'];

// ─── Component ──────────────────────────────────────────────────
export default function DataScopingPage() {
  const { session } = useAuth();
  const [rules, setRules] = useState<ScopingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeRole, setActiveRole] = useState('HOSPITAL_MANAGER');
  const [pendingChanges, setPendingChanges] = useState<Map<string, { role: string; dataDomain: string; scopeType: string }>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4005';

  // ─── Fetch rules ──────────────────────────────────────────────
  const fetchRules = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/data-scoping/rules`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        setRules(await res.json());
      } else {
        setError('Failed to load scoping rules');
      }
    } catch {
      setError('Failed to connect to server');
    }
    setLoading(false);
  }, [session?.access_token, API_BASE]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // ─── Get rules for active role, ordered by domain ─────────────
  const roleRules = rules
    .filter((r) => r.role === activeRole)
    .sort((a, b) => DOMAIN_ORDER.indexOf(a.dataDomain) - DOMAIN_ORDER.indexOf(b.dataDomain));

  // ─── Handle scope change ──────────────────────────────────────
  const handleScopeChange = (dataDomain: string, newScope: string) => {
    const key = `${activeRole}:${dataDomain}`;
    const original = rules.find((r) => r.role === activeRole && r.dataDomain === dataDomain);

    if (original && original.scopeType === newScope) {
      // Revert to original — remove pending change
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } else {
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(key, { role: activeRole, dataDomain, scopeType: newScope });
        return next;
      });
    }
  };

  // ─── Get current scope for a domain (pending change or original)
  const getCurrentScope = (dataDomain: string): string => {
    const key = `${activeRole}:${dataDomain}`;
    const pending = pendingChanges.get(key);
    if (pending) return pending.scopeType;
    const original = rules.find((r) => r.role === activeRole && r.dataDomain === dataDomain);
    return original?.scopeType || 'none';
  };

  // ─── Check if a domain has a pending change ───────────────────
  const hasPendingChange = (dataDomain: string): boolean => {
    return pendingChanges.has(`${activeRole}:${dataDomain}`);
  };

  // ─── Save changes ─────────────────────────────────────────────
  const saveChanges = async () => {
    if (!session?.access_token || pendingChanges.size === 0) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    const updates = Array.from(pendingChanges.values());

    try {
      const res = await fetch(`${API_BASE}/v1/data-scoping/rules/bulk`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rules: updates }),
      });

      if (res.ok) {
        setPendingChanges(new Map());
        setSuccessMsg(`Updated ${updates.length} rule${updates.length > 1 ? 's' : ''} successfully`);
        await fetchRules();
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.message || 'Failed to save changes');
      }
    } catch {
      setError('Failed to connect to server');
    }
    setSaving(false);
  };

  // ─── Discard changes ──────────────────────────────────────────
  const discardChanges = () => {
    setPendingChanges(new Map());
  };

  // ─── Count pending changes for current role ───────────────────
  const pendingCount = Array.from(pendingChanges.values()).filter((c) => c.role === activeRole).length;
  const totalPendingCount = pendingChanges.size;

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Data Scoping"
          subtitle="Control what data each hospital role can see"
        />
        <LoadingState rows={6} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Data Scoping"
        subtitle="Control what data each hospital role can see. This determines data filtering, not page access."
      />

      {/* Info banner */}
      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800">
            <strong>How it works:</strong> All hospital roles see the same dashboard layout. Data Scoping controls which data populates the dashboard based on the user&apos;s role. The key dimension is <strong>doctor visibility</strong> — once determined, patients, appointments, schedule, and metrics all follow.
          </div>
        </div>
      </div>

      {/* Error / Success messages */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}
      {successMsg && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {successMsg}
        </div>
      )}

      {/* Role tabs */}
      <Tabs
        tabs={ROLE_TABS.map((r) => ({
          id: r.id,
          label: r.label,
          count: Array.from(pendingChanges.values()).filter((c) => c.role === r.id).length || undefined,
        }))}
        activeTab={activeRole}
        onChange={setActiveRole}
      />

      {/* Rules table for active role */}
      <div className="mt-4 rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3 w-48">Data Domain</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3 w-56">Scope</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Description</th>
            </tr>
          </thead>
          <tbody>
            {DOMAIN_ORDER.map((domain, idx) => {
              const domainInfo = DOMAIN_LABELS[domain];
              const currentScope = getCurrentScope(domain);
              const isChanged = hasPendingChange(domain);
              const options = SCOPE_OPTIONS[domain] || [];
              const badgeColor = SCOPE_BADGE_COLORS[currentScope] || 'bg-gray-100 text-gray-800';

              return (
                <tr
                  key={domain}
                  className={`border-b border-gray-100 transition-colors ${isChanged ? 'bg-amber-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                >
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900 text-sm">{domainInfo?.label || domain}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{domainInfo?.description}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <select
                        value={currentScope}
                        onChange={(e) => handleScopeChange(domain, e.target.value)}
                        className={`block w-full rounded-md border text-sm py-1.5 px-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          isChanged ? 'border-amber-400 bg-amber-50' : 'border-gray-300 bg-white'
                        }`}
                      >
                        {options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {isChanged && (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-amber-400" title="Unsaved change" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeColor}`}>
                      {options.find((o) => o.value === currentScope)?.label || currentScope}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Scope types legend */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Scope Types Reference</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { scope: 'all_hospital', desc: 'See all data in the hospital' },
            { scope: 'hospital_wide', desc: 'Hospital-wide aggregated metrics' },
            { scope: 'self_only', desc: 'Only the user\'s own data' },
            { scope: 'assigned_only', desc: 'Only assigned doctors\' data' },
            { scope: 'by_doctor_scope', desc: 'Cascades from doctor visibility' },
            { scope: 'self_record', desc: 'Patient\'s own record only' },
            { scope: 'same_doctors', desc: 'Staff sharing same assigned doctors' },
            { scope: 'none', desc: 'No access to this data' },
          ].map(({ scope, desc }) => (
            <div key={scope} className="flex items-start gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0 mt-0.5 ${SCOPE_BADGE_COLORS[scope]}`}>
                {scope}
              </span>
              <span className="text-xs text-gray-600">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Save bar — sticky at bottom when there are changes */}
      {totalPendingCount > 0 && (
        <div className="sticky bottom-0 mt-6 -mx-6 px-6 py-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold mr-2">
              {totalPendingCount}
            </span>
            unsaved change{totalPendingCount !== 1 ? 's' : ''}
          </div>
          <div className="flex gap-3">
            <button
              onClick={discardChanges}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Discard
            </button>
            <button
              onClick={saveChanges}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
