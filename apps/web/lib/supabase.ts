import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Singleton client for use in components
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseClient() {
  if (!browserClient && typeof window !== 'undefined') {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }

  // For SSR, create a new client each time
  if (typeof window === 'undefined') {
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  }

  return browserClient!;
}

// For backwards compatibility
export function createClient() {
  return getSupabaseClient();
}
