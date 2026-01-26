'use client';

import React from 'react';
import { useAuth } from './AuthProvider';

interface FeatureGateProps {
  /**
   * The product code to check access for (e.g., 'APPOINTMENTS', 'CLINIQ_BRIEF')
   */
  productCode: string;
  /**
   * Content to show when user has access
   */
  children: React.ReactNode;
  /**
   * Optional fallback content when user doesn't have access
   * If not provided, nothing is rendered
   */
  fallback?: React.ReactNode;
  /**
   * If true, shows a default "upgrade required" message as fallback
   */
  showUpgradeMessage?: boolean;
}

/**
 * FeatureGate component for conditional rendering based on product access
 *
 * Usage:
 * ```tsx
 * <FeatureGate productCode="CLINIQ_BRIEF">
 *   <CliniqBriefFeature />
 * </FeatureGate>
 *
 * // With custom fallback
 * <FeatureGate productCode="APPOINTMENTS" fallback={<UpgradePrompt />}>
 *   <AppointmentsCalendar />
 * </FeatureGate>
 *
 * // With default upgrade message
 * <FeatureGate productCode="CLINIQ_BRIEF" showUpgradeMessage>
 *   <CliniqBriefFeature />
 * </FeatureGate>
 * ```
 */
export function FeatureGate({
  productCode,
  children,
  fallback,
  showUpgradeMessage,
}: FeatureGateProps) {
  const { canAccessProduct, loading } = useAuth();

  // While loading, render nothing to prevent flicker
  if (loading) {
    return null;
  }

  // Check access
  const hasAccess = canAccessProduct(productCode);

  if (hasAccess) {
    return <>{children}</>;
  }

  // Show fallback if provided
  if (fallback) {
    return <>{fallback}</>;
  }

  // Show default upgrade message if requested
  if (showUpgradeMessage) {
    return <UpgradeRequiredMessage productCode={productCode} />;
  }

  // Default: render nothing
  return null;
}

/**
 * Default upgrade required message component
 */
function UpgradeRequiredMessage({ productCode }: { productCode: string }) {
  const productNames: Record<string, string> = {
    APPOINTMENTS: 'Appointments',
    CLINIQ_BRIEF: 'CliniqBrief',
  };

  const productName = productNames[productCode] || productCode;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
      <div className="text-gray-400 mb-2">
        <svg
          className="w-12 h-12 mx-auto"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-1">
        {productName} Access Required
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        This feature requires a {productName} license.
        Contact your hospital administrator to request access.
      </p>
    </div>
  );
}

/**
 * Hook for checking product access with more control
 *
 * Usage:
 * ```tsx
 * const { hasAccess, loading } = useFeatureAccess('CLINIQ_BRIEF');
 * ```
 */
export function useFeatureAccess(productCode: string) {
  const { canAccessProduct, loading, entitlements, profile } = useAuth();

  return {
    hasAccess: canAccessProduct(productCode),
    loading,
    entitlements,
    isSuperAdmin: profile?.isSuperAdmin || false,
  };
}

export default FeatureGate;
