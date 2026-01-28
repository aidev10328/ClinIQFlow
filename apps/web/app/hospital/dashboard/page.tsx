'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '../../../components/AuthProvider';
import { useApiQuery } from '../../../lib/hooks/useApiQuery';

const DoctorDashboard = dynamic(
  () => import('../../../components/hospital/DoctorDashboard').then((m) => m.DoctorDashboard),
  { loading: () => null }
);

interface DashboardStats {
  totalDoctors: number;
  activeDoctors: number;
  pendingDoctors: number;
  totalPatients: number;
  totalStaff: number;
  activeStaff: number;
  licensesUsed: number;
  licensesTotal: number;
  pendingInvites: number;
}

interface RecentActivity {
  id: string;
  type: 'doctor_joined' | 'patient_added' | 'license_assigned' | 'invite_sent';
  description: string;
  timestamp: string;
}

export default function HospitalDashboardPage() {
  const { currentHospital, profile } = useAuth();

  // Determine user role
  const userRole = profile?.isSuperAdmin ? 'SUPER_ADMIN' : (currentHospital?.role || 'STAFF');
  const isDoctor = userRole === 'DOCTOR';

  // Show doctor-specific dashboard for doctors
  if (isDoctor) {
    return <DoctorDashboard />;
  }

  // Manager/Staff dashboard continues below
  const { data: members = [], isLoading: membersLoading } = useApiQuery<any[]>(
    ['hospital', 'members', 'compliance'],
    '/v1/hospitals/members/compliance'
  );
  const { data: staffData = [], isLoading: staffLoading } = useApiQuery<any[]>(
    ['hospital', 'staff'],
    '/v1/staff'
  );
  const { data: invites = [], isLoading: invitesLoading } = useApiQuery<any[]>(
    ['hospital', 'invites'],
    '/v1/invites/pending'
  );
  const { data: patients = [], isLoading: patientsLoading } = useApiQuery<any[]>(
    ['hospital', 'patients'],
    '/v1/patients'
  );

  const loading = membersLoading || staffLoading || invitesLoading || patientsLoading;

  const stats = useMemo<DashboardStats>(() => {
    const doctors = members.filter((m: any) => m.role === 'DOCTOR');
    const totalDoctors = doctors.length;
    const activeDoctors = doctors.filter((d: any) => d.complianceStatus === 'compliant').length;
    const pendingDoctors = doctors.filter((d: any) =>
      d.complianceStatus === 'pending_signatures' || d.complianceStatus === 'not_logged_in'
    ).length;

    const totalStaff = staffData.length;
    const activeStaff = staffData.filter((s: any) => s.isActive).length;
    const pendingInvites = invites.filter((i: any) => i.status === 'PENDING').length;
    const totalPatients = patients.length;

    return {
      totalDoctors,
      activeDoctors,
      pendingDoctors,
      totalPatients,
      totalStaff,
      activeStaff,
      licensesUsed: activeDoctors,
      licensesTotal: 10,
      pendingInvites,
    };
  }, [members, staffData, invites, patients]);

  if (loading) {
    return null;
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Hospital Dashboard</h1>
          <p className="admin-page-subtitle">
            Welcome back! Here's what's happening at {currentHospital?.name}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Doctors */}
        <Link href="/hospital/doctors" className="admin-stat-card group cursor-pointer">
          <div className="flex items-start justify-between">
            <div>
              <p className="admin-stat-label">Active Doctors</p>
              <p className="admin-stat-value">{stats.activeDoctors}</p>
              {stats.pendingDoctors > 0 && (
                <p className="text-xs text-yellow-600 mt-1">
                  {stats.pendingDoctors} pending setup
                </p>
              )}
            </div>
            <div className="admin-stat-icon group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </Link>

        {/* Total Patients */}
        <Link href="/hospital/patients" className="admin-stat-card group cursor-pointer">
          <div className="flex items-start justify-between">
            <div>
              <p className="admin-stat-label">Total Patients</p>
              <p className="admin-stat-value">{stats.totalPatients}</p>
            </div>
            <div className="admin-stat-icon group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </Link>

        {/* Staff Accounts */}
        <Link href="/hospital/staff" className="admin-stat-card group cursor-pointer">
          <div className="flex items-start justify-between">
            <div>
              <p className="admin-stat-label">Staff Accounts</p>
              <p className="admin-stat-value">{stats.activeStaff}</p>
              <p className="text-xs text-gray-500 mt-1">
                of {stats.totalStaff} total
              </p>
            </div>
            <div className="admin-stat-icon group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
        </Link>

        {/* Pending Invites */}
        <Link href="/hospital/doctors" className="admin-stat-card group cursor-pointer">
          <div className="flex items-start justify-between">
            <div>
              <p className="admin-stat-label">Pending Invites</p>
              <p className="admin-stat-value">{stats.pendingInvites}</p>
            </div>
            <div className="admin-stat-icon group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </Link>
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Quick Actions */}
        <div className="lg:col-span-1">
          <div className="pro-card">
            <div className="pro-card-header">
              <h3 className="pro-card-title">Quick Actions</h3>
            </div>
            <div className="pro-card-body space-y-2">
              <Link
                href="/hospital/doctors?action=invite"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-[var(--color-primary)]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Invite Doctor</p>
                  <p className="text-xs text-gray-500">Send invitation email</p>
                </div>
              </Link>

              <Link
                href="/hospital/patients?action=add"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Add Patient</p>
                  <p className="text-xs text-gray-500">Register new patient</p>
                </div>
              </Link>

              <Link
                href="/hospital/staff?action=add"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Create Staff Account</p>
                  <p className="text-xs text-gray-500">Add receptionist, nurse, etc.</p>
                </div>
              </Link>

              <Link
                href="/hospital/licenses"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Manage Licenses</p>
                  <p className="text-xs text-gray-500">Assign product licenses</p>
                </div>
              </Link>
            </div>
          </div>
        </div>

        {/* Doctors Needing Attention */}
        <div className="lg:col-span-2">
          <div className="pro-card">
            <div className="pro-card-header flex items-center justify-between">
              <h3 className="pro-card-title">Doctors Status Overview</h3>
              <Link href="/hospital/doctors" className="text-xs text-[var(--color-primary)] hover:underline">
                View All
              </Link>
            </div>
            <div className="pro-card-body">
              {stats.totalDoctors === 0 && stats.pendingInvites === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">No doctors yet</p>
                  <p className="text-xs text-gray-500 mb-4">Start by inviting doctors to join your hospital</p>
                  <Link href="/hospital/doctors?action=invite" className="btn-primary text-sm">
                    Invite First Doctor
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Status Summary */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-700">{stats.activeDoctors}</p>
                      <p className="text-xs text-green-600">Active</p>
                    </div>
                    <div className="text-center p-3 bg-yellow-50 rounded-lg">
                      <p className="text-2xl font-bold text-yellow-700">{stats.pendingDoctors}</p>
                      <p className="text-xs text-yellow-600">Pending Setup</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-2xl font-bold text-blue-700">{stats.pendingInvites}</p>
                      <p className="text-xs text-blue-600">Pending Invites</p>
                    </div>
                  </div>

                  {/* Action Items */}
                  {(stats.pendingDoctors > 0 || stats.pendingInvites > 0) && (
                    <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                          <p className="text-sm font-medium text-yellow-800">Action Required</p>
                          <p className="text-xs text-yellow-700 mt-1">
                            {stats.pendingDoctors > 0 && `${stats.pendingDoctors} doctor(s) need to complete their setup. `}
                            {stats.pendingInvites > 0 && `${stats.pendingInvites} invite(s) are waiting to be accepted.`}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hospital Info Card */}
      <div className="pro-card">
        <div className="pro-card-header">
          <h3 className="pro-card-title">Hospital Information</h3>
        </div>
        <div className="pro-card-body">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="info-item">
              <p className="info-label">Hospital Name</p>
              <p className="info-value">{currentHospital?.name}</p>
            </div>
            <div className="info-item">
              <p className="info-label">Location</p>
              <p className="info-value">
                {currentHospital?.city && `${currentHospital.city}, `}
                {currentHospital?.state && `${currentHospital.state}, `}
                {currentHospital?.country}
              </p>
            </div>
            <div className="info-item">
              <p className="info-label">Region</p>
              <p className="info-value">{currentHospital?.region}</p>
            </div>
            <div className="info-item">
              <p className="info-label">Currency</p>
              <p className="info-value">{currentHospital?.currency}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
