'use client';

import { useAuth } from './AuthProvider';

interface LegalGateProps {
  children: React.ReactNode;
  /** Optional custom loading message */
  loadingMessage?: string;
}

/**
 * Wrapper component that blocks content rendering until legal status is verified.
 * Shows loading state while checking, and prevents flickering when redirecting to legal page.
 */
export function LegalGate({ children, loadingMessage = 'Loading...' }: LegalGateProps) {
  const { loading, legalStatus, profile } = useAuth();

  // Super admins don't need legal checks
  if (profile?.isSuperAdmin) {
    return <>{children}</>;
  }

  // Show loading while auth or legal check is in progress
  if (loading || legalStatus === 'checking' || legalStatus === 'unknown') {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-gray-500">{loadingMessage}</div>
      </div>
    );
  }

  // Don't render content if redirecting to legal page
  if (legalStatus === 'pending') {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-gray-500">Redirecting to complete required agreements...</div>
      </div>
    );
  }

  // Legal status is 'complete', render children
  return <>{children}</>;
}
