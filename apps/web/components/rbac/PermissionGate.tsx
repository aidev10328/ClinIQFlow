'use client';

import React from 'react';
import { useRbac } from '../../lib/rbac/RbacContext';

interface PermissionGateProps {
  resource: string;
  action: 'view' | 'add' | 'edit' | 'delete';
  children: React.ReactNode;
  fallback?: React.ReactNode;
  // If true, shows a disabled version instead of hiding completely
  showDisabled?: boolean;
}

/**
 * PermissionGate - Conditionally renders children based on RBAC permissions
 *
 * Usage:
 * ```tsx
 * <PermissionGate resource="hospital.doctors" action="add">
 *   <button>Invite Doctor</button>
 * </PermissionGate>
 * ```
 *
 * With fallback:
 * ```tsx
 * <PermissionGate
 *   resource="hospital.doctors"
 *   action="delete"
 *   fallback={<span>No permission</span>}
 * >
 *   <button>Delete Doctor</button>
 * </PermissionGate>
 * ```
 */
export function PermissionGate({
  resource,
  action,
  children,
  fallback = null,
  showDisabled = false,
}: PermissionGateProps) {
  const { can, loading } = useRbac();

  // While loading, don't render anything to avoid flash
  if (loading) {
    return null;
  }

  const hasPermission = can(resource, action);

  if (hasPermission) {
    return <>{children}</>;
  }

  if (showDisabled) {
    // Clone children and add disabled prop
    return (
      <div className="opacity-50 cursor-not-allowed pointer-events-none">
        {children}
      </div>
    );
  }

  return <>{fallback}</>;
}

/**
 * PermissionGateMulti - Requires any/all of multiple permissions
 */
interface PermissionGateMultiProps {
  permissions: Array<{ resource: string; action: 'view' | 'add' | 'edit' | 'delete' }>;
  mode?: 'any' | 'all';
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGateMulti({
  permissions,
  mode = 'any',
  children,
  fallback = null,
}: PermissionGateMultiProps) {
  const { can, loading } = useRbac();

  if (loading) {
    return null;
  }

  const checkResult =
    mode === 'any'
      ? permissions.some((p) => can(p.resource, p.action))
      : permissions.every((p) => can(p.resource, p.action));

  if (checkResult) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

/**
 * SuperAdminOnly - Only renders for super admins
 */
export function SuperAdminOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { permissions, loading } = useRbac();

  if (loading) {
    return null;
  }

  if (permissions?.isSuperAdmin) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

/**
 * RoleGate - Renders based on user role
 */
interface RoleGateProps {
  roles: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGate({ roles, children, fallback = null }: RoleGateProps) {
  const { permissions, loading } = useRbac();

  if (loading) {
    return null;
  }

  // Super admin always has access
  if (permissions?.isSuperAdmin) {
    return <>{children}</>;
  }

  if (permissions?.role && roles.includes(permissions.role)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
