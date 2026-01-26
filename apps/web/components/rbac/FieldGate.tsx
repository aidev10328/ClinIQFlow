'use client';

import React from 'react';
import { useRbac } from '../../lib/rbac/RbacContext';

interface FieldGateProps {
  resource: string;
  field: string;
  mode: 'view' | 'edit';
  children: React.ReactNode;
  fallback?: React.ReactNode;
  // If true and user can't edit, still shows viewable content
  readOnlyFallback?: boolean;
}

/**
 * FieldGate - Controls field-level visibility and editability
 *
 * Usage for editable field:
 * ```tsx
 * <FieldGate resource="hospital.settings" field="billingInfo" mode="edit">
 *   <input value={billing} onChange={...} />
 * </FieldGate>
 * ```
 *
 * With read-only fallback:
 * ```tsx
 * <FieldGate
 *   resource="hospital.settings"
 *   field="billingInfo"
 *   mode="edit"
 *   readOnlyFallback
 * >
 *   <input value={billing} onChange={...} />
 *   <span slot="readonly">{billing}</span>
 * </FieldGate>
 * ```
 */
export function FieldGate({
  resource,
  field,
  mode,
  children,
  fallback = null,
  readOnlyFallback = false,
}: FieldGateProps) {
  const { canViewField, canEditField, loading } = useRbac();

  if (loading) {
    return null;
  }

  if (mode === 'view') {
    // Check if user can view this field
    if (canViewField(resource, field)) {
      return <>{children}</>;
    }
    return <>{fallback}</>;
  }

  // mode === 'edit'
  if (canEditField(resource, field)) {
    return <>{children}</>;
  }

  // Can't edit - check if should show read-only version
  if (readOnlyFallback && canViewField(resource, field)) {
    // Make children read-only by wrapping with disabled styles
    return (
      <div className="pointer-events-none opacity-75">
        {children}
      </div>
    );
  }

  return <>{fallback}</>;
}

/**
 * SectionGate - Controls section-level visibility
 * Wrapper for FieldGate with section-specific behavior
 */
interface SectionGateProps {
  resource: string;
  section: string;
  mode: 'view' | 'edit';
  children: React.ReactNode;
  fallback?: React.ReactNode;
  // If true, shows section header but content is read-only
  readOnlyFallback?: boolean;
  // Optional title for the section
  title?: string;
}

export function SectionGate({
  resource,
  section,
  mode,
  children,
  fallback = null,
  readOnlyFallback = false,
  title,
}: SectionGateProps) {
  const { canViewField, canEditField, loading } = useRbac();

  if (loading) {
    return null;
  }

  const canView = canViewField(resource, section);
  const canEdit = canEditField(resource, section);

  // Can't even view
  if (!canView) {
    return <>{fallback}</>;
  }

  // View mode - just check viewable
  if (mode === 'view') {
    return <>{children}</>;
  }

  // Edit mode - can fully edit
  if (canEdit) {
    return <>{children}</>;
  }

  // Can view but not edit - show read-only
  if (readOnlyFallback) {
    return (
      <div className="relative">
        {title && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              Read-only
            </span>
          </div>
        )}
        <div className="pointer-events-none opacity-75">{children}</div>
      </div>
    );
  }

  return <>{fallback}</>;
}

/**
 * EditableField - A field that can be made read-only based on permissions
 */
interface EditableFieldProps {
  resource: string;
  field: string;
  value: string | number | boolean | null | undefined;
  children: React.ReactNode; // The editable input
  displayValue?: React.ReactNode; // Custom display for read-only mode
  className?: string;
}

export function EditableField({
  resource,
  field,
  value,
  children,
  displayValue,
  className = '',
}: EditableFieldProps) {
  const { canEditField, loading } = useRbac();

  if (loading) {
    return (
      <div className={`animate-pulse bg-gray-100 h-10 rounded ${className}`} />
    );
  }

  if (canEditField(resource, field)) {
    return <>{children}</>;
  }

  // Read-only display
  return (
    <div className={`py-2 px-3 bg-gray-50 rounded border border-gray-200 text-gray-700 ${className}`}>
      {displayValue !== undefined ? displayValue : String(value ?? '-')}
    </div>
  );
}
