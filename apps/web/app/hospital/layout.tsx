'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { HospitalGuard } from '../../components/hospital/HospitalGuard';
import { HospitalSidebar } from '../../components/hospital/HospitalSidebar';
import { useAuth } from '../../components/AuthProvider';

function getRoleDisplayName(role?: string): string {
  switch (role) {
    case 'STAFF': return 'Staff';
    case 'DOCTOR': return 'Doctor';
    case 'HOSPITAL_MANAGER': return 'Hospital Manager';
    default: return 'User';
  }
}

function HospitalHeader() {
  const { profile, currentHospital, hospitals, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get display name for current role
  const roleDisplayName = profile?.isSuperAdmin ? 'Super Admin' : getRoleDisplayName(currentHospital?.role);

  // Check if user has multiple hospitals
  const hasMultipleHospitals = hospitals && hospitals.length > 1;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="admin-header">
      <div className="admin-header-left">
        {/* Hospital Name Display */}
        {currentHospital && (
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-gray-900">{currentHospital.name}</h1>
          </div>
        )}
      </div>
      <div className="admin-header-right">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="admin-user-button"
          >
            <div className="admin-user-avatar">
              {profile?.fullName?.charAt(0) || profile?.email?.charAt(0) || 'M'}
            </div>
            <div className="admin-user-info">
              <span className="admin-user-name">{profile?.fullName || 'User'}</span>
              <span className="admin-user-role">{roleDisplayName}</span>
            </div>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="admin-user-dropdown">
              <div className="px-3 py-2.5 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900">{profile?.fullName || 'User'}</p>
                <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
              </div>
              <div className="py-1">
                {hasMultipleHospitals && (
                  <Link
                    href="/select-hospital"
                    className="admin-dropdown-item"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    Switch Hospital
                  </Link>
                )}
                {profile?.isSuperAdmin && (
                  <Link
                    href="/admin/dashboard"
                    className="admin-dropdown-item"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Admin Console
                  </Link>
                )}
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    signOut();
                  }}
                  className="admin-dropdown-item w-full text-left text-red-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default function HospitalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.body.classList.add('admin-body');
    return () => {
      document.body.classList.remove('admin-body');
    };
  }, []);

  return (
    <HospitalGuard>
      <div className="admin-layout">
        <HospitalSidebar />
        <main className="admin-content">
          <HospitalHeader />
          <div className="admin-page">
            {children}
          </div>
        </main>
      </div>
    </HospitalGuard>
  );
}
