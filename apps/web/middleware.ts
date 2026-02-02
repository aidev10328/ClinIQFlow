import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/logout', '/invite/accept', '/api'];

// Routes that require authentication — redirect to /login if no session
const PROTECTED_PREFIXES = [
  '/admin',
  '/hospital',
  '/doctor',
  '/dashboard',
  '/select-hospital',
  '/legal',
  '/no-access',
];

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

  // Skip root page (public landing)
  if (pathname === '/') {
    return NextResponse.next();
  }

  // For protected routes, check for auth tokens
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isProtected) {
    // Check for browser session cookie (session cookie = cleared on browser close)
    const hasSessionCookie = request.cookies.has('clinqflow_session');

    if (!hasSessionCookie) {
      // No active browser session → redirect to login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Check for Supabase auth cookies (set by @supabase/ssr)
    const hasAuthCookie = request.cookies.getAll().some(
      (c) => c.name.includes('auth-token') || c.name.includes('sb-')
    );

    if (!hasAuthCookie) {
      // Check if navigating within the app (referer from same origin)
      // Client-side auth via localStorage can't be read in middleware,
      // so in-app navigations are allowed through — client guards are
      // the final source of truth for those cases.
      const referer = request.headers.get('referer');
      const isNavigationFromApp = referer && new URL(referer).origin === request.nextUrl.origin;

      if (!isNavigationFromApp) {
        // Direct URL access without any auth cookie → redirect to login
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
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
