'use client';

import React from 'react';
import { useAuth } from '../../../components/AuthProvider';
import { DoctorProfile } from '../../../components/hospital/DoctorProfile';

export default function ProfilePage() {
  const { currentHospital, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const userRole = profile?.isSuperAdmin ? 'SUPER_ADMIN' : (currentHospital?.role || 'STAFF');
  const isDoctor = userRole === 'DOCTOR';

  // Only doctors can access this page
  if (!isDoctor) {
    return (
      <div className="admin-empty-state">
        <p className="admin-empty-title">Access Denied</p>
        <p className="text-gray-500 mt-2">This page is only available for doctors.</p>
      </div>
    );
  }

  return <DoctorProfile />;
}
