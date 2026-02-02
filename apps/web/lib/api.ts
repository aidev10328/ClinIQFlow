'use client';

import { getSupabaseClient, isSupabaseConfigured } from './supabase';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4005';

// ── GET response cache ──────────────────────────────────────────────
// Caches successful GET responses for 2 min so page revisits are instant.
const CACHE_TTL = 2 * 60 * 1000;
const responseCache = new Map<string, { body: string; status: number; ts: number }>();

function getCached(key: string): Response | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    responseCache.delete(key);
    return null;
  }
  return new Response(entry.body, {
    status: entry.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Invalidate cache entries whose path starts with the given prefix. */
export function invalidateApiCache(pathPrefix?: string) {
  if (!pathPrefix) {
    responseCache.clear();
    return;
  }
  const keys = Array.from(responseCache.keys());
  for (const key of keys) {
    if (key.startsWith(pathPrefix)) responseCache.delete(key);
  }
}

/**
 * Handle special API response codes that require redirects
 */
async function handleSpecialResponses(res: Response): Promise<void> {
  // Only check for 403 and 409 responses
  if (res.status !== 403 && res.status !== 409) {
    return;
  }

  // Clone response to read body without consuming it
  const clonedRes = res.clone();

  try {
    const data = await clonedRes.json();

    // Handle AGREEMENT_REQUIRED - redirect to legal accept page
    if (data.code === 'AGREEMENT_REQUIRED' && typeof window !== 'undefined') {
      console.log('[apiFetch] Agreement required, redirecting to /legal/accept');
      // Use replace to avoid adding to history
      window.location.replace('/legal/accept');
      // Throw to prevent further processing
      throw new Error('Redirecting to legal accept page');
    }

    // Handle HOSPITAL_CONTEXT_REQUIRED - redirect to hospital selector
    if (data.code === 'HOSPITAL_CONTEXT_REQUIRED' && typeof window !== 'undefined') {
      console.log('[apiFetch] Hospital context required, redirecting to /select-hospital');
      const currentPath = window.location.pathname;
      window.location.replace(`/select-hospital?redirect=${encodeURIComponent(currentPath)}`);
      throw new Error('Redirecting to hospital selector');
    }
  } catch (e: any) {
    // If it's our redirect error, re-throw
    if (e.message.includes('Redirecting')) {
      throw e;
    }
    // Otherwise ignore JSON parse errors
  }
}

export async function apiFetch(path: string, opts: RequestInit = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const isGet = method === 'GET';

  // Return cached response for GET requests
  if (isGet) {
    const cached = getCached(path);
    if (cached) return cached;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> || {}),
  };

  // Add access token if available (Supabase or API token)
  try {
    let token: string | undefined;

    const supabase = getSupabaseClient();
    if (isSupabaseConfigured && supabase) {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error('[apiFetch] Session error:', sessionError.message);
      }
      token = session?.access_token;
    } else if (typeof window !== 'undefined') {
      token = localStorage.getItem('clinqflow_api_token') || undefined;
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      console.warn('[apiFetch] No token available for path:', path);
    }

    // Add hospital ID header if set
    if (typeof window !== 'undefined') {
      const hospitalId = localStorage.getItem('clinqflow_hospital_id');
      if (hospitalId) {
        headers['x-hospital-id'] = hospitalId;
      }

      // Add impersonation header if impersonating
      const impersonationData = sessionStorage.getItem('clinqflow_impersonation');
      if (impersonationData) {
        try {
          const { impersonatedUser } = JSON.parse(impersonationData);
          if (impersonatedUser?.id) {
            headers['x-impersonate-user-id'] = impersonatedUser.id;
            console.log('[apiFetch] Impersonating user:', impersonatedUser.email);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  } catch (e: any) {
    console.error('[apiFetch] Error getting session:', e.message);
  }

  // Pre-invalidate cache for mutations so stale data isn't served even if the request times out
  if (!isGet) {
    const segments = path.split('/').slice(0, 3);
    invalidateApiCache(segments.join('/'));
  }

  // Add timeout to prevent hanging (longer for slot regeneration)
  const controller = new AbortController();
  const isSlotRegeneration = path.includes('/slots/regenerate') || path.includes('/slots/generate');
  const timeoutMs = isSlotRegeneration ? 60000 : 10000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    // Handle special response codes (AGREEMENT_REQUIRED, HOSPITAL_CONTEXT_REQUIRED)
    await handleSpecialResponses(res);

    // Cache successful GET responses
    if (isGet && res.ok) {
      const cloned = res.clone();
      cloned.text().then((body) => {
        responseCache.set(path, { body, status: res.status, ts: Date.now() });
      });
    }

    // Also invalidate after mutation completes (in case data was re-cached during the request)
    if (!isGet) {
      const segments = path.split('/').slice(0, 3);
      invalidateApiCache(segments.join('/'));
    }

    return res;
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw e;
  }
}
