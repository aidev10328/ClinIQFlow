'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../components/AuthProvider';

// Types matching the API response
export interface ResolvedPermission {
  resourceCode: string;
  resourceName: string;
  category: string;
  allowedActions: string[];
  fieldPermissions: {
    viewable: string[];
    editable: string[];
  };
}

export interface UserPermissions {
  role: string | null;
  isSuperAdmin: boolean;
  hospitalId: string | null;
  permissions: ResolvedPermission[];
}

interface RbacContextShape {
  permissions: UserPermissions | null;
  loading: boolean;
  error: string | null;
  // Action checks
  can: (resourceCode: string, action: string) => boolean;
  canView: (resourceCode: string) => boolean;
  canAdd: (resourceCode: string) => boolean;
  canEdit: (resourceCode: string) => boolean;
  canDelete: (resourceCode: string) => boolean;
  // Field checks
  canViewField: (resourceCode: string, field: string) => boolean;
  canEditField: (resourceCode: string, field: string) => boolean;
  // Check if any action is allowed on resource
  hasAnyPermission: (resourceCode: string) => boolean;
  // Refresh permissions
  refreshPermissions: () => Promise<void>;
}

const RbacContext = createContext<RbacContextShape | undefined>(undefined);

export function RbacProvider({ children }: { children: React.ReactNode }) {
  const { session, profile, currentHospitalId } = useAuth();
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch permissions from API
  const fetchPermissions = useCallback(async () => {
    if (!session?.access_token) {
      setPermissions(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };

      if (currentHospitalId) {
        headers['x-hospital-id'] = currentHospitalId;
      }

      const res = await fetch(`${API_BASE}/v1/rbac/my-permissions`, {
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        setPermissions(data);
      } else {
        console.warn('[RbacProvider] Failed to fetch permissions:', res.status);
        // If super admin, set default full permissions
        if (profile?.isSuperAdmin) {
          setPermissions({
            role: 'SUPER_ADMIN',
            isSuperAdmin: true,
            hospitalId: currentHospitalId,
            permissions: [], // Empty, but isSuperAdmin grants all
          });
        } else {
          setError('Failed to fetch permissions');
        }
      }
    } catch (e: any) {
      console.error('[RbacProvider] Error fetching permissions:', e.message);
      // Fallback for super admins
      if (profile?.isSuperAdmin) {
        setPermissions({
          role: 'SUPER_ADMIN',
          isSuperAdmin: true,
          hospitalId: currentHospitalId,
          permissions: [],
        });
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, currentHospitalId, profile?.isSuperAdmin]);

  // Fetch permissions when auth or hospital changes
  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Permission check helpers
  const can = useCallback(
    (resourceCode: string, action: string): boolean => {
      // Super admin bypass
      if (permissions?.isSuperAdmin) return true;

      // Find resource permission
      const resourcePerm = permissions?.permissions.find(
        (p) => p.resourceCode === resourceCode
      );

      if (!resourcePerm) return false;

      return resourcePerm.allowedActions.includes(action);
    },
    [permissions]
  );

  const canView = useCallback(
    (resourceCode: string): boolean => can(resourceCode, 'view'),
    [can]
  );

  const canAdd = useCallback(
    (resourceCode: string): boolean => can(resourceCode, 'add'),
    [can]
  );

  const canEdit = useCallback(
    (resourceCode: string): boolean => can(resourceCode, 'edit'),
    [can]
  );

  const canDelete = useCallback(
    (resourceCode: string): boolean => can(resourceCode, 'delete'),
    [can]
  );

  const canViewField = useCallback(
    (resourceCode: string, field: string): boolean => {
      // Super admin bypass
      if (permissions?.isSuperAdmin) return true;

      const resourcePerm = permissions?.permissions.find(
        (p) => p.resourceCode === resourceCode
      );

      if (!resourcePerm) return false;

      const viewable = resourcePerm.fieldPermissions.viewable;
      return viewable.includes('*') || viewable.includes(field);
    },
    [permissions]
  );

  const canEditField = useCallback(
    (resourceCode: string, field: string): boolean => {
      // Super admin bypass
      if (permissions?.isSuperAdmin) return true;

      const resourcePerm = permissions?.permissions.find(
        (p) => p.resourceCode === resourceCode
      );

      if (!resourcePerm) return false;

      const editable = resourcePerm.fieldPermissions.editable;
      return editable.includes('*') || editable.includes(field);
    },
    [permissions]
  );

  const hasAnyPermission = useCallback(
    (resourceCode: string): boolean => {
      // Super admin bypass
      if (permissions?.isSuperAdmin) return true;

      const resourcePerm = permissions?.permissions.find(
        (p) => p.resourceCode === resourceCode
      );

      return resourcePerm !== undefined && resourcePerm.allowedActions.length > 0;
    },
    [permissions]
  );

  return (
    <RbacContext.Provider
      value={{
        permissions,
        loading,
        error,
        can,
        canView,
        canAdd,
        canEdit,
        canDelete,
        canViewField,
        canEditField,
        hasAnyPermission,
        refreshPermissions: fetchPermissions,
      }}
    >
      {children}
    </RbacContext.Provider>
  );
}

export function useRbac() {
  const ctx = useContext(RbacContext);
  if (!ctx) {
    throw new Error('useRbac must be used within RbacProvider');
  }
  return ctx;
}

// Convenience hook for common permission patterns
export function useResourcePermissions(resourceCode: string) {
  const { canView, canAdd, canEdit, canDelete, canViewField, canEditField, permissions } =
    useRbac();

  return {
    canView: canView(resourceCode),
    canAdd: canAdd(resourceCode),
    canEdit: canEdit(resourceCode),
    canDelete: canDelete(resourceCode),
    canViewField: (field: string) => canViewField(resourceCode, field),
    canEditField: (field: string) => canEditField(resourceCode, field),
    isSuperAdmin: permissions?.isSuperAdmin || false,
    role: permissions?.role || null,
  };
}
