'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect, useState } from 'react';
import { ensureCSRFFetch, ensureCSRFToken } from '@/lib/security/csrf-client';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 30 seconds
        staleTime: 30 * 1000,
        // Cache data for 5 minutes
        gcTime: 5 * 60 * 1000,
        // Retry failed requests 3 times with exponential backoff
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // Refetch on window focus
        refetchOnWindowFocus: true,
        // Don't refetch on reconnect by default
        refetchOnReconnect: 'always',
      },
      mutations: {
        // Retry mutations once
        retry: 1,
      },
    },
  }));

  useEffect(() => {
    let mounted = true;

    void (async () => {
      await ensureCSRFToken();
      if (mounted) {
        ensureCSRFFetch();
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools 
          initialIsOpen={false}
          position="bottom"
        />
      )}
    </QueryClientProvider>
  );
}
