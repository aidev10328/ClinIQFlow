'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';
import { getSupabaseClient } from '../lib/supabase';
// apiFetch not needed here - we fetch profile directly with token

export type Hospital = {
  id: string;
  name: string;
  city?: string;
  state?: string;
  country: string;
  region: string;
  currency: string;
  timezone: string;
  role: string;
  isPrimary: boolean;
};

export type UserProfile = {
  id: string;
  email: string;
  fullName?: string;
  phone?: string;
  isSuperAdmin: boolean;
};

export type ProductEntitlement = {
  code: string;
  name: string;
  hasAccess: boolean;
  licenseId: string | null;
  expiresAt: string | null;
};

export type UserEntitlements = {
  hospitalId: string;
  hospitalName: string;
  products: ProductEntitlement[];
};

type LegalStatus = 'unknown' | 'checking' | 'pending' | 'complete';

type AuthContextShape = {
  user: User | null;
  profile: UserProfile | null;
  hospitals: Hospital[];
  currentHospitalId: string | null;
  currentHospital: Hospital | null;
  entitlements: UserEntitlements | null;
  session: Session | null;
  loading: boolean;
  legalStatus: LegalStatus;
  setCurrentHospitalId: (id: string) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  canAccessProduct: (productCode: string) => boolean;
};

const AuthContext = createContext<AuthContextShape | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [currentHospitalId, setCurrentHospitalIdState] = useState<string | null>(null);
  const [entitlements, setEntitlements] = useState<UserEntitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [legalStatus, setLegalStatus] = useState<LegalStatus>('unknown');

  const supabase = getSupabaseClient();

  // Computed: current hospital object
  const currentHospital = currentHospitalId
    ? hospitals.find((h) => h.id === currentHospitalId) || null
    : null;

  // Helper to check product access
  function canAccessProduct(productCode: string): boolean {
    // Super admins have access to everything
    if (profile?.isSuperAdmin) return true;
    // Check entitlements
    if (!entitlements) return false;
    const product = entitlements.products.find((p) => p.code === productCode);
    return product?.hasAccess || false;
  }

  // Fetch user profile and hospitals from API with timeout
  // Takes optional accessToken to avoid race conditions with getSession()
  async function fetchProfile(accessToken?: string) {
    try {
      console.log('[AuthProvider] Fetching profile...');

      // If no token provided, try to get it from the session
      let token = accessToken;
      if (!token) {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        token = currentSession?.access_token;
        console.log('[AuthProvider] Got token from getSession:', !!token);
      }

      if (!token) {
        console.warn('[AuthProvider] No access token available');
        setProfile(null);
        setHospitals([]);
        return null;
      }

      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${API_BASE}/v1/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      console.log('[AuthProvider] /v1/me response status:', res.status);

      if (res.ok) {
        const data = await res.json();
        console.log('[AuthProvider] Profile fetched:', {
          email: data.user?.email,
          isSuperAdmin: data.user?.isSuperAdmin,
          hospitalsCount: data.hospitals?.length,
          hasEntitlements: !!data.entitlements,
        });
        setProfile(data.user);
        setHospitals(data.hospitals || []);
        setEntitlements(data.entitlements || null);
        return data;
      } else {
        const errorText = await res.text();
        console.warn('[AuthProvider] Profile fetch failed:', res.status, errorText);
      }
    } catch (e: any) {
      console.error('[AuthProvider] Failed to fetch profile:', e.message);
    }
    setProfile(null);
    setHospitals([]);
    setEntitlements(null);
    return null;
  }

  // Set current hospital ID and persist to localStorage
  function setCurrentHospitalId(id: string) {
    setCurrentHospitalIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('clinqflow_hospital_id', id);
    }
  }

  const router = useRouter();
  const pathname = usePathname();

  // Check for pending legal requirements when hospital is selected
  useEffect(() => {
    // Skip if still loading auth
    if (loading || !session?.access_token) {
      setLegalStatus('unknown');
      return;
    }

    // Super admins don't have legal requirements - check BEFORE hospital check
    if (profile?.isSuperAdmin) {
      setLegalStatus('complete');
      return;
    }

    // Regular users need a hospital selected
    if (!currentHospitalId) {
      setLegalStatus('unknown');
      return;
    }

    // Already on legal page - don't redirect in a loop
    if (pathname?.startsWith('/legal')) {
      return;
    }

    async function checkLegalRequirements() {
      if (!currentHospitalId) return; // TypeScript guard

      setLegalStatus('checking');

      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
        const res = await fetch(`${API_BASE}/v1/legal/requirements?hospitalId=${currentHospitalId}`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
            'x-hospital-id': currentHospitalId,
          },
        });

        if (res.ok) {
          const requirements = await res.json();
          // Check if any requirements are pending
          const hasPending = requirements.some((r: any) => r.status === 'PENDING');
          if (hasPending) {
            console.log('[AuthProvider] User has pending legal requirements, redirecting...');
            setLegalStatus('pending');
            router.replace('/legal/accept');
          } else {
            setLegalStatus('complete');
          }
        } else {
          // If we can't check, assume complete to avoid blocking
          setLegalStatus('complete');
        }
      } catch (e: any) {
        console.error('[AuthProvider] Error checking legal requirements:', e.message);
        // On error, assume complete to avoid blocking
        setLegalStatus('complete');
      }
    }

    checkLegalRequirements();
  }, [currentHospitalId, session?.access_token, loading, pathname, profile?.isSuperAdmin, router]);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    async function initAuth() {
      try {
        console.log('[AuthProvider] Initializing auth...');

        // Get initial session with timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Session fetch timeout')), 10000);
        });

        const sessionPromise = supabase.auth.getSession();

        let initialSession = null;
        let error = null;

        try {
          const result = await Promise.race([sessionPromise, timeoutPromise]);
          initialSession = result.data?.session;
          error = result.error;
        } catch (timeoutErr: any) {
          // Handle AbortError gracefully - this happens during hot reload
          if (timeoutErr?.name === 'AbortError' || timeoutErr?.message?.includes('aborted')) {
            console.warn('[AuthProvider] Session fetch aborted');
            return; // Exit early, will retry on next mount
          }
          console.warn('[AuthProvider] Session fetch timed out:', timeoutErr.message);
          // Continue without session - user will need to log in
        }

        if (error) {
          // Handle AbortError gracefully
          if (error.name === 'AbortError' || error.message?.includes('aborted')) {
            console.warn('[AuthProvider] Session fetch aborted, will retry on auth change');
            return; // Exit early
          } else {
            console.error('[AuthProvider] Session fetch error:', error);
          }
        }

        if (!mounted) return;

        // Check if session is expired
        if (initialSession?.expires_at) {
          const expiresAt = new Date(initialSession.expires_at * 1000);
          const now = new Date();
          if (expiresAt < now) {
            console.log('[AuthProvider] Session expired at', expiresAt, 'clearing...');
            await supabase.auth.signOut();
            initialSession = null;
            if (typeof window !== 'undefined') {
              localStorage.removeItem('clinqflow_hospital_id');
            }
          }
        }

        if (initialSession) {
          console.log('[AuthProvider] Found existing session for:', initialSession.user?.email);
          setSession(initialSession);
          setUser(initialSession.user);
          const profileData = await fetchProfile(initialSession.access_token);

          // Restore hospital ID from localStorage, but validate it belongs to this user
          if (typeof window !== 'undefined' && profileData?.hospitals) {
            const savedHospitalId = localStorage.getItem('clinqflow_hospital_id');
            if (savedHospitalId) {
              // Check if the saved hospital ID is valid for this user
              const isValidHospital = profileData.hospitals.some(
                (h: Hospital) => h.id === savedHospitalId
              );
              if (isValidHospital) {
                console.log('[AuthProvider] Restored valid hospital ID:', savedHospitalId);
                setCurrentHospitalIdState(savedHospitalId);
              } else {
                console.log('[AuthProvider] Saved hospital ID not valid for this user, clearing');
                localStorage.removeItem('clinqflow_hospital_id');
              }
            }
          }
        } else {
          console.log('[AuthProvider] No existing session found');
          // Clear any stale localStorage data
          if (typeof window !== 'undefined') {
            localStorage.removeItem('clinqflow_hospital_id');
          }
        }
        // Success - set loading=false
        console.log('[AuthProvider] Auth init complete, setting loading=false');
        if (mounted) setLoading(false);
      } catch (e: any) {
        // Handle AbortError gracefully - this happens during hot reload or unmount
        if (e?.name === 'AbortError' || e?.message?.includes('aborted') || e?.message?.includes('signal')) {
          console.warn('[AuthProvider] Auth init aborted, will retry on next mount');
          return; // Don't set loading=false, will retry on next mount
        }
        console.error('[AuthProvider] Auth init error:', e);
        // Only set loading=false on actual errors, not on abort
        if (mounted) setLoading(false);
      }
    }

    initAuth();

    // Listen for auth changes
    try {
      const { data } = supabase.auth.onAuthStateChange(
        async (event: AuthChangeEvent, newSession: Session | null) => {
          if (!mounted) return;

          console.log('[AuthProvider] Auth state changed:', event, newSession?.user?.email);

          const previousUserId = user?.id;
          setSession(newSession);
          setUser(newSession?.user || null);

          if (newSession) {
            const profileData = await fetchProfile(newSession.access_token);

            // If user changed (different account), clear and re-validate hospital ID
            if (previousUserId && previousUserId !== newSession.user?.id) {
              console.log('[AuthProvider] User changed, clearing hospital selection');
              setCurrentHospitalIdState(null);
              if (typeof window !== 'undefined') {
                localStorage.removeItem('clinqflow_hospital_id');
              }
            } else if (profileData?.hospitals && typeof window !== 'undefined') {
              // Re-validate saved hospital ID for current user
              const savedHospitalId = localStorage.getItem('clinqflow_hospital_id');
              if (savedHospitalId) {
                const isValidHospital = profileData.hospitals.some(
                  (h: Hospital) => h.id === savedHospitalId
                );
                if (!isValidHospital) {
                  console.log('[AuthProvider] Saved hospital no longer valid, clearing');
                  setCurrentHospitalIdState(null);
                  localStorage.removeItem('clinqflow_hospital_id');
                }
              }
            }
          } else {
            setProfile(null);
            setHospitals([]);
            setEntitlements(null);
            setCurrentHospitalIdState(null);
            setLegalStatus('unknown');
            if (typeof window !== 'undefined') {
              localStorage.removeItem('clinqflow_hospital_id');
            }
          }
        }
      );
      subscription = data.subscription;
    } catch (e) {
      console.error('Failed to set up auth listener:', e);
    }

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    try {
      // Add timeout to Supabase auth call
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Sign in timeout')), 15000);
      });

      const authPromise = supabase.auth.signInWithPassword({
        email,
        password,
      });

      const { error } = await Promise.race([authPromise, timeoutPromise]);
      return { error };
    } catch (e: any) {
      console.error('[AuthProvider] Sign in error:', e.message);
      return { error: e };
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('clinqflow_hospital_id');
    }
    setSession(null);
    setUser(null);
    setProfile(null);
    setHospitals([]);
    setEntitlements(null);
    setCurrentHospitalIdState(null);
    setLegalStatus('unknown');
  }

  async function refreshProfile() {
    await fetchProfile();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        hospitals,
        currentHospitalId,
        currentHospital,
        entitlements,
        session,
        loading,
        legalStatus,
        setCurrentHospitalId,
        signIn,
        signOut,
        refreshProfile,
        canAccessProduct,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
