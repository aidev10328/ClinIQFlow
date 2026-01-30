'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../AuthProvider';

interface HospitalGuardProps {
  children: React.ReactNode;
}

export function HospitalGuard({ children }: HospitalGuardProps) {
  const router = useRouter();
  const { user, profile, hospitals, currentHospitalId, currentHospital, loading, legalStatus } = useAuth();

  React.useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    } else if (!loading && user && !profile) {
      // User exists (from stale cache) but profile fetch failed — session is expired
      router.push('/login');
    } else if (!loading && profile && profile.isSuperAdmin && !currentHospitalId) {
      // Super admin without hospital context should go to admin
      router.push('/admin/dashboard');
    } else if (!loading && user && !currentHospitalId && hospitals.length > 0) {
      router.push('/select-hospital');
    } else if (!loading && user && hospitals.length === 0 && !profile?.isSuperAdmin) {
      // User has no hospital memberships
      router.push('/no-access');
    }
  }, [user, profile, hospitals, currentHospitalId, loading, router]);

  // Show nothing while auth or legal check is in progress (loading.tsx handles the spinner)
  if (loading || legalStatus === 'checking' || legalStatus === 'unknown') {
    return null;
  }

  // Check if user has any valid hospital role (or is super admin)
  const validRoles = ['HOSPITAL_MANAGER', 'DOCTOR', 'STAFF'];
  const hasHospitalAccess = validRoles.includes(currentHospital?.role || '') || profile?.isSuperAdmin;

  if (!user || !currentHospitalId || !hasHospitalAccess) {
    return null;
  }

  return <>{children}</>;
}
