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
    return null;
  }

  if (!user || !profile?.isSuperAdmin) {
    return null;
  }

  return <>{children}</>;
}
