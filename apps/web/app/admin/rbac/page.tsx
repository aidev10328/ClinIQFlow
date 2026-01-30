'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../../components/AuthProvider';
import { PageHeader, Tabs, TabPanel, LoadingState } from '../../../components/admin/ui';

// ─── Types ──────────────────────────────────────────────────────
interface TreeNode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  elementType: string;
  parentCode: string | null;
  sortOrder: number;
  actions: string[];
  children: TreeNode[];
}

interface RolePermission {
  id: string;
  role: string;
  resourceId: string;
  resourceCode: string;
  resourceName: string;
  allowedActions: string[];
  fieldPermissions: { viewable: string[]; editable: string[] };
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
  fieldPermissions: { viewable: string[]; editable: string[] };
}

// ─── Element Type Icons ─────────────────────────────────────────
const TYPE_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  page: { icon: '📄', color: 'text-blue-600 bg-blue-50', label: 'Page' },
  section: { icon: '📁', color: 'text-gray-600 bg-gray-100', label: 'Section' },
  card: { icon: '🃏', color: 'text-green-600 bg-green-50', label: 'Card' },
  chart: { icon: '📊', color: 'text-purple-600 bg-purple-50', label: 'Chart' },
  filter: { icon: '🔍', color: 'text-amber-600 bg-amber-50', label: 'Filter' },
  action: { icon: '⚡', color: 'text-red-600 bg-red-50', label: 'Action' },
  metric: { icon: '📈', color: 'text-cyan-600 bg-cyan-50', label: 'Metric' },
  table: { icon: '📋', color: 'text-indigo-600 bg-indigo-50', label: 'Table' },
  modal: { icon: '🔲', color: 'text-pink-600 bg-pink-50', label: 'Modal' },
  tab: { icon: '📑', color: 'text-teal-600 bg-teal-50', label: 'Tab' },
};

const ACTION_LABELS: Record<string, { short: string; full: string }> = {
  view: { short: 'V', full: 'View' },
  add: { short: 'A', full: 'Add' },
  edit: { short: 'E', full: 'Edit' },
  delete: { short: 'D', full: 'Delete' },
};

const ALL_ACTIONS = ['view', 'add', 'edit', 'delete'];

// ─── Dual role config ───────────────────────────────────────────
const DUAL_ROLE_ID = 'HOSPITAL_MANAGER+DOCTOR';

const ROLE_TABS = [
  { id: 'HOSPITAL_MANAGER', label: 'Hospital Manager', color: 'bg-blue-500' },
  { id: 'HOSPITAL_STAFF', label: 'Hospital Staff', color: 'bg-amber-500' },
  { id: 'DOCTOR', label: 'Doctor', color: 'bg-green-500' },
  { id: DUAL_ROLE_ID, label: 'Manager + Doctor', color: 'bg-gradient-to-r from-blue-500 to-green-500' },
  { id: 'PATIENT', label: 'Patient', color: 'bg-purple-500' },
  { id: 'SALES_MANAGER', label: 'Sales Manager', color: 'bg-orange-500' },
  { id: 'SALES_PERSONNEL', label: 'Sales Personnel', color: 'bg-teal-500' },
  { id: 'CUSTOMER_SERVICE_MANAGER', label: 'CS Manager', color: 'bg-rose-500' },
  { id: 'CUSTOMER_SERVICE_PERSONNEL', label: 'CS Personnel', color: 'bg-pink-500' },
];

// ─── Helper: collect all resource IDs under a node ──────────────
function collectDescendantCodes(node: TreeNode): string[] {
  const codes: string[] = [];
  for (const child of node.children) {
    codes.push(child.code);
    codes.push(...collectDescendantCodes(child));
  }
  return codes;
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const n of nodes) {
    result.push(n);
    result.push(...flattenTree(n.children));
  }
  return result;
}

// ─── Tri-state checkbox logic ───────────────────────────────────
type CheckState = 'checked' | 'unchecked' | 'indeterminate';

function computeCheckState(
  node: TreeNode,
  action: string,
  permMap: Map<string, Set<string>>,
): CheckState {
  if (node.children.length === 0) {
    return permMap.get(node.code)?.has(action) ? 'checked' : 'unchecked';
  }
  const childStates = node.children.map((c) => computeCheckState(c, action, permMap));
  if (childStates.every((s) => s === 'checked')) return 'checked';
  if (childStates.every((s) => s === 'unchecked')) return 'unchecked';
  return 'indeterminate';
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function AdminRbacPage() {
  const { session } = useAuth();

  const [activeTab, setActiveTab] = useState('permissions');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Data
  const [tree, setTree] = useState<{ hospital: TreeNode[]; admin: TreeNode[] }>({ hospital: [], admin: [] });
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<string, RolePermission[]>>({});

  // UI state
  const [selectedRole, setSelectedRole] = useState('HOSPITAL_MANAGER');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'hospital' | 'admin'>('all');

  // Hospital overrides
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);
  const [hospitalOverrides, setHospitalOverrides] = useState<HospitalOverride[]>([]);

  // Pending changes
  const [pendingChanges, setPendingChanges] = useState<Map<string, { resourceId: string; code: string; role: string; actions: string[] }>>(new Map());

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4005';

  // ─── Data fetching ──────────────────────────────────────────
  const fetchTree = useCallback(async () => {
    if (!session?.access_token) return;
    const res = await fetch(`${API_BASE}/v1/rbac/resources/tree`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) setTree(await res.json());
  }, [session?.access_token, API_BASE]);

  const fetchRoles = useCallback(async () => {
    if (!session?.access_token) return;
    const res = await fetch(`${API_BASE}/v1/rbac/roles`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) setRoles(await res.json());
  }, [session?.access_token, API_BASE]);

  const fetchRolePermissions = useCallback(async (role: string) => {
    if (!session?.access_token) return;
    const res = await fetch(`${API_BASE}/v1/rbac/roles/${role}/permissions`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const perms = await res.json();
      setRolePermissions((prev) => ({ ...prev, [role]: perms }));
    }
  }, [session?.access_token, API_BASE]);

  const fetchHospitals = useCallback(async () => {
    if (!session?.access_token) return;
    const res = await fetch(`${API_BASE}/v1/hospitals`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) setHospitals(await res.json());
  }, [session?.access_token, API_BASE]);

  const fetchHospitalOverrides = useCallback(async (hospitalId: string) => {
    if (!session?.access_token) return;
    const res = await fetch(`${API_BASE}/v1/rbac/hospitals/${hospitalId}/overrides`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) setHospitalOverrides(await res.json());
  }, [session?.access_token, API_BASE]);

  // Initial load
  useEffect(() => {
    if (session?.access_token) {
      setLoading(true);
      Promise.all([fetchTree(), fetchRoles(), fetchHospitals()])
        .then(async () => {
          const editableRoles = ['HOSPITAL_MANAGER', 'HOSPITAL_STAFF', 'DOCTOR', 'PATIENT', 'SALES_MANAGER', 'SALES_PERSONNEL', 'CUSTOMER_SERVICE_MANAGER', 'CUSTOMER_SERVICE_PERSONNEL'];
          await Promise.all(editableRoles.map(fetchRolePermissions));
        })
        .finally(() => {
          setLoading(false);
          // Auto-expand top-level nodes
          setExpandedNodes(new Set([
            ...['hospital.dashboard', 'hospital.doctors', 'hospital.doctors.detail', 'hospital.patients',
              'hospital.staff', 'hospital.appointments', 'hospital.billing', 'hospital.settings'],
          ]));
        });
    }
  }, [session?.access_token, fetchTree, fetchRoles, fetchRolePermissions, fetchHospitals]);

  // Fetch hospital overrides when selected
  useEffect(() => {
    if (selectedHospitalId) fetchHospitalOverrides(selectedHospitalId);
    else setHospitalOverrides([]);
  }, [selectedHospitalId, fetchHospitalOverrides]);

  // Clear messages
  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  // ─── Permission helpers ─────────────────────────────────────
  const buildPermMap = useCallback((role: string): Map<string, Set<string>> => {
    const map = new Map<string, Set<string>>();
    const perms = rolePermissions[role] || [];
    for (const p of perms) {
      map.set(p.resourceCode, new Set(p.allowedActions));
    }
    // Apply pending changes for this role
    pendingChanges.forEach((change) => {
      if (change.role === role) {
        map.set(change.code, new Set(change.actions));
      }
    });
    return map;
  }, [rolePermissions, pendingChanges]);

  // For dual role — merge both HOSPITAL_MANAGER and DOCTOR perms
  const dualRolePermMap = useMemo(() => {
    if (selectedRole !== DUAL_ROLE_ID) return null;
    const mgrMap = buildPermMap('HOSPITAL_MANAGER');
    const docMap = buildPermMap('DOCTOR');
    const merged = new Map<string, Set<string>>();
    // Combine
    const allCodes = new Set(Array.from(mgrMap.keys()).concat(Array.from(docMap.keys())));
    allCodes.forEach((code) => {
      const mgrActions = mgrMap.get(code) || new Set<string>();
      const docActions = docMap.get(code) || new Set<string>();
      merged.set(code, new Set(Array.from(mgrActions).concat(Array.from(docActions))));
    });
    return { merged, mgrMap, docMap };
  }, [selectedRole, buildPermMap]);

  const activePermMap = useMemo(() => {
    if (selectedRole === DUAL_ROLE_ID) return dualRolePermMap?.merged || new Map();
    return buildPermMap(selectedRole);
  }, [selectedRole, buildPermMap, dualRolePermMap]);

  const hasPermission = useCallback((code: string, action: string): boolean => {
    return activePermMap.get(code)?.has(action) || false;
  }, [activePermMap]);

  // ─── All flat nodes for search ──────────────────────────────
  const allNodes = useMemo(() => {
    return [...flattenTree(tree.hospital), ...flattenTree(tree.admin)];
  }, [tree]);

  // Build ID lookup
  const codeToIdMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of allNodes) map.set(n.code, n.id);
    return map;
  }, [allNodes]);

  // ─── Search matching ─────────────────────────────────────────
  const matchingCodes = useMemo(() => {
    if (!searchQuery.trim() && typeFilter === 'all') return null;
    const q = searchQuery.toLowerCase().trim();
    return new Set(
      allNodes
        .filter((n) => {
          const nameMatch = !q || n.name.toLowerCase().includes(q) || n.code.toLowerCase().includes(q);
          const typeMatch = typeFilter === 'all' || n.elementType === typeFilter;
          return nameMatch && typeMatch;
        })
        .map((n) => n.code),
    );
  }, [searchQuery, typeFilter, allNodes]);

  // Codes that should be visible (matching + their ancestors)
  const visibleCodes = useMemo(() => {
    if (!matchingCodes) return null;
    const visible = new Set(Array.from(matchingCodes));
    // Add all ancestors
    Array.from(matchingCodes).forEach((code) => {
      let current = code;
      while (current.includes('.')) {
        const parts = current.split('.');
        parts.pop();
        const parent = parts.join('.');
        // Check if this parent exists
        if (allNodes.some((n) => n.code === parent)) {
          visible.add(parent);
        }
        current = parent;
      }
    });
    return visible;
  }, [matchingCodes, allNodes]);

  // Auto-expand when searching
  useEffect(() => {
    if (visibleCodes && (searchQuery || typeFilter !== 'all')) {
      setExpandedNodes(new Set(Array.from(visibleCodes)));
    }
  }, [visibleCodes, searchQuery, typeFilter]);

  // ─── Toggle permission ──────────────────────────────────────
  const togglePermission = useCallback((node: TreeNode, action: string) => {
    if (selectedRole === 'SUPER_ADMIN' || selectedRole === DUAL_ROLE_ID) return;

    const currentPerms = activePermMap.get(node.code) || new Set<string>();
    const isOn = currentPerms.has(action);

    const toggleNode = (n: TreeNode, turnOn: boolean) => {
      const key = `${selectedRole}:${n.code}`;
      const existingChange = pendingChanges.get(key);
      const currentActions = new Set<string>(
        existingChange?.actions || Array.from(activePermMap.get(n.code) || [])
      );

      if (turnOn) {
        currentActions.add(action);
      } else {
        currentActions.delete(action);
      }

      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(key, {
          resourceId: codeToIdMap.get(n.code) || '',
          code: n.code,
          role: selectedRole,
          actions: Array.from(currentActions) as string[],
        });
        return next;
      });
    };

    // Toggle this node
    toggleNode(node, !isOn);

    // Cascade to all children
    const descendants = collectDescendantCodes(node);
    for (const childCode of descendants) {
      const childNode = allNodes.find((n) => n.code === childCode);
      if (childNode) toggleNode(childNode, !isOn);
    }
  }, [selectedRole, activePermMap, pendingChanges, codeToIdMap, allNodes]);

  // ─── Save changes ───────────────────────────────────────────
  const saveChanges = async () => {
    if (!session?.access_token || pendingChanges.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      const byRole = new Map<string, Array<{ resourceId: string; allowedActions: string[] }>>();
      pendingChanges.forEach((change) => {
        if (!byRole.has(change.role)) byRole.set(change.role, []);
        byRole.get(change.role)!.push({
          resourceId: change.resourceId,
          allowedActions: change.actions,
        });
      });

      const roleEntries = Array.from(byRole.entries());
      for (let i = 0; i < roleEntries.length; i++) {
        const [role, permissions] = roleEntries[i];
        const res = await fetch(`${API_BASE}/v1/rbac/roles/${role}/permissions/bulk`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ permissions }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || `Failed to save ${role} permissions`);
        }
      }

      setPendingChanges(new Map());
      setSuccessMessage('Permissions saved successfully');
      const editableRoles = ['HOSPITAL_MANAGER', 'HOSPITAL_STAFF', 'DOCTOR', 'PATIENT', 'SALES_MANAGER', 'SALES_PERSONNEL', 'CUSTOMER_SERVICE_MANAGER', 'CUSTOMER_SERVICE_PERSONNEL'];
      await Promise.all(editableRoles.map(fetchRolePermissions));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Expand / collapse ──────────────────────────────────────
  const toggleExpand = (code: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedNodes(new Set(allNodes.filter((n) => n.children.length > 0).map((n) => n.code)));
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  // ─── Filter trees by category ───────────────────────────────
  const displayTrees = useMemo(() => {
    const result: { category: string; label: string; nodes: TreeNode[] }[] = [];
    if (categoryFilter === 'all' || categoryFilter === 'hospital') {
      result.push({ category: 'hospital', label: 'Hospital Pages', nodes: tree.hospital });
    }
    if (categoryFilter === 'all' || categoryFilter === 'admin') {
      result.push({ category: 'admin', label: 'Admin Pages', nodes: tree.admin });
    }
    return result;
  }, [tree, categoryFilter]);

  // ─── Tab config ─────────────────────────────────────────────
  const tabItems = [
    { id: 'permissions', label: 'Permission Tree' },
    { id: 'roles', label: 'Roles', count: roles.length },
    { id: 'overrides', label: 'Hospital Overrides' },
  ];

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div>
        <PageHeader title="Access Control" subtitle="Manage permissions for all roles across all pages and elements" />
        <LoadingState type="cards" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Access Control"
        subtitle="Manage granular permissions for every page, card, chart, filter, and action"
        actions={
          pendingChanges.size > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-amber-600 font-medium">
                {pendingChanges.size} unsaved change{pendingChanges.size > 1 ? 's' : ''}
              </span>
              <button onClick={() => setPendingChanges(new Map())} className="btn-secondary text-sm">
                Discard
              </button>
              <button onClick={saveChanges} disabled={saving} className="btn-primary text-sm">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )
        }
      />

      {/* Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 ml-4">&times;</button>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {successMessage}
        </div>
      )}

      <Tabs tabs={tabItems} activeTab={activeTab} onChange={setActiveTab} />

      {/* ═══ PERMISSION TREE TAB ═══ */}
      <TabPanel id="permissions" activeTab={activeTab}>
        {/* Role Selector */}
        <div className="mb-4 p-4 bg-white rounded-lg border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium text-gray-700">Role:</span>
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
              Super Admin has full access to everything
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {ROLE_TABS.map((rt) => (
              <button
                key={rt.id}
                onClick={() => setSelectedRole(rt.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedRole === rt.id
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${rt.color}`} />
                  {rt.label}
                </span>
              </button>
            ))}
          </div>
          {selectedRole === DUAL_ROLE_ID && (
            <div className="mt-3 text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg p-2.5">
              Showing merged permissions from Hospital Manager + Doctor roles. This is read-only — edit each role individually.
            </div>
          )}
        </div>

        {/* Search + Filter */}
        <div className="mb-4 flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search resources..."
              className="input-field pl-9 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            )}
          </div>

          {/* Element type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input-field text-sm w-auto"
          >
            <option value="all">All Types</option>
            {Object.entries(TYPE_ICONS).map(([type, info]) => (
              <option key={type} value={type}>{info.icon} {info.label}</option>
            ))}
          </select>

          {/* Category filter */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['all', 'hospital', 'admin'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  categoryFilter === cat
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {cat === 'all' ? 'All' : cat === 'hospital' ? 'Hospital' : 'Admin'}
              </button>
            ))}
          </div>

          {/* Expand/Collapse */}
          <div className="flex gap-1">
            <button onClick={expandAll} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">
              Expand All
            </button>
            <span className="text-gray-300">|</span>
            <button onClick={collapseAll} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">
              Collapse All
            </button>
          </div>
        </div>

        {/* Tree Matrix */}
        <div className="bg-white rounded-lg border border-gray-100 overflow-x-auto">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center">
              <div className="flex-1 min-w-[320px] px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                Resource
              </div>
              {ALL_ACTIONS.map((action) => (
                <div key={action} className="w-16 text-center px-1 py-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase" title={ACTION_LABELS[action].full}>
                    {ACTION_LABELS[action].short}
                  </div>
                  <div className="text-[10px] text-gray-400">{ACTION_LABELS[action].full}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tree body */}
          <div className="divide-y divide-gray-50">
            {displayTrees.map(({ category, label, nodes }) => (
              <div key={category}>
                {/* Category separator */}
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</span>
                </div>

                {nodes.map((node) => (
                  <TreeRow
                    key={node.code}
                    node={node}
                    depth={0}
                    expandedNodes={expandedNodes}
                    toggleExpand={toggleExpand}
                    hasPermission={hasPermission}
                    togglePermission={togglePermission}
                    activePermMap={activePermMap}
                    selectedRole={selectedRole}
                    dualRolePermMap={dualRolePermMap}
                    visibleCodes={visibleCodes}
                    matchingCodes={matchingCodes}
                    pendingChanges={pendingChanges}
                  />
                ))}
              </div>
            ))}
          </div>

          {allNodes.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No resources found. Run the database migration to seed resources.
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <span className="font-medium">Legend:</span>
          {Object.entries(TYPE_ICONS).map(([type, info]) => (
            <span key={type} className="flex items-center gap-1">
              <span>{info.icon}</span>
              <span>{info.label}</span>
            </span>
          ))}
        </div>
      </TabPanel>

      {/* ═══ ROLES TAB ═══ */}
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
                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">System Role</span>
                  {role.role === 'SUPER_ADMIN' && (
                    <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded">Full Access</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-800">About Roles</p>
                <p className="text-sm text-blue-700 mt-1">
                  System roles cannot be modified or deleted. The &quot;Manager + Doctor&quot; dual role shows merged permissions for users who hold both roles at the same hospital.
                </p>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      {/* ═══ HOSPITAL OVERRIDES TAB ═══ */}
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
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>{h.name} ({h.region})</option>
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
                        <div className="font-medium text-gray-900 text-sm">{override.resourceCode}</div>
                        <div className="text-xs text-gray-600">Role: {override.role}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Actions: {override.allowedActions.join(', ') || 'None'}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (!session?.access_token || !selectedHospitalId) return;
                          await fetch(`${API_BASE}/v1/rbac/hospitals/${selectedHospitalId}/overrides/${override.id}`, {
                            method: 'DELETE',
                            headers: { Authorization: `Bearer ${session.access_token}` },
                          });
                          fetchHospitalOverrides(selectedHospitalId);
                          setSuccessMessage('Override removed');
                        }}
                        className="text-red-600 hover:text-red-700 text-xs font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                <p>No custom overrides for this hospital.</p>
                <p className="mt-1 text-gray-400">All users follow the default role permissions.</p>
              </div>
            )
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">
              Select a hospital to view or manage permission overrides.
            </div>
          )}

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-800">About Hospital Overrides</p>
                <p className="text-sm text-blue-700 mt-1">
                  Hospital overrides allow you to customize permissions for specific hospitals.
                  When an override exists, it takes precedence over the default role permissions.
                  Resolution order: User Override &gt; Hospital Override &gt; Role Default.
                </p>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      {/* Sticky save bar */}
      {pendingChanges.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
          <div className="container flex items-center justify-between py-3">
            <span className="text-sm text-amber-600 font-medium">
              {pendingChanges.size} unsaved change{pendingChanges.size > 1 ? 's' : ''}
            </span>
            <div className="flex gap-3">
              <button onClick={() => setPendingChanges(new Map())} className="btn-secondary text-sm">
                Discard
              </button>
              <button onClick={saveChanges} disabled={saving} className="btn-primary text-sm">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TREE ROW COMPONENT
// ═══════════════════════════════════════════════════════════════
function TreeRow({
  node,
  depth,
  expandedNodes,
  toggleExpand,
  hasPermission,
  togglePermission,
  activePermMap,
  selectedRole,
  dualRolePermMap,
  visibleCodes,
  matchingCodes,
  pendingChanges,
}: {
  node: TreeNode;
  depth: number;
  expandedNodes: Set<string>;
  toggleExpand: (code: string) => void;
  hasPermission: (code: string, action: string) => boolean;
  togglePermission: (node: TreeNode, action: string) => void;
  activePermMap: Map<string, Set<string>>;
  selectedRole: string;
  dualRolePermMap: { merged: Map<string, Set<string>>; mgrMap: Map<string, Set<string>>; docMap: Map<string, Set<string>> } | null;
  visibleCodes: Set<string> | null;
  matchingCodes: Set<string> | null;
  pendingChanges: Map<string, any>;
}) {
  // Skip if not visible (search filtering)
  if (visibleCodes && !visibleCodes.has(node.code)) return null;

  const isExpanded = expandedNodes.has(node.code);
  const hasChildren = node.children.length > 0;
  const typeInfo = TYPE_ICONS[node.elementType] || TYPE_ICONS.page;
  const isMatch = matchingCodes?.has(node.code);
  const isReadOnly = selectedRole === 'SUPER_ADMIN' || selectedRole === DUAL_ROLE_ID;
  const isPending = pendingChanges.has(`${selectedRole}:${node.code}`);

  return (
    <>
      <div
        className={`flex items-center hover:bg-gray-50 transition-colors ${
          isMatch ? 'bg-amber-50' : ''
        } ${isPending ? 'bg-yellow-50' : ''}`}
      >
        {/* Resource name with tree indentation */}
        <div
          className="flex-1 min-w-[320px] px-4 py-2 flex items-center gap-1.5"
          style={{ paddingLeft: `${16 + depth * 24}px` }}
        >
          {/* Expand/Collapse toggle */}
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(node.code)}
              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 shrink-0"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}

          {/* Type icon */}
          <span className="text-sm shrink-0" title={typeInfo.label}>{typeInfo.icon}</span>

          {/* Name */}
          <span className={`text-sm ${depth === 0 ? 'font-semibold text-gray-900' : 'text-gray-700'} truncate`}>
            {node.name}
          </span>

          {/* Type badge */}
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeInfo.color} shrink-0 ml-1`}>
            {typeInfo.label}
          </span>

          {isPending && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 shrink-0">
              Modified
            </span>
          )}
        </div>

        {/* Action checkboxes */}
        {ALL_ACTIONS.map((action) => {
          const nodeHasAction = node.actions.includes(action);
          if (!nodeHasAction) {
            return (
              <div key={action} className="w-16 flex items-center justify-center py-2">
                <span className="text-gray-200">-</span>
              </div>
            );
          }

          if (isReadOnly) {
            const isOn = hasPermission(node.code, action);
            // For dual role, show which role contributes
            let sourceLabel = '';
            if (selectedRole === DUAL_ROLE_ID && dualRolePermMap) {
              const fromMgr = dualRolePermMap.mgrMap.get(node.code)?.has(action);
              const fromDoc = dualRolePermMap.docMap.get(node.code)?.has(action);
              if (fromMgr && fromDoc) sourceLabel = 'Both';
              else if (fromMgr) sourceLabel = 'Mgr';
              else if (fromDoc) sourceLabel = 'Doc';
            }
            return (
              <div key={action} className="w-16 flex flex-col items-center justify-center py-2">
                {isOn ? (
                  <span className="text-green-600 text-sm">&#10003;</span>
                ) : (
                  <span className="text-gray-300 text-sm">&#10005;</span>
                )}
                {sourceLabel && (
                  <span className="text-[9px] text-gray-400 mt-0.5">{sourceLabel}</span>
                )}
              </div>
            );
          }

          // Editable checkbox with tri-state for parents
          if (hasChildren) {
            const state = computeCheckState(node, action, activePermMap);
            return (
              <div key={action} className="w-16 flex items-center justify-center py-2">
                <TriStateCheckbox
                  state={state}
                  onChange={() => togglePermission(node, action)}
                />
              </div>
            );
          }

          const isOn = hasPermission(node.code, action);
          return (
            <div key={action} className="w-16 flex items-center justify-center py-2">
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => togglePermission(node, action)}
                  className="h-4 w-4 text-[var(--color-primary)] rounded border-gray-300 focus:ring-[var(--color-primary)] cursor-pointer"
                />
              </label>
            </div>
          );
        })}
      </div>

      {/* Children */}
      {isExpanded &&
        hasChildren &&
        node.children.map((child) => (
          <TreeRow
            key={child.code}
            node={child}
            depth={depth + 1}
            expandedNodes={expandedNodes}
            toggleExpand={toggleExpand}
            hasPermission={hasPermission}
            togglePermission={togglePermission}
            activePermMap={activePermMap}
            selectedRole={selectedRole}
            dualRolePermMap={dualRolePermMap}
            visibleCodes={visibleCodes}
            matchingCodes={matchingCodes}
            pendingChanges={pendingChanges}
          />
        ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// TRI-STATE CHECKBOX
// ═══════════════════════════════════════════════════════════════
function TriStateCheckbox({ state, onChange }: { state: CheckState; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = state === 'indeterminate';
    }
  }, [state]);

  return (
    <label className="inline-flex items-center cursor-pointer">
      <input
        ref={ref}
        type="checkbox"
        checked={state === 'checked'}
        onChange={onChange}
        className="h-4 w-4 text-[var(--color-primary)] rounded border-gray-300 focus:ring-[var(--color-primary)] cursor-pointer"
      />
    </label>
  );
}
