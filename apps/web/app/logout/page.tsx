'use client';

import { useEffect } from 'react';

export default function LogoutPage() {
  useEffect(() => {
    // Clear all storage immediately
    localStorage.clear();
    sessionStorage.clear();
    // Delete cookies
    document.cookie.split(';').forEach((c) => {
      document.cookie = c
        .replace(/^ +/, '')
        .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });
    // Hard redirect
    window.location.href = '/login';
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Signing out...</p>
    </div>
  );
}
