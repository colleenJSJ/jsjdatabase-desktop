/**
 * Bundle Manager
 * Utilities for managing code splitting and bundle loading
 */

// Track loaded bundles
const loadedBundles = new Set<string>();
const loadingBundles = new Map<string, Promise<any>>();

/**
 * Load a bundle with caching
 */
export async function loadBundle<T>(
  bundleName: string,
  loader: () => Promise<T>
): Promise<T> {
  // Already loaded
  if (loadedBundles.has(bundleName)) {
    console.log(`[Bundle] ${bundleName} already loaded`);
    return loader();
  }

  // Currently loading
  if (loadingBundles.has(bundleName)) {
    console.log(`[Bundle] ${bundleName} is loading, waiting...`);
    await loadingBundles.get(bundleName);
    return loader();
  }

  // Start loading
  console.log(`[Bundle] Loading ${bundleName}...`);
  const loadPromise = loader()
    .then(result => {
      loadedBundles.add(bundleName);
      loadingBundles.delete(bundleName);
      console.log(`[Bundle] ${bundleName} loaded successfully`);
      return result;
    })
    .catch(error => {
      loadingBundles.delete(bundleName);
      console.error(`[Bundle] Failed to load ${bundleName}:`, error);
      throw error;
    });

  loadingBundles.set(bundleName, loadPromise);
  return loadPromise;
}

/**
 * Preload bundles based on route
 */
export function preloadBundlesForRoute(route: string): void {
  const bundlesToPreload = getBundlesForRoute(route);
  
  bundlesToPreload.forEach(bundle => {
    if (!loadedBundles.has(bundle.name) && !loadingBundles.has(bundle.name)) {
      console.log(`[Bundle] Preloading ${bundle.name} for route ${route}`);
      loadBundle(bundle.name, bundle.loader);
    }
  });
}

/**
 * Get bundles needed for a specific route
 */
function getBundlesForRoute(route: string): Array<{ name: string; loader: () => Promise<any> }> {
  const bundles: Array<{ name: string; loader: () => Promise<any> }> = [];

  // Common bundles for authenticated routes
  if (route.startsWith('/dashboard') || 
      route.startsWith('/tasks') || 
      route.startsWith('/calendar')) {
    bundles.push({
      name: 'react-query',
      loader: () => import('@tanstack/react-query')
    });
  }

  // Route-specific bundles
  switch (true) {
    case route === '/dashboard':
      bundles.push(
        {
          name: 'dashboard-components',
          loader: () => import('@/components/dashboard/weekly-announcements')
        },
        {
          name: 'dashboard-calendar',
          loader: () => import('@/components/dashboard/calendar-overview')
        }
      );
      break;

    case route === '/tasks':
      bundles.push(
        {
          name: 'react-window',
          loader: () => import('react-window')
        },
        {
          name: 'task-components',
          loader: () => import('@/components/tasks/TaskCard')
        }
      );
      break;

    case route === '/calendar':
      bundles.push(
        {
          name: 'date-fns',
          loader: () => import('date-fns')
        },
        {
          name: 'calendar-views',
          loader: () => import('@/components/calendar/MonthView')
        }
      );
      break;

    case route === '/travel':
      bundles.push(
        {
          name: 'travel-autocomplete',
          loader: () => import('@/components/ui/airport-autocomplete')
        },
        {
          name: 'zod',
          loader: () => import('zod')
        }
      );
      break;

    case route === '/documents':
      bundles.push(
        {
          name: 'document-upload',
          loader: () => import('@/components/documents/document-upload-modal')
        }
      );
      break;

    case route === '/passwords':
      bundles.push(
        {
          name: 'password-components',
          loader: () => import('@/components/passwords/PasswordField')
        }
      );
      break;
  }

  return bundles;
}

/**
 * Prefetch bundles based on user navigation patterns
 */
export function prefetchPredictedBundles(currentRoute: string): void {
  // Predict likely next routes based on current route
  const predictions = getPredictedRoutes(currentRoute);
  
  predictions.forEach(route => {
    preloadBundlesForRoute(route);
  });
}

/**
 * Get predicted routes based on navigation patterns
 */
function getPredictedRoutes(currentRoute: string): string[] {
  const predictions: string[] = [];

  switch (currentRoute) {
    case '/dashboard':
      // From dashboard, users often go to tasks or calendar
      predictions.push('/tasks', '/calendar');
      break;
    case '/tasks':
      // From tasks, users might check calendar
      predictions.push('/calendar');
      break;
    case '/calendar':
      // From calendar, users might go to tasks
      predictions.push('/tasks');
      break;
    case '/travel':
      // From travel, users might need documents
      predictions.push('/documents');
      break;
    default:
      // Default: preload dashboard
      predictions.push('/dashboard');
  }

  return predictions;
}

/**
 * Get bundle size information
 */
export function getBundleInfo(): {
  loaded: string[];
  loading: string[];
  total: number;
} {
  return {
    loaded: Array.from(loadedBundles),
    loading: Array.from(loadingBundles.keys()),
    total: loadedBundles.size + loadingBundles.size
  };
}

/**
 * Clear bundle cache (useful for debugging)
 */
export function clearBundleCache(): void {
  loadedBundles.clear();
  loadingBundles.clear();
  console.log('[Bundle] Cache cleared');
}

/**
 * React hook for bundle prefetching
 */
import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';

export function useBundlePrefetch() {
  const router = useRouter();

  useEffect(() => {
    // Prefetch bundles for current route
    preloadBundlesForRoute(router.pathname);
    
    // Prefetch predicted bundles
    const timer = setTimeout(() => {
      prefetchPredictedBundles(router.pathname);
    }, 2000); // Wait 2 seconds before prefetching

    return () => clearTimeout(timer);
  }, [router.pathname]);

  const prefetchRoute = useCallback((route: string) => {
    preloadBundlesForRoute(route);
  }, []);

  return { prefetchRoute };
}

/**
 * Intersection Observer for lazy loading
 */
export function setupLazyLoadObserver(): void {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const element = entry.target as HTMLElement;
          const bundleName = element.dataset.bundle;
          
          if (bundleName && !loadedBundles.has(bundleName)) {
            console.log(`[Bundle] Lazy loading ${bundleName} on viewport entry`);
            // Trigger bundle load based on viewport entry
            // This would be implemented based on specific bundle requirements
          }
        }
      });
    },
    {
      rootMargin: '50px' // Start loading 50px before element enters viewport
    }
  );

  // Observe elements with data-bundle attribute
  document.querySelectorAll('[data-bundle]').forEach(element => {
    observer.observe(element);
  });
}

// Setup observer on page load
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', setupLazyLoadObserver);
}
