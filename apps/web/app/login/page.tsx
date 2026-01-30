'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { signIn, user, profile, hospitals, currentHospitalId, loading: authLoading } = useAuth();

  useEffect(() => {
    // Wait for auth to finish loading before redirecting
    if (authLoading) return;

    if (user) {
      // Super admins go directly to admin console
      if (profile?.isSuperAdmin) {
        router.push('/admin/dashboard');
        return;
      }

      // User has a hospital selected - route based on role
      if (currentHospitalId) {
        const currentHospital = hospitals.find(h => h.id === currentHospitalId);
        if (currentHospital?.role === 'DOCTOR') {
          router.push('/doctor/dashboard');
        } else {
          router.push('/hospital/dashboard');
        }
      } else if (hospitals.length === 1) {
        // Single hospital — AuthProvider auto-selects, route directly
        if (hospitals[0].role === 'DOCTOR') {
          router.push('/doctor/dashboard');
        } else {
          router.push('/hospital/dashboard');
        }
      } else if (hospitals.length > 1) {
        // Multiple hospitals — must pick one
        router.push('/select-hospital');
      }
      // hospitals.length === 0: wait for hospitals to load from AuthProvider
    }
  }, [user, profile?.isSuperAdmin, hospitals, currentHospitalId, router, authLoading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: signInError } = await signIn(email, password);

      if (signInError) {
        setError(signInError.message || 'Invalid credentials');
      }
      // Navigation happens via useEffect when user state updates
    } catch (err) {
      console.error(err);
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 sm:px-6">
      <div className="w-full max-w-md">
        <div className="card p-5 sm:p-8">
          <div className="text-center mb-5 sm:mb-6">
            <h1 className="page-title text-xl sm:text-2xl">Sign in to ClinQflow</h1>
            <p className="text-gray-500 mt-1 text-sm">Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="Your password"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-5 sm:mt-6 pt-5 sm:pt-6 border-t border-gray-100">
            <p className="text-center text-xs text-gray-400">
              Powered by Supabase Auth
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
