'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../AuthProvider';

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  React.useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    } else if (!loading && profile && !profile.isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [user, profile, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile?.isSuperAdmin) {
    return null;
  }

  return <>{children}</>;
}
