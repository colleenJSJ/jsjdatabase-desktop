/**
 * Prefetching hooks for optimized navigation
 * Preload components and data before navigation
 */

import Link from 'next/link';
import { forwardRef, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

// Component prefetch map
const componentPrefetchMap: Record<string, () => Promise<any>> = {
  '/dashboard': () => Promise.all([
    import('@/components/dashboard/weekly-announcements'),
    import('@/components/dashboard/calendar-overview'),
    import('@/components/dashboard/tasks-widget'),
    import('@/components/dashboard/travel-widget'),
  ]),
  
  '/tasks': () => Promise.all([
    import('@/components/tasks/TaskCard'),
    import('@/components/tasks/TaskModal'),
    import('@/components/tasks/VirtualizedTaskList'),
    import('react-window'),
  ]),
  
  '/calendar': () => Promise.all([
    import('@/components/calendar/MonthView'),
    import('@/components/calendar/WeekView'),
    import('@/components/calendar/UnifiedEventModal'),
    import('date-fns'),
  ]),
  
  '/travel': () => Promise.all([
    import('@/components/ui/airport-autocomplete'),
    import('@/components/ui/destination-autocomplete'),
    import('zod'),
  ]),
  
  '/documents': () => Promise.all([
    import('@/components/documents/document-upload-modal'),
    import('@/components/documents/document-list'),
  ]),
  
  '/passwords': () => Promise.all([
    import('@/components/passwords/PasswordField'),
  ]),
  
  '/health': () => Promise.all([
    import('@/app/(authenticated)/health/AppointmentModal'),
  ]),
};

// Data prefetch map
const dataPrefetchMap: Record<string, (queryClient: any) => void> = {
  '/dashboard': (queryClient) => {
    queryClient.prefetchQuery({
      queryKey: ['dashboard', 'announcements'],
      queryFn: () => fetch('/api/announcements').then(res => res.json()),
    });
    queryClient.prefetchQuery({
      queryKey: ['dashboard', 'tasks'],
      queryFn: () => fetch('/api/tasks').then(res => res.json()),
    });
  },
  
  '/tasks': (queryClient) => {
    queryClient.prefetchQuery({
      queryKey: ['tasks'],
      queryFn: () => fetch('/api/tasks').then(res => res.json()),
    });
    queryClient.prefetchQuery({
      queryKey: ['categories', 'tasks'],
      queryFn: () => fetch('/api/categories?type=tasks').then(res => res.json()),
    });
  },
  
  '/calendar': (queryClient) => {
    queryClient.prefetchQuery({
      queryKey: ['calendar-events'],
      queryFn: () => fetch('/api/calendar-events').then(res => res.json()),
    });
  },
  
  '/travel': (queryClient) => {
    queryClient.prefetchQuery({
      queryKey: ['travel', 'trips'],
      queryFn: () => fetch('/api/trips').then(res => res.json()),
    });
  },
};

/**
 * Hook to prefetch route components and data
 */
export function usePrefetch() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const prefetchTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const prefetchedRoutes = useRef<Set<string>>(new Set());

  const prefetchRoute = useCallback((href: string) => {
    // Already prefetched
    if (prefetchedRoutes.current.has(href)) {
      return;
    }

    // Clear any existing timeout for this route
    const existingTimeout = prefetchTimeouts.current.get(href);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set a small delay to avoid prefetching on quick hover
    const timeout = setTimeout(() => {
      console.log(`[Prefetch] Loading ${href}`);
      
      // Prefetch components
      const componentPrefetch = componentPrefetchMap[href];
      if (componentPrefetch) {
        componentPrefetch().catch(err => 
          console.error(`[Prefetch] Failed to load components for ${href}:`, err)
        );
      }
      
      // Prefetch data
      const dataPrefetch = dataPrefetchMap[href];
      if (dataPrefetch) {
        dataPrefetch(queryClient);
      }
      
      // Mark as prefetched
      prefetchedRoutes.current.add(href);
      
      // Also use Next.js router prefetch
      router.prefetch(href);
    }, 100); // 100ms delay

    prefetchTimeouts.current.set(href, timeout);
  }, [router, queryClient]);

  const cancelPrefetch = useCallback((href: string) => {
    const timeout = prefetchTimeouts.current.get(href);
    if (timeout) {
      clearTimeout(timeout);
      prefetchTimeouts.current.delete(href);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      prefetchTimeouts.current.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  return { prefetchRoute, cancelPrefetch };
}

/**
 * Link component with automatic prefetching
 */
interface PrefetchLinkProps extends React.ComponentProps<typeof Link> {
  prefetch?: boolean;
  prefetchDelay?: number;
}

export const PrefetchLink = forwardRef<HTMLAnchorElement, PrefetchLinkProps>(
  ({ children, href, prefetch = true, prefetchDelay = 100, ...props }, ref) => {
    const { prefetchRoute, cancelPrefetch } = usePrefetch();
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = useCallback(() => {
      if (!prefetch || typeof href !== 'string') return;
      
      timeoutRef.current = setTimeout(() => {
        prefetchRoute(typeof href === 'string' ? href : String(href as any));
      }, prefetchDelay);
    }, [href, prefetch, prefetchDelay, prefetchRoute]);

    const handleMouseLeave = useCallback(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (typeof href === 'string') {
        cancelPrefetch(href);
      }
    }, [href, cancelPrefetch]);

    return (
      <Link
        ref={ref}
        href={href}
        {...props}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        prefetch={false} // Disable Next.js default prefetch
      >
        {children}
      </Link>
    );
  }
);

PrefetchLink.displayName = 'PrefetchLink';

/**
 * Hook to prefetch based on user behavior patterns
 */
export function usePredictivePrefetch(currentPath: string) {
  const { prefetchRoute } = usePrefetch();

  useEffect(() => {
    // Predictive prefetching based on common navigation patterns
    const predictions: Record<string, string[]> = {
      '/dashboard': ['/tasks', '/calendar'],
      '/tasks': ['/calendar', '/dashboard'],
      '/calendar': ['/tasks', '/dashboard'],
      '/travel': ['/documents'],
      '/documents': ['/travel'],
    };

    const routesToPrefetch = predictions[currentPath] || ['/dashboard'];
    
    // Prefetch after a delay (user has settled on the page)
    const timeout = setTimeout(() => {
      routesToPrefetch.forEach(route => prefetchRoute(route));
    }, 3000); // 3 seconds after page load

    return () => clearTimeout(timeout);
  }, [currentPath, prefetchRoute]);
}

/**
 * Prefetch critical resources on app load
 */
export function prefetchCriticalResources() {
  // Prefetch critical fonts
  if ('fonts' in document) {
    document.fonts.load('400 1em Inter');
    document.fonts.load('600 1em Inter');
    document.fonts.load('700 1em Inter');
  }

  // Prefetch critical images
  const criticalImages = [
    '/logo.png',
    '/avatar-placeholder.png',
  ];

  criticalImages.forEach(src => {
    const img = new Image();
    img.src = src;
  });

  // Prefetch critical CSS
  const criticalCSS = [
    '/styles/components.css',
  ];

  criticalCSS.forEach(href => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'style';
    link.href = href;
    document.head.appendChild(link);
  });
}
