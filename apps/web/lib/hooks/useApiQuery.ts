'use client';

import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { apiFetch } from '../api';

/**
 * Generic API fetch helper that returns parsed JSON.
 * Throws on non-ok responses so React Query treats them as errors.
 */
async function fetchApi<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await apiFetch(path, opts);
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`API error ${res.status}: ${errorText}`);
  }
  return res.json();
}

/**
 * React Query hook for GET requests with automatic caching.
 * @param key - Query key array for cache identification
 * @param path - API path (e.g., '/v1/hospitals')
 * @param options - Additional React Query options
 */
export function useApiQuery<T = unknown>(
  key: string[],
  path: string,
  options?: Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery<T, Error>({
    queryKey: key,
    queryFn: () => fetchApi<T>(path),
    ...options,
  });
}

/**
 * React Query hook for parallel GET requests.
 * Fetches multiple endpoints and returns them together.
 */
export function useParallelQueries<T extends Record<string, unknown>>(
  queries: { key: string[]; path: string; enabled?: boolean }[]
) {
  return queries.map((q) =>
    useApiQuery(q.key, q.path, { enabled: q.enabled ?? true })
  );
}

/**
 * React Query mutation hook for POST/PUT/PATCH/DELETE.
 */
export function useApiMutation<TData = unknown, TVariables = unknown>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
  options?: {
    invalidateKeys?: string[][];
    onSuccess?: (data: TData) => void;
  }
) {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables: TVariables) => {
      return fetchApi<TData>(path, {
        method,
        body: variables ? JSON.stringify(variables) : undefined,
      });
    },
    onSuccess: (data) => {
      if (options?.invalidateKeys) {
        options.invalidateKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
      options?.onSuccess?.(data);
    },
  });
}
