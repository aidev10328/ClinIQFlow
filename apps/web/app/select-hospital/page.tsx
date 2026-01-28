'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, Hospital } from '../../components/AuthProvider';

export default function SelectHospitalPage() {
  const router = useRouter();
  const { user, profile, hospitals, currentHospitalId, setCurrentHospitalId, loading } = useAuth();

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    // Super admins can skip hospital selection - auto-redirect to dashboard
    // unless they explicitly want to select a hospital (currentHospitalId already set)
    if (!loading && profile?.isSuperAdmin && !currentHospitalId) {
      // Super admins don't need to select a hospital, let them go to dashboard
      router.push('/dashboard');
      return;
    }

    // Auto-select if only one hospital (for non-super-admins)
    if (!loading && hospitals.length === 1 && !currentHospitalId) {
      setCurrentHospitalId(hospitals[0].id);
      // Route based on role
      if (hospitals[0].role === 'HOSPITAL_MANAGER' || hospitals[0].role === 'STAFF') {
        router.push('/hospital/dashboard');
      } else if (hospitals[0].role === 'DOCTOR') {
        router.push('/doctor/dashboard');
      } else {
        router.push('/dashboard');
      }
      return;
    }

    // If hospital already selected, go to appropriate dashboard
    if (!loading && currentHospitalId) {
      const hospital = hospitals.find(h => h.id === currentHospitalId);
      if (hospital?.role === 'HOSPITAL_MANAGER' || hospital?.role === 'STAFF' || profile?.isSuperAdmin) {
        router.push('/hospital/dashboard');
      } else if (hospital?.role === 'DOCTOR') {
        router.push('/doctor/dashboard');
      } else {
        router.push('/dashboard');
      }
    }
  }, [user, profile?.isSuperAdmin, hospitals, currentHospitalId, loading, router, setCurrentHospitalId]);

  function handleSelectHospital(hospital: Hospital) {
    setCurrentHospitalId(hospital.id);
    // Route based on role
    if (hospital.role === 'HOSPITAL_MANAGER' || hospital.role === 'STAFF' || profile?.isSuperAdmin) {
      router.push('/hospital/dashboard');
    } else if (hospital.role === 'DOCTOR') {
      router.push('/doctor/dashboard');
    } else {
      router.push('/dashboard');
    }
  }

  if (loading) {
    return null;
  }

  if (!user) {
    return null; // Will redirect via useEffect
  }

  if (hospitals.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="card p-8 max-w-md w-full text-center">
          <h1 className="page-title text-xl mb-4">No Hospital Access</h1>
          <p className="text-gray-600 mb-4">
            You don&apos;t have access to any hospitals yet. Please contact your administrator.
          </p>
          <p className="text-sm text-gray-500">
            Logged in as: {profile?.email}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 sm:px-6">
      <div className="w-full max-w-lg">
        <div className="card p-5 sm:p-8">
          <div className="text-center mb-6">
            <h1 className="page-title text-xl sm:text-2xl">Select Hospital</h1>
            <p className="text-gray-500 mt-1 text-sm">
              Choose which hospital you want to work with
            </p>
          </div>

          <div className="space-y-3">
            {hospitals.map((hospital) => (
              <button
                key={hospital.id}
                onClick={() => handleSelectHospital(hospital)}
                className="w-full text-left p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{hospital.name}</div>
                    <div className="text-sm text-gray-500">
                      {hospital.city && hospital.state
                        ? `${hospital.city}, ${hospital.state}`
                        : hospital.country}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      hospital.role === 'HOSPITAL_MANAGER'
                        ? 'bg-purple-100 text-purple-700'
                        : hospital.role === 'DOCTOR'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {hospital.role.replace('_', ' ')}
                    </span>
                    {hospital.isPrimary && (
                      <span className="text-xs text-gray-400 mt-1">Primary</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              Logged in as {profile?.fullName || profile?.email}
              {profile?.isSuperAdmin && (
                <span className="ml-2 text-purple-600">(Super Admin)</span>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
