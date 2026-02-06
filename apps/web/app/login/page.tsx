'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import { getSupabaseClient } from '../../lib/supabase';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const router = useRouter();
  const { signIn, user, profile, hospitals, currentHospitalId, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');
  const idleLogout = reason === 'idle';
  const expiredSession = reason === 'expired';
  const redirectPath = searchParams.get('redirect');

  useEffect(() => {
    // Wait for auth to finish loading before redirecting
    if (authLoading) return;

    if (user) {
      // If a redirect path was provided (e.g. from middleware), go there
      if (redirectPath && redirectPath.startsWith('/')) {
        router.push(redirectPath);
        return;
      }

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
  }, [user, profile?.isSuperAdmin, hospitals, currentHospitalId, router, authLoading, redirectPath]);

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

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetError(null);
    setResetLoading(true);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setResetError('Password reset is not available.');
        return;
      }
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetErr) {
        setResetError(resetErr.message);
      } else {
        setResetSent(true);
      }
    } catch {
      setResetError('Something went wrong. Please try again.');
    } finally {
      setResetLoading(false);
    }
  }

  // Once authenticated, show spinner while redirect completes — prevents flash of login form
  if (user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-slate-200 border-t-[var(--color-primary)] rounded-full animate-spin" />
        <p className="mt-3 text-sm text-slate-500">Signing you in...</p>
      </div>
    );
  }

  if (forgotMode) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 sm:px-6">
        <div className="w-full max-w-md">
          <div className="card p-5 sm:p-8">
            <div className="text-center mb-5 sm:mb-6">
              <h1 className="page-title text-xl sm:text-2xl">Reset Password</h1>
              <p className="text-gray-500 mt-1 text-sm">
                {resetSent
                  ? 'Check your email for a reset link'
                  : 'Enter your email to receive a password reset link'}
              </p>
            </div>

            {resetSent ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 text-green-700 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm">
                  We&apos;ve sent a password reset link to <strong>{email}</strong>. Please check your inbox and spam folder.
                </div>
                <button
                  type="button"
                  onClick={() => { setForgotMode(false); setResetSent(false); setResetError(null); }}
                  className="btn-primary w-full"
                >
                  Back to Sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
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

                {resetError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm">
                    {resetError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="btn-primary w-full"
                >
                  {resetLoading ? 'Sending...' : 'Send Reset Link'}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setForgotMode(false); setResetError(null); }}
                    className="text-sm text-[var(--color-primary)] hover:underline"
                  >
                    Back to Sign in
                  </button>
                </div>
              </form>
            )}

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
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="Your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.7 11.7 0 013.168-4.477M6.343 6.343A9.972 9.972 0 0112 5c5 0 9.27 3.11 11 7.5a11.7 11.7 0 01-4.373 5.157M6.343 6.343L3 3m3.343 3.343l2.829 2.829m4.243 4.243l2.829 2.829M3 3l18 18m-9-6.5a2.5 2.5 0 01-2.5-2.5" /></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
            </div>

            {idleLogout && !error && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm">
                Your session expired due to inactivity. Please sign in again.
              </div>
            )}

            {expiredSession && !error && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm">
                Your session has expired. Please sign in again.
              </div>
            )}

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

            <div className="text-center">
              <button
                type="button"
                onClick={() => { setForgotMode(true); setError(null); }}
                className="text-sm text-[var(--color-primary)] hover:underline"
              >
                Forgot password?
              </button>
            </div>
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

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-slate-200 border-t-[var(--color-primary)] rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
