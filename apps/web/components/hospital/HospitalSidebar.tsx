'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '../AuthProvider';
import { useOptimisticPathname } from '../../lib/hooks/useOptimisticPathname';
import { usePrefetchRoute } from '../../lib/hooks/usePrefetchRoute';

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
};

export function HospitalSidebar() {
  const { pathname, handleNavClick } = useOptimisticPathname();
  const prefetchRoute = usePrefetchRoute();
  const { currentHospital, profile, canAccessProduct } = useAuth();

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

    // Hospital Details - only for managers
    if (isManager) {
      managementItems.push({
        label: 'Hospital',
        href: '/hospital/details',
        icon: icons.hospital
      });
    }

    // Doctors - managers see list, doctors see "My Profile"
    if (isManager) {
      managementItems.push({
        label: 'Doctors',
        href: '/hospital/doctors',
        icon: icons.doctors
      });
    } else if (isDoctor) {
      managementItems.push({
        label: 'My Profile',
        href: '/hospital/profile',
        icon: icons.profile
      });
    }

    // Patients - visible to all
    managementItems.push({
      label: 'Patients',
      href: '/hospital/patients',
      icon: icons.patients
    });

    // Staff - only for managers
    if (isManager) {
      managementItems.push({
        label: 'Staff',
        href: '/hospital/staff',
        icon: icons.staff
      });
    }

    sections.push({ title: 'Management', items: managementItems });

    // ClinIQ Flow section - Appointments & Daily Queue
    const cliniqItems: NavItem[] = [];

    if (hasAppointments || isManager || isDoctor) {
      cliniqItems.push({
        label: isDoctor ? 'My Appointments' : 'Appointments',
        href: '/hospital/appointments',
        icon: icons.appointments
      });
    }

    cliniqItems.push({
      label: 'Daily Queue',
      href: '/hospital/queue',
      icon: icons.queue
    });

    if (cliniqItems.length > 0) {
      sections.push({ title: 'ClinIQ Flow', items: cliniqItems });
    }

    // Administration section - only for managers
    if (isManager) {
      sections.push({
        title: 'Administration',
        items: [
          { label: 'Billing', href: '/hospital/billing', icon: icons.billing },
          { label: 'Settings', href: '/hospital/settings', icon: icons.settings },
        ],
      });
    }

    return sections;
  }, [isManager, isDoctor, isStaff, hasAppointments]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'Management': true,
    'ClinIQ Flow': true,
    'Administration': true,
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
      {/* Hospital Logo/Icon at Top */}
      <div className="admin-sidebar-header">
        <Link href="/hospital/dashboard" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] flex items-center justify-center shadow-md">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-bold text-slate-900 text-sm block truncate">{currentHospital?.name || 'Hospital'}</span>
            <span className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">Hospital Portal</span>
          </div>
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
                  onMouseEnter={() => prefetchRoute(item.href)}
                  onClick={() => { handleNavClick(item.href); setMobileOpen(false); }}
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

      {/* Decorative Plant Image */}
      <div className="px-4 flex justify-center flex-shrink-0">
        <Image
          src="/images/sidebar/plant.webp"
          alt=""
          width={140}
          height={140}
          className="object-contain opacity-90"
          priority={false}
        />
      </div>

      {/* ClinIQ Logo at Bottom */}
      <div className="admin-sidebar-footer flex-shrink-0">
        <div className="px-3 py-3 border-t border-slate-100">
          <div className="flex items-center justify-center gap-1.5">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <span className="text-[10px] font-semibold text-[var(--color-primary)]">ClinIQ</span>
            <span className="text-[9px] text-slate-400">v1.0</span>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile header */}
      <div className="admin-mobile-header lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-md hover:bg-slate-100"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/hospital/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <span className="font-semibold text-slate-900 text-sm truncate max-w-[150px]">
            {currentHospital?.name || 'Hospital'}
          </span>
        </Link>
        <div className="w-8" />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

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
