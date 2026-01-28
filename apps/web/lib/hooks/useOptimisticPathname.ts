'use client';

import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Returns the current pathname with optimistic updates.
 * When a user clicks a nav link, the returned pathname updates
 * immediately (before the page actually loads), so the sidebar
 * highlights the target page instantly — no bounce.
 */
export function useOptimisticPathname() {
  const pathname = usePathname();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const originRef = useRef<string | null>(null);

  // Clear pending path once the real pathname changes from the origin
  useEffect(() => {
    if (!pendingPath) return;

    // The real pathname moved away from where we started — navigation happened
    if (pathname !== originRef.current) {
      setPendingPath(null);
      originRef.current = null;
    }
  }, [pathname, pendingPath]);

  const handleNavClick = useCallback((href: string) => {
    // Don't set pending if we're already on that page
    if (pathname === href) return;
    originRef.current = pathname;
    setPendingPath(href);
  }, [pathname]);

  return { pathname: pendingPath || pathname, handleNavClick };
}
