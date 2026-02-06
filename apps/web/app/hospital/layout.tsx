'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HospitalGuard } from '../../components/hospital/HospitalGuard';
import { HospitalSidebar } from '../../components/hospital/HospitalSidebar';
import { useAuth } from '../../components/AuthProvider';
import { ChatWidget } from '../../components/ChatWidget';
import { formatTimeInTimezone, formatDateInTimezone, getTimezoneLabel } from '../../lib/timezone';

function getRoleDisplayName(role?: string): string {
  switch (role) {
    case 'STAFF': return 'Staff';
    case 'DOCTOR': return 'Doctor';
    case 'HOSPITAL_MANAGER': return 'Hospital Manager';
    default: return 'User';
  }
}

function HospitalHeader() {
  const { profile, currentHospital, hospitals, setCurrentHospitalId, signOut } = useAuth();
  const headerRouter = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

  // Get display name for current role
  const roleDisplayName = profile?.isSuperAdmin ? 'Super Admin' : getRoleDisplayName(currentHospital?.role);

  // Check if user has multiple hospitals
  const hasMultipleHospitals = hospitals && hospitals.length > 1;

  // Timezone
  const timezone = currentHospital?.timezone || 'America/Chicago';
  const timezoneLabel = getTimezoneLabel(timezone);

  const updateTime = useCallback(() => {
    const now = new Date();
    setCurrentTime(formatTimeInTimezone(now, timezone));
    setCurrentDate(formatDateInTimezone(now, timezone, {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    }));
  }, [timezone]);

  useEffect(() => {
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [updateTime]);

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
        {/* Hospital Icon and Name */}
        {currentHospital && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#1e3a5f' }}>
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-slate-900 truncate">{currentHospital.name}</h1>
              <p className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">Hospital Portal</p>
            </div>
          </div>
        )}
      </div>
      <div className="admin-header-right flex-shrink-0">
        {/* Date, Time & Location */}
        {currentHospital && (
          <div className="hidden lg:flex items-center gap-2 mr-1 text-[11px] text-slate-500">
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-slate-600 font-medium">{currentDate}</span>
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-slate-700 font-semibold">{currentTime}</span>
              <span className="text-slate-400 text-[9px]">({timezoneLabel})</span>
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-slate-600">{currentHospital.city}{currentHospital.state ? `, ${currentHospital.state}` : ''}</span>
            </div>
          </div>
        )}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-semibold text-xs overflow-hidden" style={{ backgroundColor: '#1e3a5f' }}>
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                profile?.fullName?.charAt(0) || profile?.email?.charAt(0) || 'M'
              )}
            </div>
            <div className="hidden sm:flex flex-col items-start">
              <span className="text-xs font-medium text-slate-900">{profile?.fullName || 'User'}</span>
              <span className="text-[10px] text-slate-500">{roleDisplayName}</span>
            </div>
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50">
              <div className="px-3 py-2.5 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-900">{profile?.fullName || 'User'}</p>
                <p className="text-xs text-slate-500 truncate">{profile?.email}</p>
              </div>
              <div className="py-1">
                {hasMultipleHospitals && (
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      setCurrentHospitalId(null);
                      headerRouter.push('/select-hospital');
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors w-full text-left"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    Switch Hospital
                  </button>
                )}
                {profile?.isSuperAdmin && (
                  <Link
                    href="/admin/dashboard"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
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
                  className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors w-full text-left"
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
  const { loading } = useAuth();

  // Show a clean loading state while auth is initializing
  // This prevents the flash of incorrect avatar/nav items
  if (loading) {
    return (
      <div className="admin-layout">
        <div className="admin-sidebar hidden lg:flex flex-col">
          {/* Skeleton sidebar header */}
          <div className="admin-sidebar-header">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-200 animate-pulse" />
              <div className="w-20 h-3 bg-slate-200 rounded animate-pulse" />
            </div>
          </div>
          {/* Skeleton nav items */}
          <div className="px-3 pt-4 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <div className="w-16 h-2 bg-slate-100 rounded" />
                <div className="space-y-1">
                  <div className="w-full h-7 bg-slate-100 rounded" />
                  <div className="w-3/4 h-7 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <main className="admin-content">
          <header className="admin-header">
            <div className="admin-header-left">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-slate-200 animate-pulse" />
                <div className="space-y-1">
                  <div className="w-28 h-3 bg-slate-200 rounded animate-pulse" />
                  <div className="w-16 h-2 bg-slate-100 rounded animate-pulse" />
                </div>
              </div>
            </div>
            <div className="admin-header-right">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-slate-200 animate-pulse" />
                <div className="hidden sm:block space-y-1">
                  <div className="w-20 h-3 bg-slate-200 rounded animate-pulse" />
                  <div className="w-14 h-2 bg-slate-100 rounded animate-pulse" />
                </div>
              </div>
            </div>
          </header>
          <div className="admin-page">
            <div className="flex items-center justify-center h-64">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-[var(--color-primary)] rounded-full animate-spin" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <HospitalSidebar />
      <main className="admin-content">
        <HospitalHeader />
        <div className="admin-page">
          <HospitalGuard>
            {children}
          </HospitalGuard>
        </div>
      </main>
      <ChatWidget />
    </div>
  );
}
