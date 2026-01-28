'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2 * 60 * 1000, // 2 minutes — data stays fresh, no refetch on navigate
            gcTime: 10 * 60 * 1000, // 10 minutes cache retention
            refetchOnWindowFocus: false, // don't refetch every tab switch
            retry: 1,
            refetchOnMount: false, // cached data used instantly on navigate back
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
