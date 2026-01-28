'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
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
  const { profile, currentHospital, hospitals, signOut } = useAuth();
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
        {/* Hospital Name Display */}
        {currentHospital && (
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-gray-900">{currentHospital.name}</h1>
          </div>
        )}
      </div>
      <div className="admin-header-right">
        {/* Date, Time & Location */}
        {currentHospital && (
          <div className="hidden md:flex items-center gap-3 mr-2 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-gray-600 font-medium">{currentDate}</span>
            </div>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-gray-700 font-semibold">{currentTime}</span>
              <span className="text-gray-400 text-[10px]">({timezoneLabel})</span>
            </div>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-gray-600">{currentHospital.city}{currentHospital.state ? `, ${currentHospital.state}` : ''}</span>
            </div>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-green-600 font-medium">Healthy</span>
            </div>
          </div>
        )}
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
