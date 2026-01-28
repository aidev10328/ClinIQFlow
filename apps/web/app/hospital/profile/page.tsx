'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '../../../components/AuthProvider';

const DoctorProfile = dynamic(
  () => import('../../../components/hospital/DoctorProfile').then((m) => m.DoctorProfile),
  { loading: () => null }
);

export default function ProfilePage() {
  const { currentHospital, profile, loading } = useAuth();

  if (loading) {
    return null;
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
