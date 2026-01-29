'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import { apiFetch } from '../../../lib/api';
import { getSupabaseClient } from '../../../lib/supabase';

interface InviteDetails {
  valid: boolean;
  hospitalName?: string;
  invitedEmail?: string;
  role?: string;
  expiresAt?: string;
  error?: string;
}

// Wrapper component with Suspense boundary for useSearchParams
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { user, loading: authLoading } = useAuth();

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [step, setStep] = useState<'loading' | 'login' | 'signup' | 'accept'>('loading');
  const autoAcceptAttempted = useRef(false);

  // Signup form
  const [signupForm, setSignupForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
  });

  // Login form
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  });

  const [formError, setFormError] = useState<string | null>(null);
  const supabaseAuthHandled = useRef(false);

  // Handle Supabase auth callback (when user clicks invite email link and sets password)
  useEffect(() => {
    if (supabaseAuthHandled.current) return;
    supabaseAuthHandled.current = true;

    async function handleSupabaseCallback() {
      const supabase = getSupabaseClient();

      // Check if this is a Supabase auth callback (has hash params like #access_token=...)
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        console.log('[InviteAccept] Detected Supabase auth callback with access_token');

        // Exchange the hash params for a session
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error('[InviteAccept] Failed to set session:', error.message);
          } else if (data.session) {
            console.log('[InviteAccept] Session set successfully:', data.session.user?.email);
            // Clear the hash from URL
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        }
      } else {
        // No hash params, check if there's an existing session
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          console.log('[InviteAccept] Found existing session:', data.session.user?.email);
        }
      }
    }

    handleSupabaseCallback();
  }, []);

  useEffect(() => {
    if (!token) {
      setError('No invite token provided');
      setLoading(false);
      return;
    }
    lookupInvite();
  }, [token]);

  useEffect(() => {
    if (!authLoading && invite) {
      if (user) {
        // User is logged in - check if email matches invite
        if (user.email?.toLowerCase() === invite.invitedEmail?.toLowerCase()) {
          // Auto-accept if email matches and we haven't tried yet
          if (!autoAcceptAttempted.current && !accepting) {
            autoAcceptAttempted.current = true;
            handleAutoAccept();
          }
        } else {
          setStep('accept'); // Let them see the mismatch warning
        }
      } else {
        // User is not logged in - show signup form to set password
        // This is for new users accepting an invite for the first time
        setStep('signup');
      }
    }
  }, [user, authLoading, invite]);

  async function handleAutoAccept() {
    if (!token) return;
    setStep('accept');
    setAccepting(true);
    setFormError(null);

    try {
      const res = await apiFetch('/v1/invites/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });

      if (res.ok) {
        router.push('/dashboard');
      } else {
        const err = await res.json();
        setFormError(err.message || 'Failed to accept invite');
        setAccepting(false);
      }
    } catch (err) {
      setFormError('Failed to accept invite');
      setAccepting(false);
    }
  }

  async function lookupInvite() {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/invites/lookup?token=${token}`
      );

      if (res.ok) {
        const data = await res.json();
        if (data.valid === false) {
          setError(data.error || 'Invalid or expired invite');
        } else {
          setInvite(data);
          setSignupForm((prev) => ({ ...prev, email: data.invitedEmail || '' }));
          setLoginForm((prev) => ({ ...prev, email: data.invitedEmail || '' }));
        }
      } else {
        const err = await res.json();
        setError(err.error || err.message || 'Invalid or expired invite');
      }
    } catch (err) {
      setError('Failed to load invite details');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setAccepting(true);

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password,
      });

      if (error) {
        setFormError(error.message);
        setAccepting(false);
        return;
      }

      // If login successful, auto-accept the invite
      if (data.session) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await acceptInviteAfterAuth();
      }
    } catch (err) {
      setFormError('Login failed');
      setAccepting(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (signupForm.password !== signupForm.confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    if (signupForm.password.length < 6) {
      setFormError('Password must be at least 6 characters');
      return;
    }

    setAccepting(true);

    try {
      // Use backend endpoint that creates user with admin API (auto-confirmed, no email verification)
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4005';
      const res = await fetch(`${API_BASE}/v1/invites/signup-and-accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email: signupForm.email,
          password: signupForm.password,
          displayName: `${signupForm.firstName} ${signupForm.lastName}`.trim() || signupForm.email.split('@')[0],
        }),
      });

      const data = await res.json();

      if (!data.success) {
        // If user already exists (from Supabase invite email), switch to login
        if (data.error?.includes('already registered') || data.error?.includes('already exists')) {
          setFormError('Account already exists. Please sign in with your password.');
          setStep('login');
          setLoginForm({ email: signupForm.email, password: '' });
        } else {
          setFormError(data.error || 'Signup failed');
        }
        setAccepting(false);
        return;
      }

      // If we got a session, set it in Supabase client and redirect
      if (data.session) {
        const supabase = getSupabaseClient();
        await supabase.auth.setSession(data.session);
        router.push('/dashboard');
      } else {
        // Account created but no session - redirect to login
        router.push('/login?message=Account created. Please sign in.');
      }
    } catch (err) {
      setFormError('Signup failed');
      setAccepting(false);
    }
  }

  async function acceptInviteAfterAuth() {
    if (!token) return;

    try {
      const res = await apiFetch('/v1/invites/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });

      if (res.ok) {
        router.push('/dashboard');
      } else {
        const err = await res.json();
        setFormError(err.message || 'Failed to accept invite');
        setAccepting(false);
      }
    } catch (err) {
      setFormError('Failed to accept invite');
      setAccepting(false);
    }
  }

  async function handleAcceptInvite() {
    if (!token) return;
    setAccepting(true);
    setFormError(null);

    try {
      const res = await apiFetch('/v1/invites/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });

      if (res.ok) {
        // Redirect to dashboard with the new hospital
        router.push('/dashboard');
      } else {
        const err = await res.json();
        setFormError(err.message || 'Failed to accept invite');
      }
    } catch (err) {
      setFormError('Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading invite details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <h1 className="text-lg font-semibold text-red-800 mb-2">Invalid Invite</h1>
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <button onClick={() => router.push('/login')} className="btn-primary">
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!invite) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="max-w-md w-full">
        {/* Invite Card */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="text-center mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">You&apos;re Invited!</h1>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-600 mb-1">Hospital</p>
            <p className="font-medium text-gray-900">{invite.hospitalName || 'Unknown'}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Role</p>
              <p className="font-medium text-gray-900 capitalize">
                {invite.role?.replace('_', ' ') || 'Unknown'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Invited Email</p>
              <p className="font-medium text-gray-900 text-sm truncate">{invite.invitedEmail || ''}</p>
            </div>
          </div>

          {invite.expiresAt && (
            <p className="text-xs text-gray-500 text-center">
              This invite expires on {new Date(invite.expiresAt).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Action Card */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          {step === 'accept' && user && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Logged in as</p>
                <p className="font-medium text-gray-900">{user.email}</p>
              </div>

              {/* Email mismatch warning */}
              {user.email?.toLowerCase() !== invite.invitedEmail?.toLowerCase() && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                  <p className="text-sm text-yellow-800 font-medium mb-2">Email Mismatch</p>
                  <p className="text-sm text-yellow-700">
                    This invite was sent to <strong>{invite.invitedEmail}</strong>, but you are logged in as <strong>{user.email}</strong>.
                  </p>
                  <p className="text-sm text-yellow-700 mt-2">
                    Please sign out and log in with the correct email address.
                  </p>
                </div>
              )}

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
                  {formError}
                </div>
              )}

              {/* Only show accept button if emails match */}
              {user.email?.toLowerCase() === invite.invitedEmail?.toLowerCase() && (
                <button
                  onClick={handleAcceptInvite}
                  disabled={accepting}
                  className="btn-primary w-full"
                >
                  {accepting ? 'Accepting...' : 'Accept Invite & Join Hospital'}
                </button>
              )}

              <button
                onClick={async () => {
                  await getSupabaseClient().auth.signOut();
                  setStep('signup');
                  autoAcceptAttempted.current = false;
                }}
                className="text-sm text-gray-500 hover:text-gray-700 w-full text-center"
              >
                {user.email?.toLowerCase() !== invite.invitedEmail?.toLowerCase()
                  ? 'Sign out and use correct account'
                  : 'Use a different account'}
              </button>
            </div>
          )}

          {step === 'login' && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="font-medium text-gray-900">Sign in to accept</h2>
                <p className="text-sm text-gray-500">
                  Enter your password to accept this invitation
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={loginForm.email}
                    className="input-field bg-gray-50"
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    className="input-field"
                    placeholder="Enter your password"
                    required
                  />
                </div>

                {formError && (
                  <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
                    {formError}
                  </div>
                )}

                <button type="submit" disabled={accepting} className="btn-primary w-full">
                  {accepting ? 'Signing in...' : 'Sign In & Accept'}
                </button>
              </form>

              <p className="text-xs text-gray-500 text-center">
                Don&apos;t have an account?{' '}
                <button
                  onClick={() => setStep('signup')}
                  className="text-blue-600 hover:text-blue-700"
                >
                  Set up your account
                </button>
              </p>
            </div>
          )}

          {step === 'signup' && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="font-medium text-gray-900">Set up your account</h2>
                <p className="text-sm text-gray-500">
                  Create a password to accept this invitation
                </p>
              </div>

              <form onSubmit={handleSignup} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={signupForm.firstName}
                      onChange={(e) => setSignupForm({ ...signupForm, firstName: e.target.value })}
                      className="input-field"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={signupForm.lastName}
                      onChange={(e) => setSignupForm({ ...signupForm, lastName: e.target.value })}
                      className="input-field"
                      placeholder="Smith"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={signupForm.email}
                    className="input-field bg-gray-50"
                    disabled
                  />
                  <p className="text-xs text-gray-500 mt-1">This email was used for the invitation</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Set Password
                  </label>
                  <input
                    type="password"
                    value={signupForm.password}
                    onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                    className="input-field"
                    placeholder="Minimum 6 characters"
                    required
                    minLength={6}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={signupForm.confirmPassword}
                    onChange={(e) =>
                      setSignupForm({ ...signupForm, confirmPassword: e.target.value })
                    }
                    className="input-field"
                    placeholder="Re-enter your password"
                    required
                  />
                </div>

                {formError && (
                  <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
                    {formError}
                  </div>
                )}

                <button type="submit" disabled={accepting} className="btn-primary w-full">
                  {accepting ? 'Setting up...' : 'Accept Invitation'}
                </button>
              </form>

              <p className="text-xs text-gray-500 text-center">
                Already have an account?{' '}
                <button
                  onClick={() => setStep('login')}
                  className="text-blue-600 hover:text-blue-700"
                >
                  Sign in instead
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
