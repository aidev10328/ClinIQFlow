'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../AuthProvider';

interface HospitalGuardProps {
  children: React.ReactNode;
}

export function HospitalGuard({ children }: HospitalGuardProps) {
  const router = useRouter();
  const { user, profile, hospitals, currentHospitalId, currentHospital, loading, setCurrentHospitalId } = useAuth();

  React.useEffect(() => {
    if (loading) return;

    if (!user || (!user && !profile)) {
      router.push('/login');
      return;
    }

    if (profile?.isSuperAdmin && !currentHospitalId) {
      router.push('/admin/dashboard');
      return;
    }

    if (!currentHospitalId) {
      if (hospitals.length === 1) {
        // Auto-select the only hospital — no redirect needed
        setCurrentHospitalId(hospitals[0].id);
      } else if (hospitals.length > 1) {
        router.push('/select-hospital');
      } else if (!profile?.isSuperAdmin) {
        router.push('/no-access');
      }
    }
  }, [user, profile, hospitals, currentHospitalId, loading, router, setCurrentHospitalId]);

  // Only block while auth is loading — don't block on legal check
  // Legal redirect happens via AuthProvider if requirements are pending
  if (loading) {
    return null;
  }

  // Check if user has any valid hospital role (or is super admin)
  const validRoles = ['HOSPITAL_MANAGER', 'DOCTOR', 'STAFF', 'HOSPITAL_STAFF'];
  const hasHospitalAccess = validRoles.includes(currentHospital?.role || '') || profile?.isSuperAdmin;

  if (!user || !currentHospitalId || !hasHospitalAccess) {
    return null;
  }

  return <>{children}</>;
}
