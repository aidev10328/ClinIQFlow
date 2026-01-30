'use client';

import { useAuth } from '../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardPage() {
  const { user, profile, hospitals, currentHospitalId, loading } = useAuth();
  const router = useRouter();

  // Find current hospital
  const currentHospital = hospitals.find(h => h.id === currentHospitalId);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    // Super admins without hospital context go to admin console
    if (!loading && user && profile?.isSuperAdmin && !currentHospitalId) {
      router.push('/admin/dashboard');
      return;
    }

    // Users without hospital selected — auto-route for single hospital, selector for multiple
    if (!loading && user && !profile?.isSuperAdmin && !currentHospitalId) {
      if (hospitals.length === 1) {
        // Single hospital — AuthProvider auto-selects, route directly
        if (hospitals[0].role === 'DOCTOR') {
          router.push('/doctor/dashboard');
        } else {
          router.push('/hospital/dashboard');
        }
      } else {
        router.push('/select-hospital');
      }
      return;
    }

    // Hospital Managers go to hospital dashboard
    if (!loading && user && currentHospital?.role === 'HOSPITAL_MANAGER') {
      router.push('/hospital/dashboard');
      return;
    }

    // Doctors go to doctor dashboard
    if (!loading && user && currentHospital?.role === 'DOCTOR') {
      router.push('/doctor/dashboard');
      return;
    }

    // Staff go to hospital dashboard (they use the same portal as managers with limited access)
    if (!loading && user && currentHospital?.role === 'STAFF') {
      router.push('/hospital/dashboard');
      return;
    }

    // Super admin with hospital selected also goes to hospital dashboard
    if (!loading && user && profile?.isSuperAdmin && currentHospitalId) {
      router.push('/hospital/dashboard');
      return;
    }
  }, [user, hospitals, currentHospitalId, currentHospital?.role, loading, router, profile?.isSuperAdmin]);

  // This page is purely a redirect router — show a spinner while redirecting.
  return (
    <div className="flex flex-col items-center justify-center h-64">
      <div className="w-7 h-7 border-2 border-slate-200 border-t-[var(--color-primary)] rounded-full animate-spin" />
      <p className="mt-3 text-xs text-slate-400">Loading...</p>
    </div>
  );
}
