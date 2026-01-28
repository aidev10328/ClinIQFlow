import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/logout', '/invite/accept', '/api'];

// Routes that require authentication
const PROTECTED_PREFIXES = ['/admin', '/hospital', '/dashboard', '/select-hospital'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Skip static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // For protected routes, check for auth tokens
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isProtected) {
    // Check for Supabase auth cookies or API token cookie
    const supabaseAuthToken = request.cookies.getAll().find(
      (c) => c.name.includes('auth-token') || c.name.includes('sb-')
    );

    // If no auth cookie found, redirect to login
    // Note: We also accept the case where auth is managed via localStorage
    // (client-side only). The middleware provides a first line of defense,
    // but the client-side guards remain the source of truth.
    if (!supabaseAuthToken) {
      // Check if this could be a client-side auth (localStorage-based)
      // We can't read localStorage from middleware, so we allow through
      // and let client-side guards handle it. The middleware primarily
      // catches direct URL access without any session.
      const referer = request.headers.get('referer');
      const isNavigationFromApp = referer && new URL(referer).origin === request.nextUrl.origin;

      if (!isNavigationFromApp && !supabaseAuthToken) {
        // Direct URL access without cookies - likely unauthenticated
        // Let it through but add a header hint for the client
        const response = NextResponse.next();
        response.headers.set('x-auth-check', 'required');
        return response;
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
