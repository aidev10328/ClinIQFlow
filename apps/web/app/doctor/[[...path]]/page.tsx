'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

/**
 * Redirect all /doctor/* routes to /hospital/*
 * The hospital portal is now unified and role-aware via RBAC
 */
export default function DoctorRedirect() {
  const router = useRouter();
  const params = useParams();
  const path = params.path as string[] | undefined;

  useEffect(() => {
    // Build the target path
    const targetPath = path && path.length > 0
      ? `/hospital/${path.join('/')}`
      : '/hospital/dashboard';

    // Handle special redirects
    let redirectTo = targetPath;

    // Doctor's profile page should go to /hospital/doctors/me
    if (targetPath === '/hospital/profile') {
      redirectTo = '/hospital/doctors/me';
    }

    router.replace(redirectTo);
  }, [router, path]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Redirecting...</p>
      </div>
    </div>
  );
}
