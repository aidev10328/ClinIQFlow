'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { useRouter, usePathname } from 'next/navigation';
import { getTimezoneLabel, getCurrencySymbol, formatTimeInTimezone } from '../lib/timezone';

export default function Nav() {
  const { user, profile, hospitals, currentHospitalId, setCurrentHospitalId, signOut, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');

  // Find current hospital (must be before useEffect)
  const currentHospital = hospitals.find(h => h.id === currentHospitalId);

  // Update time display every minute
  useEffect(() => {
    if (!currentHospital?.timezone) return;

    const updateTime = () => {
      setCurrentTime(formatTimeInTimezone(new Date(), currentHospital.timezone));
    };

    updateTime();
    const interval = setInterval(updateTime, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [currentHospital?.timezone]);

  // Hide Nav on pages that have their own layout (login, hospital portal, admin console)
  const hideNav = pathname === '/login' || pathname.startsWith('/hospital') || pathname.startsWith('/admin') || pathname.startsWith('/doctor');
  if (hideNav) return null;

  async function handleLogout() {
    await signOut();
    router.push('/login');
    setMobileMenuOpen(false);
  }

  function handleSwitchHospital() {
    // Clear current hospital and go to selector
    setCurrentHospitalId(null);
    router.push('/select-hospital');
    setMobileMenuOpen(false);
  }

  return (
    <nav className="navbar">
      <div className="container !py-0">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="text-xl font-heading font-bold text-primary-600">
            ClinQflow
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {user && (
              <div className="flex items-center gap-4">
                <Link href="/dashboard" className="nav-link">
                  Dashboard
                </Link>
                {/* Super Admin Link */}
                {profile?.isSuperAdmin && (
                  <Link href="/admin/dashboard" className="nav-link text-purple-600 font-medium">
                    Admin Console
                  </Link>
                )}
                {/* Hospital Manager Links */}
                {currentHospitalId && (currentHospital?.role === 'HOSPITAL_MANAGER' || profile?.isSuperAdmin) && (
                  <>
                    <Link href="/hospital/dashboard" className="nav-link text-blue-600 font-medium">
                      Manage Hospital
                    </Link>
                  </>
                )}
                {/* Current Hospital Indicator with Timezone */}
                {currentHospital && (
                  <div className="flex items-center gap-3">
                    {/* Timezone & Time Display */}
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-md text-xs">
                      <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-gray-600 font-medium">{currentTime}</span>
                      <span className="text-gray-400">{getTimezoneLabel(currentHospital.timezone)}</span>
                      <span className="text-gray-300">|</span>
                      <span className="text-gray-500">{getCurrencySymbol(currentHospital.currency)}</span>
                    </div>
                    {/* Hospital Switch Button */}
                    {hospitals.length > 1 && (
                      <button
                        onClick={handleSwitchHospital}
                        className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
                      >
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        {currentHospital.name}
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-4">
              {loading ? (
                <span className="text-sm text-gray-400">...</span>
              ) : user ? (
                <>
                  <span className="text-sm text-gray-600 hidden lg:inline">
                    {profile?.fullName || profile?.email}
                    {profile?.isSuperAdmin && (
                      <span className="ml-1 text-xs text-purple-600">(Admin)</span>
                    )}
                  </span>
                  <button onClick={handleLogout} className="nav-link">
                    Sign out
                  </button>
                </>
              ) : (
                <Link href="/login" className="btn-primary text-sm">
                  Sign in
                </Link>
              )}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-md hover:bg-gray-100 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 py-4 space-y-3">
            {user && (
              <>
                <Link
                  href="/dashboard"
                  className="block py-2 px-3 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Dashboard
                </Link>
                {/* Admin Console for Super Admins */}
                {profile?.isSuperAdmin && (
                  <Link
                    href="/admin/dashboard"
                    className="block py-2 px-3 rounded-md text-purple-600 font-medium hover:bg-purple-50 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Admin Console
                  </Link>
                )}
                {/* Hospital Management for Managers */}
                {currentHospitalId && (currentHospital?.role === 'HOSPITAL_MANAGER' || profile?.isSuperAdmin) && (
                  <Link
                    href="/hospital/dashboard"
                    className="block py-2 px-3 rounded-md text-blue-600 font-medium hover:bg-blue-50 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Manage Hospital
                  </Link>
                )}
                {/* Timezone Display - Mobile */}
                {currentHospital && (
                  <div className="py-2 px-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium text-gray-700">{currentTime}</span>
                      <span>{getTimezoneLabel(currentHospital.timezone)}</span>
                      <span className="text-gray-300">|</span>
                      <span>{getCurrencySymbol(currentHospital.currency)}</span>
                    </div>
                  </div>
                )}
                {/* Current Hospital with Switch */}
                {currentHospital && hospitals.length > 1 && (
                  <button
                    onClick={handleSwitchHospital}
                    className="block w-full text-left py-2 px-3 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      {currentHospital.name}
                      <span className="text-xs text-gray-400">(Switch)</span>
                    </span>
                  </button>
                )}
              </>
            )}

            <div className="pt-3 border-t border-gray-100">
              {loading ? (
                <span className="text-sm text-gray-400 px-3">...</span>
              ) : user ? (
                <div className="space-y-2">
                  <div className="px-3 py-2 text-sm text-gray-600">
                    {profile?.fullName || profile?.email}
                    {profile?.isSuperAdmin && (
                      <span className="ml-1 text-xs text-purple-600">(Admin)</span>
                    )}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left py-2 px-3 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="block py-2 px-3 btn-primary text-center"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
