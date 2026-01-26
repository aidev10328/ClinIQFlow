'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../components/AuthProvider';
import { PageHeader, Tabs, TabPanel, LoadingState } from '../../../components/admin/ui';

// Types matching the API
interface ResourceAction {
  id: string;
  resourceId: string;
  action: string;
  name: string;
  description?: string;
}

interface ResourceField {
  id: string;
  resourceId: string;
  fieldCode: string;
  fieldName: string;
  fieldType: string;
  description?: string;
}

interface Resource {
  id: string;
  code: string;
  name: string;
  description?: string;
  category: string;
  pathPattern?: string;
  sortOrder: number;
  actions: ResourceAction[];
  fields: ResourceField[];
}

interface RolePermission {
  id: string;
  role: string;
  resourceId: string;
  resourceCode: string;
  resourceName: string;
  allowedActions: string[];
  fieldPermissions: {
    viewable: string[];
    editable: string[];
  };
}

interface Role {
  role: string;
  name: string;
  isSystem: boolean;
}

interface Hospital {
  id: string;
  name: string;
  region: string;
}

interface HospitalOverride {
  id: string;
  hospitalId: string;
  hospitalName?: string;
  role: string;
  resourceId: string;
  resourceCode: string;
  allowedActions: string[];
  fieldPermissions: {
    viewable: string[];
    editable: string[];
  };
}

export default function AdminRbacPage() {
  const { session } = useAuth();

  const [activeTab, setActiveTab] = useState('matrix');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Data
  const [resources, setResources] = useState<Resource[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<string, RolePermission[]>>({});

  // Filter state
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'admin' | 'hospital'>('all');

  // Hospital overrides
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);
  const [hospitalOverrides, setHospitalOverrides] = useState<HospitalOverride[]>([]);

  // Pending changes tracking
  const [pendingChanges, setPendingChanges] = useState<Map<string, { resourceId: string; role: string; actions: string[] }>>(new Map());

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

  // Fetch resources
  const fetchResources = useCallback(async () => {
    if (!session?.access_token) return;

    const res = await fetch(`${API_BASE}/v1/rbac/resources`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      setResources(await res.json());
    }
  }, [session?.access_token, API_BASE]);

  // Fetch roles
  const fetchRoles = useCallback(async () => {
    if (!session?.access_token) return;

    const res = await fetch(`${API_BASE}/v1/rbac/roles`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      setRoles(await res.json());
    }
  }, [session?.access_token, API_BASE]);

  // Fetch permissions for a role
  const fetchRolePermissions = useCallback(async (role: string) => {
    if (!session?.access_token) return;

    const res = await fetch(`${API_BASE}/v1/rbac/roles/${role}/permissions`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      const perms = await res.json();
      setRolePermissions((prev) => ({ ...prev, [role]: perms }));
    }
  }, [session?.access_token, API_BASE]);

  // Fetch hospitals for override tab
  const fetchHospitals = useCallback(async () => {
    if (!session?.access_token) return;

    const res = await fetch(`${API_BASE}/v1/hospitals`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      setHospitals(await res.json());
    }
  }, [session?.access_token, API_BASE]);

  // Fetch hospital overrides
  const fetchHospitalOverrides = useCallback(async (hospitalId: string) => {
    if (!session?.access_token) return;

    const res = await fetch(`${API_BASE}/v1/rbac/hospitals/${hospitalId}/overrides`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      setHospitalOverrides(await res.json());
    }
  }, [session?.access_token, API_BASE]);

  // Initial load
  useEffect(() => {
    if (session?.access_token) {
      setLoading(true);
      Promise.all([
        fetchResources(),
        fetchRoles(),
        fetchHospitals(),
      ]).then(async () => {
        // Fetch permissions for all non-super-admin roles
        const editableRoles = ['HOSPITAL_MANAGER', 'DOCTOR'];
        await Promise.all(editableRoles.map(fetchRolePermissions));
      }).finally(() => setLoading(false));
    }
  }, [session?.access_token, fetchResources, fetchRoles, fetchRolePermissions, fetchHospitals]);

  // Fetch hospital overrides when hospital selected
  useEffect(() => {
    if (selectedHospitalId) {
      fetchHospitalOverrides(selectedHospitalId);
    } else {
      setHospitalOverrides([]);
    }
  }, [selectedHospitalId, fetchHospitalOverrides]);

  // Check if role has action for resource
  const hasPermission = (role: string, resourceId: string, action: string): boolean => {
    // Check pending changes first
    const key = `${role}:${resourceId}`;
    const pending = pendingChanges.get(key);
    if (pending) {
      return pending.actions.includes(action);
    }

    // Check saved permissions
    const perms = rolePermissions[role] || [];
    const perm = perms.find((p) => p.resourceId === resourceId);
    return perm?.allowedActions.includes(action) || false;
  };

  // Toggle permission
  const togglePermission = (role: string, resourceId: string, action: string) => {
    // Cannot modify SUPER_ADMIN
    if (role === 'SUPER_ADMIN') return;

    const key = `${role}:${resourceId}`;
    const perms = rolePermissions[role] || [];
    const existingPerm = perms.find((p) => p.resourceId === resourceId);
    const currentActions = pendingChanges.get(key)?.actions || existingPerm?.allowedActions || [];

    let newActions: string[];
    if (currentActions.includes(action)) {
      newActions = currentActions.filter((a) => a !== action);
    } else {
      newActions = [...currentActions, action];
    }

    setPendingChanges((prev) => {
      const next = new Map(prev);
      next.set(key, { resourceId, role, actions: newActions });
      return next;
    });
  };

  // Save all pending changes
  const saveChanges = async () => {
    if (!session?.access_token || pendingChanges.size === 0) return;

    setSaving(true);
    setError(null);

    try {
      // Group by role
      const byRole = new Map<string, Array<{ resourceId: string; allowedActions: string[] }>>();
      pendingChanges.forEach((change) => {
        if (!byRole.has(change.role)) {
          byRole.set(change.role, []);
        }
        byRole.get(change.role)!.push({
          resourceId: change.resourceId,
          allowedActions: change.actions,
        });
      });

      // Save each role's changes
      for (const [role, permissions] of byRole) {
        const res = await fetch(`${API_BASE}/v1/rbac/roles/${role}/permissions/bulk`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ permissions }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || `Failed to save ${role} permissions`);
        }
      }

      // Clear pending changes and refresh
      setPendingChanges(new Map());
      setSuccessMessage('Permissions saved successfully');

      // Refresh permissions
      const editableRoles = ['HOSPITAL_MANAGER', 'DOCTOR'];
      await Promise.all(editableRoles.map(fetchRolePermissions));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Clear messages after timeout
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Filter resources
  const filteredResources = resources.filter((r) => {
    if (categoryFilter === 'all') return true;
    return r.category === categoryFilter;
  });

  // Group resources by category
  const groupedResources = filteredResources.reduce((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {} as Record<string, Resource[]>);

  // Editable roles (exclude SUPER_ADMIN)
  const editableRoles = roles.filter((r) => r.role !== 'SUPER_ADMIN');

  const tabItems = [
    { id: 'matrix', label: 'Permission Matrix' },
    { id: 'roles', label: 'Roles' },
    { id: 'resources', label: 'Resources', count: resources.length },
    { id: 'overrides', label: 'Hospital Overrides' },
  ];

  if (loading) {
    return (
      <div>
        <PageHeader title="Access Control (RBAC)" subtitle="Configure roles and permissions for the platform" />
        <LoadingState type="cards" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Access Control (RBAC)"
        subtitle="Configure roles and permissions for the platform"
        actions={
          pendingChanges.size > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-amber-600">
                {pendingChanges.size} unsaved change{pendingChanges.size > 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setPendingChanges(new Map())}
                className="btn-secondary"
              >
                Discard
              </button>
              <button
                onClick={saveChanges}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )
        }
      />

      {/* Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {successMessage}
        </div>
      )}

      <Tabs tabs={tabItems} activeTab={activeTab} onChange={setActiveTab} />

      {/* Permission Matrix Tab */}
      <TabPanel id="matrix" activeTab={activeTab}>
        {/* Filter */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-gray-500">Filter:</span>
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              categoryFilter === 'all'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setCategoryFilter('admin')}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              categoryFilter === 'admin'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Admin Pages
          </button>
          <button
            onClick={() => setCategoryFilter('hospital')}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              categoryFilter === 'hospital'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Hospital Pages
          </button>
        </div>

        {/* Matrix Table */}
        <div className="bg-white rounded-lg border border-gray-100 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-64">
                  Resource / Action
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-32">
                  <div className="flex flex-col items-center">
                    <span>Super Admin</span>
                    <span className="text-[10px] text-gray-400 font-normal">(Always allowed)</span>
                  </div>
                </th>
                {editableRoles.map((role) => (
                  <th key={role.role} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-32">
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(groupedResources).map(([category, categoryResources]) => (
                <>
                  {/* Category Header */}
                  <tr key={category} className="bg-gray-50">
                    <td colSpan={2 + editableRoles.length} className="px-4 py-2">
                      <span className="text-xs font-bold text-gray-600 uppercase">
                        {category === 'admin' ? 'Admin Pages' : 'Hospital Pages'}
                      </span>
                    </td>
                  </tr>

                  {/* Resources */}
                  {categoryResources.map((resource) => (
                    <>
                      {/* Resource row with view action */}
                      <tr key={resource.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-900 text-sm">{resource.name}</div>
                          {resource.description && (
                            <div className="text-xs text-gray-500">{resource.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className="text-green-600 text-lg">&#10003;</span>
                        </td>
                        {editableRoles.map((role) => (
                          <td key={role.role} className="px-4 py-2 text-center">
                            {/* Show nothing for admin resources for non-admin roles */}
                            {category === 'admin' ? (
                              <span className="text-gray-300">-</span>
                            ) : null}
                          </td>
                        ))}
                      </tr>

                      {/* Action rows */}
                      {resource.actions.map((action) => (
                        <tr key={`${resource.id}-${action.action}`} className="hover:bg-gray-50">
                          <td className="px-4 py-1.5 pl-8">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <span className="text-gray-400">&bull;</span>
                              {action.name}
                            </div>
                          </td>
                          <td className="px-4 py-1.5 text-center">
                            <span className="text-green-600 text-sm">&#10003;</span>
                          </td>
                          {editableRoles.map((role) => (
                            <td key={role.role} className="px-4 py-1.5 text-center">
                              {category === 'admin' ? (
                                <span className="text-gray-300">-</span>
                              ) : (
                                <label className="inline-flex items-center justify-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={hasPermission(role.role, resource.id, action.action)}
                                    onChange={() => togglePermission(role.role, resource.id, action.action)}
                                    className="h-4 w-4 text-[var(--color-primary)] rounded border-gray-300 focus:ring-[var(--color-primary)]"
                                  />
                                </label>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-6 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <span className="text-green-600">&#10003;</span>
            <span>Always allowed (Super Admin)</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked readOnly className="h-4 w-4 text-[var(--color-primary)] rounded border-gray-300" />
            <span>Allowed</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" readOnly className="h-4 w-4 rounded border-gray-300" />
            <span>Not allowed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-300">-</span>
            <span>Not applicable</span>
          </div>
        </div>
      </TabPanel>

      {/* Roles Tab */}
      <TabPanel id="roles" activeTab={activeTab}>
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">System Roles</h3>
          <div className="space-y-3">
            {roles.map((role) => (
              <div key={role.role} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">{role.name}</div>
                  <div className="text-sm text-gray-500">{role.role}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                    System Role
                  </span>
                  {role.role === 'SUPER_ADMIN' && (
                    <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded">
                      Full Access
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-800">About Roles</p>
                <p className="text-sm text-blue-700 mt-1">
                  System roles cannot be modified or deleted. Custom roles may be added in a future update.
                </p>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      {/* Resources Tab */}
      <TabPanel id="resources" activeTab={activeTab}>
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          {Object.entries(groupedResources).map(([category, categoryResources]) => (
            <div key={category} className="mb-6 last:mb-0">
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                {category === 'admin' ? 'Admin Pages' : 'Hospital Pages'}
              </h3>
              <div className="space-y-2">
                {categoryResources.map((resource) => (
                  <div key={resource.id} className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{resource.name}</div>
                        <div className="text-sm text-gray-500 mt-0.5">{resource.code}</div>
                        {resource.description && (
                          <div className="text-sm text-gray-600 mt-1">{resource.description}</div>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{resource.pathPattern}</div>
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="text-xs text-gray-500">Actions:</span>
                      {resource.actions.map((action) => (
                        <span
                          key={action.id}
                          className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded"
                        >
                          {action.action}
                        </span>
                      ))}
                    </div>

                    {/* Fields */}
                    {resource.fields.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="text-xs text-gray-500">Fields:</span>
                        {resource.fields.map((field) => (
                          <span
                            key={field.id}
                            className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded"
                          >
                            {field.fieldName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </TabPanel>

      {/* Hospital Overrides Tab */}
      <TabPanel id="overrides" activeTab={activeTab}>
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Hospital</label>
            <select
              value={selectedHospitalId || ''}
              onChange={(e) => setSelectedHospitalId(e.target.value || null)}
              className="input-field max-w-md"
            >
              <option value="">-- Select a hospital --</option>
              {hospitals.map((hospital) => (
                <option key={hospital.id} value={hospital.id}>
                  {hospital.name} ({hospital.region})
                </option>
              ))}
            </select>
          </div>

          {selectedHospitalId ? (
            hospitalOverrides.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Custom Permissions for {hospitals.find((h) => h.id === selectedHospitalId)?.name}
                </h3>
                {hospitalOverrides.map((override) => (
                  <div key={override.id} className="p-4 border border-amber-200 bg-amber-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{override.resourceCode}</div>
                        <div className="text-sm text-gray-600">Role: {override.role}</div>
                        <div className="text-sm text-gray-500 mt-1">
                          Actions: {override.allowedActions.join(', ') || 'None'}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (!session?.access_token) return;
                          await fetch(`${API_BASE}/v1/rbac/hospitals/${selectedHospitalId}/overrides/${override.id}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${session.access_token}` },
                          });
                          fetchHospitalOverrides(selectedHospitalId);
                          setSuccessMessage('Override removed');
                        }}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        Remove Override
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No custom overrides for this hospital.</p>
                <p className="text-sm mt-1">All users follow the default role permissions.</p>
              </div>
            )
          ) : (
            <div className="text-center py-8 text-gray-500">
              Select a hospital to view or manage permission overrides.
            </div>
          )}

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-800">About Hospital Overrides</p>
                <p className="text-sm text-blue-700 mt-1">
                  Hospital overrides allow you to customize permissions for specific hospitals.
                  When an override exists, it takes precedence over the default role permissions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>
    </div>
  );
}
