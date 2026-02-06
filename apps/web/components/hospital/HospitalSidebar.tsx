'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../AuthProvider';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: string[]; // If specified, only these roles can see this item
}

interface NavSection {
  title: string;
  items: NavItem[];
  roles?: string[]; // If specified, only these roles can see this section
}

// Icons as reusable components
const icons = {
  dashboard: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  analytics: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  appointments: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  queue: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  doctors: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  profile: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  patients: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  staff: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  licenses: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
  ),
  billing: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  settings: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  hospital: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  medicalReport: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  payments: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
};

export function HospitalSidebar() {
  const pathname = usePathname();
  const { currentHospital, profile, canAccessProduct, hospitals, setCurrentHospitalId, signOut } = useAuth();

  // Get user role
  const userRole = profile?.isSuperAdmin ? 'SUPER_ADMIN' : (currentHospital?.role || 'STAFF');
  const isManager = userRole === 'SUPER_ADMIN' || userRole === 'HOSPITAL_MANAGER';
  const isDoctor = userRole === 'DOCTOR';
  const isStaff = userRole === 'STAFF';

  // Check product access
  const hasAppointments = canAccessProduct('APPOINTMENTS');

  // Build navigation sections based on role
  const navSections: NavSection[] = useMemo(() => {
    const sections: NavSection[] = [];

    // Management section
    const managementItems: NavItem[] = [
      { label: 'Dashboard', href: '/hospital/dashboard', icon: icons.dashboard },
    ];

    // Hospital Administration - only for managers
    if (isManager) {
      managementItems.push({
        label: 'Administration',
        href: '/hospital/details',
        icon: icons.hospital
      });
      managementItems.push({
        label: 'Doctors',
        href: '/hospital/doctors',
        icon: icons.doctors
      });
    }

    // Patients - visible to managers, doctors, and staff
    if (isManager || isDoctor || isStaff) {
      managementItems.push({
        label: 'Patients',
        href: '/hospital/patients',
        icon: icons.patients
      });
    }

    // My Profile - doctors only
    if (isDoctor) {
      managementItems.push({
        label: 'My Profile',
        href: '/hospital/profile',
        icon: icons.profile
      });
    }

    // Analytics - visible to managers
    if (isManager) {
      managementItems.push({
        label: 'Analytics',
        href: '/hospital/analytics',
        icon: icons.analytics
      });
    }

    sections.push({ title: 'Management', items: managementItems });

    // ClinIQ Flow section - Single Appointments page with all features
    const cliniqItems: NavItem[] = [];

    if (hasAppointments || isManager || isDoctor || isStaff) {
      cliniqItems.push({
        label: 'Appointments',
        href: '/hospital/appointments',
        icon: icons.appointments
      });
    }

    if (cliniqItems.length > 0) {
      sections.push({ title: 'ClinIQ Flow', items: cliniqItems });
    }

    // ClinIQ Brief section - Medical Reports
    const cliniqBriefItems: NavItem[] = [
      { label: 'Medical Reports', href: '/hospital/medical-reports', icon: icons.medicalReport },
    ];
    sections.push({ title: 'ClinIQ Brief', items: cliniqBriefItems });

    // ClinIQPay section - Payments (not shown for staff)
    if (!isStaff) {
      const cliniqPayItems: NavItem[] = [
        { label: 'Payments', href: '/hospital/payments', icon: icons.payments },
      ];
      sections.push({ title: 'ClinIQPay', items: cliniqPayItems });
    }

    return sections;
  }, [isManager, isDoctor, isStaff, hasAppointments]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const roleDisplayName = profile?.isSuperAdmin ? 'Super Admin' :
    currentHospital?.role === 'HOSPITAL_MANAGER' ? 'Hospital Manager' :
    currentHospital?.role === 'DOCTOR' ? 'Doctor' :
    currentHospital?.role === 'STAFF' ? 'Staff' : 'User';
  const hasMultipleHospitals = hospitals && hospitals.length > 1;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (mobileDropdownRef.current && !mobileDropdownRef.current.contains(e.target as Node)) {
        setMobileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'Management': true,
    'ClinIQ Flow': true,
    'ClinIQ Brief': true,
    'ClinIQPay': true,
  });
  const isActive = (href: string) => {
    if (href === '/hospital/dashboard') {
      return pathname === '/hospital' || pathname === '/hospital/dashboard';
    }
    return pathname?.startsWith(href);
  };

  const toggleSection = (title: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  const sidebarContent = (
    <>
      {/* Hospital Logo at Top */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <Link href="/hospital/dashboard" className="flex flex-col items-center gap-1.5">
          {currentHospital?.logoUrl ? (
            <img
              src={currentHospital.logoUrl}
              alt={currentHospital.name || 'Hospital'}
              className="w-14 h-14 rounded-xl object-contain bg-white border border-slate-200 p-1"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-[var(--color-primary)] flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-lg">
                {currentHospital?.name?.charAt(0) || 'H'}
              </span>
            </div>
          )}
          <span className="font-semibold text-slate-900 text-[11px] text-center leading-tight truncate max-w-full">{currentHospital?.name || 'Hospital'}</span>
        </Link>
      </div>

      {/* Navigation with Sections */}
      <nav className="admin-sidebar-nav">
        {navSections.map((section) => (
          <div key={section.title} className="admin-nav-section">
            <button
              onClick={() => toggleSection(section.title)}
              className="admin-nav-section-header w-full"
            >
              <span className="admin-nav-section-title">{section.title}</span>
              <svg
                className={`admin-nav-section-toggle ${expandedSections[section.title] ? 'open' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className={`admin-nav-section-items ${!expandedSections[section.title] ? 'collapsed' : ''}`}>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`admin-nav-item ${isActive(item.href) ? 'active' : ''}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Spacer to push content to bottom */}
      <div className="flex-1 min-h-4"></div>

      {/* ClinIQ Flow Branding at Bottom */}
      <div className="px-3 pb-3 flex-shrink-0">
        <div className="flex items-center justify-center gap-1.5 py-2 border-t border-slate-100">
          <div className="w-5 h-5 rounded-md bg-white border border-[var(--color-primary)] flex items-center justify-center">
            <svg className="w-3 h-3 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Powered by ClinIQ Flow</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Combined Header — branding + hospital + avatar in one bar */}
      <div className="admin-mobile-header lg:hidden">
        {/* Hamburger */}
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-lg hover:bg-slate-100 flex-shrink-0"
        >
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Hospital Logo + Name */}
        <Link href="/hospital/dashboard" className="flex items-center gap-2 min-w-0 flex-1 mx-2">
          {currentHospital?.logoUrl ? (
            <img
              src={currentHospital.logoUrl}
              alt={currentHospital.name || 'Hospital'}
              className="w-7 h-7 rounded-md object-contain flex-shrink-0"
            />
          ) : (
            <div className="w-7 h-7 rounded-md bg-[var(--color-primary)] flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">
                {currentHospital?.name?.charAt(0) || 'H'}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 leading-tight truncate">{currentHospital?.name || 'Hospital'}</p>
            <p className="text-[10px] text-slate-400 font-medium leading-tight">ClinIQ Flow</p>
          </div>
        </Link>

        {/* Avatar Dropdown */}
        <div className="relative flex-shrink-0" ref={mobileDropdownRef}>
          <button
            onClick={() => setMobileDropdownOpen(!mobileDropdownOpen)}
            className="flex items-center gap-1 p-1 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-semibold text-xs overflow-hidden" style={{ backgroundColor: '#1e3a5f' }}>
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                profile?.fullName?.charAt(0) || profile?.email?.charAt(0) || 'U'
              )}
            </div>
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {mobileDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-900">{profile?.fullName || 'User'}</p>
                <p className="text-xs text-slate-500 truncate">{profile?.email}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{roleDisplayName}</p>
              </div>
              <div className="py-1">
                {hasMultipleHospitals && (
                  <button
                    onClick={() => {
                      setMobileDropdownOpen(false);
                      setCurrentHospitalId(null);
                      router.push('/select-hospital');
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors w-full text-left"
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
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    onClick={() => setMobileDropdownOpen(false)}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Admin Console
                  </Link>
                )}
                <button
                  onClick={() => {
                    setMobileDropdownOpen(false);
                    signOut();
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors w-full text-left"
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

      {/* Mobile sidebar overlay — always rendered, animated opacity */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300 ${
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMobileOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`admin-sidebar ${mobileOpen ? 'open' : ''}`}>
        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-1 rounded hover:bg-slate-100 lg:hidden"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {sidebarContent}
      </aside>
    </>
  );
}
