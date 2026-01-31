'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

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
  hasLicense: boolean;
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
  setCurrentHospitalId: (id: string | null) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  canAccessProduct: (productCode: string) => boolean;
};

const AuthContext = createContext<AuthContextShape | undefined>(undefined);

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4005';
const AUTH_CACHE_KEY = 'clinqflow_auth_cache';
const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour inactivity timeout
const SESSION_CHECK_INTERVAL = 30000; // Check every 30 seconds
const LAST_ACTIVITY_KEY = 'clinqflow_last_activity';
const ACTIVITY_THROTTLE_MS = 60000; // Update last-activity at most once per minute

function loadAuthCache(): { user: User; profile: UserProfile; hospitals: Hospital[] } | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(AUTH_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (parsed?.user && parsed?.profile) return parsed;
  } catch {}
  return null;
}

function saveAuthCache(user: User | null, profile: UserProfile | null, hospitals: Hospital[]) {
  if (typeof window === 'undefined' || !user || !profile) return;
  try {
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ user, profile, hospitals }));
  } catch {}
}

function clearAuthCache() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_CACHE_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Initialize all state as server-compatible (null/empty) to avoid hydration mismatch.
  // Cache is applied in useEffect after mount.
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [currentHospitalId, setCurrentHospitalIdState] = useState<string | null>(null);
  const [entitlements, setEntitlements] = useState<UserEntitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [legalStatus, setLegalStatus] = useState<LegalStatus>('unknown');
  const [cacheApplied, setCacheApplied] = useState(false);

  // Apply localStorage cache after mount to avoid hydration mismatch
  useEffect(() => {
    const cached = loadAuthCache();
    if (cached) {
      setUser(cached.user);
      setProfile(cached.profile);
      setHospitals(cached.hospitals);
    }
    const savedHospitalId = localStorage.getItem('clinqflow_hospital_id');
    if (savedHospitalId) {
      setCurrentHospitalIdState(savedHospitalId);
    }
    setCacheApplied(true);
  }, []);
  // For API-based auth (non-Supabase mode)
  const [apiToken, setApiToken] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  // Computed: current hospital object
  const currentHospital = currentHospitalId
    ? hospitals.find((h) => h.id === currentHospitalId) || null
    : null;

  // Helper to check product access
  function canAccessProduct(productCode: string): boolean {
    if (profile?.isSuperAdmin) return true;
    if (!entitlements) return false;
    const product = entitlements.products.find((p) => p.code === productCode);
    return product?.hasAccess || false;
  }

  // Get the current access token
  function getAccessToken(): string | null {
    if (isSupabaseConfigured) {
      return session?.access_token || null;
    }
    return apiToken;
  }

  // Fetch user profile and hospitals from API with timeout
  async function fetchProfile(accessToken?: string) {
    try {
      console.log('[AuthProvider] Fetching profile...');

      let token = accessToken;
      if (!token && isSupabaseConfigured && supabase) {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        token = currentSession?.access_token;
        console.log('[AuthProvider] Got token from getSession:', !!token);
      } else if (!token) {
        token = apiToken || undefined;
      }

      if (!token) {
        console.warn('[AuthProvider] No access token available');
        setProfile(null);
        setHospitals([]);
        return null;
      }

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
      } else if (res.status === 401 || res.status === 403) {
        console.warn('[AuthProvider] Session expired (API returned', res.status, '), signing out...');
        signOut();
        return null;
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
  function setCurrentHospitalId(id: string | null) {
    setCurrentHospitalIdState(id);
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem('clinqflow_hospital_id', id);
      } else {
        localStorage.removeItem('clinqflow_hospital_id');
      }
    }
  }

  const router = useRouter();
  const pathname = usePathname();

  // Check for pending legal requirements when hospital is selected
  useEffect(() => {
    const token = getAccessToken();
    if (loading || !token) {
      setLegalStatus('unknown');
      return;
    }

    if (profile?.isSuperAdmin) {
      setLegalStatus('complete');
      return;
    }

    if (!currentHospitalId) {
      setLegalStatus('unknown');
      return;
    }

    if (pathname?.startsWith('/legal')) {
      return;
    }

    async function checkLegalRequirements() {
      if (!currentHospitalId) return;
      const currentToken = getAccessToken();

      setLegalStatus('checking');

      try {
        const res = await fetch(`${API_BASE}/v1/legal/requirements?hospitalId=${currentHospitalId}`, {
          headers: {
            'Authorization': `Bearer ${currentToken}`,
            'Content-Type': 'application/json',
            'x-hospital-id': currentHospitalId,
          },
        });

        if (res.ok) {
          const requirements = await res.json();
          const hasPending = requirements.some((r: any) => r.status === 'PENDING');
          if (hasPending) {
            console.log('[AuthProvider] User has pending legal requirements, redirecting...');
            setLegalStatus('pending');
            router.replace('/legal/accept');
          } else {
            setLegalStatus('complete');
          }
        } else {
          setLegalStatus('complete');
        }
      } catch (e: any) {
        console.error('[AuthProvider] Error checking legal requirements:', e.message);
        setLegalStatus('complete');
      }
    }

    checkLegalRequirements();
  }, [currentHospitalId, session?.access_token, apiToken, loading, pathname, profile?.isSuperAdmin, router]);

  // Initialize auth state (only after cache has been applied to avoid race conditions)
  useEffect(() => {
    if (!cacheApplied) return;

    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    if (isSupabaseConfigured && supabase) {
      // --- Supabase auth mode ---
      const initSupabaseAuth = async () => {
        try {
          console.log('[AuthProvider] Initializing Supabase auth...');

          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Session fetch timeout')), 10000);
          });

          const sessionPromise = supabase!.auth.getSession();

          let initialSession = null;
          let error = null;

          try {
            const result = await Promise.race([sessionPromise, timeoutPromise]);
            initialSession = result.data?.session;
            error = result.error;
          } catch (timeoutErr: any) {
            if (timeoutErr?.name === 'AbortError' || timeoutErr?.message?.includes('aborted')) {
              console.warn('[AuthProvider] Session fetch aborted');
              return;
            }
            console.warn('[AuthProvider] Session fetch timed out:', timeoutErr.message);
          }

          if (error) {
            if (error.name === 'AbortError' || error.message?.includes('aborted')) {
              return;
            } else {
              console.error('[AuthProvider] Session fetch error:', error);
            }
          }

          if (!mounted) return;

          if (initialSession?.expires_at) {
            const expiresAt = new Date(initialSession.expires_at * 1000);
            const now = new Date();
            if (expiresAt < now) {
              await supabase!.auth.signOut();
              initialSession = null;
              if (typeof window !== 'undefined') {
                localStorage.removeItem('clinqflow_hospital_id');
              }
            }
          }

          if (initialSession) {
            setSession(initialSession);
            setUser(initialSession.user);
            const profileData = await fetchProfile(initialSession.access_token);

            // Cache auth state for instant hydration on next visit
            if (profileData?.user) {
              saveAuthCache(initialSession.user, profileData.user, profileData.hospitals || []);
              // Track last activity for inactivity timeout (set initial activity on login)
              if (typeof window !== 'undefined') {
                localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
              }
            }

            if (typeof window !== 'undefined' && profileData?.hospitals) {
              const savedHospitalId = localStorage.getItem('clinqflow_hospital_id');
              if (savedHospitalId) {
                const isValidHospital = profileData.hospitals.some(
                  (h: Hospital) => h.id === savedHospitalId
                );
                if (isValidHospital) {
                  setCurrentHospitalIdState(savedHospitalId);
                } else {
                  setCurrentHospitalIdState(null);
                  localStorage.removeItem('clinqflow_hospital_id');
                }
              } else if (profileData.hospitals.length === 1 && !profileData.user?.isSuperAdmin) {
                // Auto-select the only hospital — skip select-hospital page entirely
                const onlyHospital = profileData.hospitals[0];
                setCurrentHospitalIdState(onlyHospital.id);
                localStorage.setItem('clinqflow_hospital_id', onlyHospital.id);
              }
            }
          } else {
            // No valid session — clear all cached state to prevent stuck UI
            setUser(null);
            setProfile(null);
            setHospitals([]);
            setCurrentHospitalIdState(null);
            setEntitlements(null);
            clearAuthCache();
            if (typeof window !== 'undefined') {
              localStorage.removeItem('clinqflow_hospital_id');
              localStorage.removeItem(LAST_ACTIVITY_KEY);
            }
          }
          if (mounted) setLoading(false);
        } catch (e: any) {
          if (e?.name === 'AbortError' || e?.message?.includes('aborted') || e?.message?.includes('signal')) {
            return;
          }
          console.error('[AuthProvider] Auth init error:', e);
          if (mounted) setLoading(false);
        }
      }

      initSupabaseAuth();

      try {
        const { data } = supabase.auth.onAuthStateChange(
          async (_event: AuthChangeEvent, newSession: Session | null) => {
            if (!mounted) return;
            const previousUserId = user?.id;
            setSession(newSession);
            setUser(newSession?.user || null);

            if (newSession) {
              const profileData = await fetchProfile(newSession.access_token);
              if (previousUserId && previousUserId !== newSession.user?.id) {
                setCurrentHospitalIdState(null);
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('clinqflow_hospital_id');
                }
              } else if (typeof window !== 'undefined' && profileData?.hospitals) {
                const savedHospitalId = localStorage.getItem('clinqflow_hospital_id');
                if (!savedHospitalId && profileData.hospitals.length === 1 && !profileData.user?.isSuperAdmin) {
                  // Auto-select the only hospital on sign-in
                  const onlyHospital = profileData.hospitals[0];
                  setCurrentHospitalIdState(onlyHospital.id);
                  localStorage.setItem('clinqflow_hospital_id', onlyHospital.id);
                }
              }
            } else {
              setProfile(null);
              setHospitals([]);
              setEntitlements(null);
              setCurrentHospitalIdState(null);
              setLegalStatus('unknown');
              clearAuthCache();
              if (typeof window !== 'undefined') {
                localStorage.removeItem('clinqflow_hospital_id');
                localStorage.removeItem(LAST_ACTIVITY_KEY);
              }
            }
          }
        );
        subscription = data.subscription;
      } catch (e) {
        console.error('Failed to set up auth listener:', e);
      }
    } else {
      // --- API-based auth mode (no Supabase) ---
      console.log('[AuthProvider] Running in API-only auth mode (no Supabase)');

      const initApiAuth = async () => {
        if (typeof window !== 'undefined') {
          const savedToken = localStorage.getItem('clinqflow_api_token');
          if (savedToken) {
            setApiToken(savedToken);
            const profileData = await fetchProfile(savedToken);
            if (profileData) {
              const apiUser = { id: profileData.user?.id, email: profileData.user?.email } as User;
              setUser(apiUser);
              setProfile(profileData.user);
              saveAuthCache(apiUser, profileData.user, profileData.hospitals || []);

              const savedHospitalId = localStorage.getItem('clinqflow_hospital_id');
              if (savedHospitalId && profileData.hospitals) {
                const isValid = profileData.hospitals.some(
                  (h: Hospital) => h.id === savedHospitalId
                );
                if (isValid) {
                  setCurrentHospitalIdState(savedHospitalId);
                } else {
                  localStorage.removeItem('clinqflow_hospital_id');
                }
              } else if (profileData.hospitals?.length === 1 && !profileData.user?.isSuperAdmin) {
                // Auto-select the only hospital
                const onlyHospital = profileData.hospitals[0];
                setCurrentHospitalIdState(onlyHospital.id);
                localStorage.setItem('clinqflow_hospital_id', onlyHospital.id);
              }
            } else {
              localStorage.removeItem('clinqflow_api_token');
            }
          }
        }
        if (mounted) setLoading(false);
      }

      initApiAuth();
    }

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [cacheApplied]);

  // Track user activity — reset idle timer on interactions
  const lastActivityWriteRef = useRef(0);
  const touchActivity = useCallback(() => {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    // Throttle localStorage writes to at most once per minute
    if (now - lastActivityWriteRef.current >= ACTIVITY_THROTTLE_MS) {
      lastActivityWriteRef.current = now;
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    }
  }, []);

  // Attach activity listeners when user is logged in
  useEffect(() => {
    if (loading || !user) return;

    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((evt) => window.addEventListener(evt, touchActivity, { passive: true }));

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, touchActivity));
    };
  }, [loading, user, touchActivity]);

  // Periodic inactivity check — sign out after 1 hour with no interaction
  useEffect(() => {
    if (loading || !user) return;

    function checkIdleTimeout() {
      if (typeof window === 'undefined') return;
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
      if (!lastActivity) return;

      const idle = Date.now() - parseInt(lastActivity, 10);
      if (idle >= SESSION_IDLE_TIMEOUT_MS) {
        console.log('[AuthProvider] Session expired (1-hour idle timeout), signing out...');
        signOut().then(() => {
          window.location.href = '/login?reason=idle';
        });
      }
    }

    // Check immediately
    checkIdleTimeout();

    // Then check periodically
    const interval = setInterval(checkIdleTimeout, SESSION_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [loading, user]);

  async function signIn(email: string, password: string) {
    if (isSupabaseConfigured && supabase) {
      // Supabase auth
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Sign in timeout')), 15000);
        });

        const authPromise = supabase.auth.signInWithPassword({ email, password });
        const { error } = await Promise.race([authPromise, timeoutPromise]);
        if (!error && typeof window !== 'undefined') {
          localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
        }
        return { error };
      } catch (e: any) {
        console.error('[AuthProvider] Sign in error:', e.message);
        return { error: e };
      }
    } else {
      // API-based auth
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (res.ok) {
          const data = await res.json();
          const token = data.access_token || data.token;
          if (token) {
            setApiToken(token);
            if (typeof window !== 'undefined') {
              localStorage.setItem('clinqflow_api_token', token);
              localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
            }
            const profileData = await fetchProfile(token);
            if (profileData) {
              setUser({ id: profileData.user?.id, email: profileData.user?.email } as User);
              setProfile(profileData.user);
            }
            return { error: null };
          }
          return { error: new Error('No token received from API') };
        } else {
          const errData = await res.json().catch(() => ({}));
          return { error: new Error(errData.message || 'Invalid credentials') };
        }
      } catch (e: any) {
        console.error('[AuthProvider] API sign in error:', e.message);
        return { error: e };
      }
    }
  }

  async function signOut() {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('clinqflow_hospital_id');
      localStorage.removeItem('clinqflow_api_token');
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    }
    clearAuthCache();
    setApiToken(null);
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

  const contextValue = useMemo<AuthContextShape>(
    () => ({
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
    }),
    [user, profile, hospitals, currentHospitalId, currentHospital, entitlements, session, loading, legalStatus]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
