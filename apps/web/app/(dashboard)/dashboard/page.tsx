'use client';

import { useAuth } from '../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardPage() {
  const { user, profile, hospitals, currentHospitalId, loading, legalStatus } = useAuth();
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

    // Users without hospital selected go to selector
    if (!loading && user && hospitals.length > 0 && !currentHospitalId) {
      router.push('/select-hospital');
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

  if (loading || legalStatus === 'checking' || legalStatus === 'unknown') {
    return null;
  }

  // Don't render if redirecting to legal page
  if (legalStatus === 'pending') {
    return <div className="text-gray-500 p-4">Redirecting...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6">
      <h1 className="page-title text-xl sm:text-2xl mb-4 sm:mb-6">Dashboard</h1>

      <div className="card p-4 sm:p-6 mb-4 sm:mb-6">
        <h2 className="text-base sm:text-lg font-heading font-semibold text-gray-900 mb-3 sm:mb-4">
          Welcome, {profile?.fullName || profile?.email}!
        </h2>
        {currentHospital ? (
          <p className="text-gray-600 text-sm sm:text-base">
            You are currently working in <strong>{currentHospital.name}</strong> as a{' '}
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
              currentHospital.role === 'HOSPITAL_MANAGER'
                ? 'bg-purple-100 text-purple-700'
                : currentHospital.role === 'DOCTOR'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700'
            }`}>
              {currentHospital.role.replace('_', ' ')}
            </span>
          </p>
        ) : profile?.isSuperAdmin ? (
          <p className="text-gray-600 text-sm sm:text-base">
            You are logged in as a <span className="text-purple-600 font-medium">Super Admin</span>.
          </p>
        ) : (
          <p className="text-gray-600 text-sm sm:text-base">
            Select a hospital to get started.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <div className="card p-4">
          <div className="text-xl sm:text-2xl font-bold text-primary">{hospitals.length}</div>
          <div className="text-xs sm:text-sm text-gray-500">Hospitals</div>
        </div>

        <div className="card p-4">
          <div className="text-xl sm:text-2xl font-bold text-accent">
            {currentHospital?.role?.replace('_', ' ') || (profile?.isSuperAdmin ? 'SUPER ADMIN' : 'N/A')}
          </div>
          <div className="text-xs sm:text-sm text-gray-500">Your Role</div>
        </div>

        <div className="card p-4 sm:col-span-2 md:col-span-1">
          <div className="text-xl sm:text-2xl font-bold text-gray-900">
            {currentHospital?.timezone || 'Not Set'}
          </div>
          <div className="text-xs sm:text-sm text-gray-500">Timezone</div>
        </div>
      </div>

      {/* Super Admin: Show all hospitals */}
      {profile?.isSuperAdmin && !currentHospital && (
        <div className="mt-6 sm:mt-8 card p-4 sm:p-6">
          <h3 className="text-sm font-heading font-semibold text-gray-900 mb-4">All Hospitals</h3>
          <div className="space-y-3">
            {hospitals.map((hospital) => (
              <div
                key={hospital.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">{hospital.name}</p>
                  <p className="text-sm text-gray-500">
                    {hospital.city}, {hospital.state || hospital.country}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-500">{hospital.timezone}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regular user: Show current hospital details */}
      {currentHospital && (
        <div className="mt-6 sm:mt-8 card p-4 sm:p-6">
          <h3 className="text-sm font-heading font-semibold text-gray-900 mb-3">Hospital Details</h3>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Location</dt>
              <dd className="font-medium">
                {currentHospital.city && currentHospital.state
                  ? `${currentHospital.city}, ${currentHospital.state}`
                  : currentHospital.country}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Region</dt>
              <dd className="font-medium">{currentHospital.region}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Currency</dt>
              <dd className="font-medium">{currentHospital.currency}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Timezone</dt>
              <dd className="font-medium">{currentHospital.timezone}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="mt-6 sm:mt-8 bg-primary-50 border border-primary-200 rounded-lg p-4">
        <h3 className="text-sm font-heading font-semibold text-primary-600 mb-2">
          {profile?.isSuperAdmin ? 'Super Admin Access' : 'Multi-Tenant RLS Active'}
        </h3>
        <p className="text-xs sm:text-sm text-primary-800">
          {profile?.isSuperAdmin
            ? 'You have full administrative access to all hospitals and system settings.'
            : 'All data access is protected by Supabase Row Level Security. You can only see hospitals and data you have been granted access to.'}
        </p>
      </div>
    </div>
  );
}
