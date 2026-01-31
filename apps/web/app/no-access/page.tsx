'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';

export default function NoAccessPage() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="card p-6 sm:p-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>

          <h1 className="text-xl font-semibold text-slate-900 mb-2">No Access</h1>
          <p className="text-sm text-slate-500 mb-6">
            {user
              ? 'Your account does not have access to any hospital. Please contact your hospital administrator to request access.'
              : 'You need to sign in to access this page.'}
          </p>

          <div className="flex flex-col gap-2">
            {user ? (
              <>
                {profile?.isSuperAdmin && (
                  <button
                    onClick={() => router.push('/admin/dashboard')}
                    className="btn-primary w-full"
                  >
                    Go to Admin Console
                  </button>
                )}
                <button
                  onClick={() => signOut().then(() => router.push('/login'))}
                  className="btn-secondary w-full"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={() => router.push('/login')}
                className="btn-primary w-full"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
