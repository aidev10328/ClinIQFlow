'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../AuthProvider';

interface DoctorGuardProps {
  children: React.ReactNode;
}

export function DoctorGuard({ children }: DoctorGuardProps) {
  const router = useRouter();
  const { user, profile, currentHospitalId, currentHospital, loading, legalStatus } = useAuth();

  React.useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    } else if (!loading && user && !currentHospitalId) {
      router.push('/select-hospital');
    } else if (!loading && currentHospital && currentHospital.role !== 'DOCTOR') {
      // User is not a doctor, redirect to appropriate portal
      if (currentHospital.role === 'HOSPITAL_MANAGER' || currentHospital.role === 'STAFF') {
        router.push('/hospital/dashboard');
      } else {
        router.push('/no-access');
      }
    }
  }, [user, profile, currentHospitalId, currentHospital, loading, router]);

  // Show loading while auth or legal check is in progress
  if (loading || legalStatus === 'checking' || legalStatus === 'unknown') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Only allow doctors
  if (!user || !currentHospitalId || currentHospital?.role !== 'DOCTOR') {
    return null;
  }

  return <>{children}</>;
}
