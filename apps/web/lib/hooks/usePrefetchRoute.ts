'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api';

/**
 * Maps route paths to the React Query keys + API paths they fetch on mount.
 * This lets us prefetch page data on hover so it's cached before navigation.
 */
const ROUTE_QUERIES: Record<string, { key: string[]; path: string }[]> = {
  // Hospital pages
  '/hospital/dashboard': [
    { key: ['hospital', 'members', 'compliance'], path: '/v1/hospitals/members/compliance' },
    { key: ['hospital', 'staff'], path: '/v1/staff' },
    { key: ['hospital', 'invites'], path: '/v1/invites/pending' },
    { key: ['hospital', 'patients'], path: '/v1/patients' },
  ],
  // Admin pages
  '/admin/dashboard': [
    { key: ['admin', 'hospitals'], path: '/v1/hospitals' },
    { key: ['admin', 'subscriptions'], path: '/v1/products/admin/subscriptions' },
  ],
};

async function fetchApi<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

/**
 * Returns a callback to prefetch data for a given route.
 * Call on mouseEnter/pointerEnter of nav links so data is
 * already in the React Query cache when the page renders.
 */
export function usePrefetchRoute() {
  const queryClient = useQueryClient();

  return useCallback(
    (href: string) => {
      const queries = ROUTE_QUERIES[href];
      if (!queries) return;

      queries.forEach(({ key, path }) => {
        queryClient.prefetchQuery({
          queryKey: key,
          queryFn: () => fetchApi(path),
          staleTime: 2 * 60 * 1000, // match QueryProvider staleTime
        });
      });
    },
    [queryClient],
  );
}
