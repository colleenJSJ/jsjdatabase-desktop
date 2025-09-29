/**
 * Lazy-loaded page components for route-based code splitting
 * Each page loads as a separate bundle
 */

import dynamic from 'next/dynamic';
import { PageLoader } from '@/components/ui/loading';
import { ErrorBoundary } from '@/components/error-boundary';

// Page loading fallback
const PageLoadingFallback = () => <PageLoader message="Loading page..." />;

// Authenticated Pages (lazy loaded)
export const LazyDashboardPage = dynamic(
  () => import('@/app/(authenticated)/dashboard/page'),
  {
    loading: PageLoadingFallback,
    ssr: true, // Keep SSR for initial page load
  }
);

export const LazyTasksPage = dynamic(
  () => import('@/app/(authenticated)/tasks/page'),
  {
    loading: PageLoadingFallback,
    ssr: false,
  }
);

export const LazyCalendarPage = dynamic(
  () => import('@/app/(authenticated)/calendar/page'),
  {
    loading: PageLoadingFallback,
    ssr: false,
  }
);

export const LazyTravelPage = dynamic(
  () => import('@/app/(authenticated)/travel/page'),
  {
    loading: PageLoadingFallback,
    ssr: false,
  }
);

export const LazyDocumentsPage = dynamic(
  () => import('@/app/(authenticated)/documents/page'),
  {
    loading: PageLoadingFallback,
    ssr: false,
  }
);

export const LazyPasswordsPage = dynamic(
  () => import('@/app/(authenticated)/passwords/PasswordsPageWrapper').then(mod => ({ default: mod.default })),
  {
    loading: PageLoadingFallback,
    ssr: false,
  }
);

export const LazyHealthPage = dynamic(
  () => import('@/app/(authenticated)/health/page'),
  {
    loading: PageLoadingFallback,
    ssr: false,
  }
);

export const LazyHouseholdPage = dynamic(
  () => import('@/app/(authenticated)/household/page'),
  {
    loading: PageLoadingFallback,
    ssr: false,
  }
);

export const LazyPetsPage = dynamic(
  () => import('@/app/(authenticated)/pets/page'),
  {
    loading: PageLoadingFallback,
    ssr: false,
  }
);

export const LazyAcademicsPage = dynamic(
  () => import('@/app/(authenticated)/j3-academics/page'),
  {
    loading: PageLoadingFallback,
    ssr: false,
  }
);

export const LazyContactsPage = dynamic(
  () => import('@/app/(authenticated)/contacts/page'),
  {
    loading: PageLoadingFallback,
    ssr: false,
  }
);

// Admin Pages (lazy loaded - only for admins)
export const LazyAdminSettingsPage = dynamic(
  () => import('@/app/(authenticated)/admin/settings/page'),
  {
    loading: PageLoadingFallback,
    ssr: false,
  }
);

// Account Pages (lazy loaded)
export const LazyAccountSettingsPage = dynamic(
  () => import('@/app/(authenticated)/account/settings/page'),
  {
    loading: PageLoadingFallback,
    ssr: false,
  }
);

export const LazyAccountSetupPage = dynamic(
  () => import('@/app/(authenticated)/account/setup/page'),
  {
    loading: PageLoadingFallback,
    ssr: false,
  }
);

// Auth Pages (lazy loaded)
export const LazyLoginPage = dynamic(
  () => import('@/app/login/page'),
  {
    loading: PageLoadingFallback,
    ssr: true, // Keep SSR for auth pages
  }
);

/**
 * Page wrapper with error boundary and code splitting
 */
export function LazyPageWrapper({ 
  children,
  pageName 
}: { 
  children: React.ReactNode;
  pageName: string;
}) {
  return (
    <ErrorBoundary sectionName={`${pageName} Page`}>
      {children}
    </ErrorBoundary>
  );
}

/**
 * Preload a page component
 * Call this on hover or when likely to navigate
 */
export function preloadPage(pageName: keyof typeof pageComponents) {
  const component = pageComponents[pageName];
  if (component && 'preload' in component) {
    (component as any).preload();
  }
}

// Map of page components for preloading
const pageComponents = {
  dashboard: LazyDashboardPage,
  tasks: LazyTasksPage,
  calendar: LazyCalendarPage,
  travel: LazyTravelPage,
  documents: LazyDocumentsPage,
  passwords: LazyPasswordsPage,
  health: LazyHealthPage,
  household: LazyHouseholdPage,
  pets: LazyPetsPage,
  academics: LazyAcademicsPage,
  contacts: LazyContactsPage,
  adminSettings: LazyAdminSettingsPage,
  accountSettings: LazyAccountSettingsPage,
  accountSetup: LazyAccountSetupPage,
  login: LazyLoginPage,
};

/**
 * Hook to preload pages on hover
 */
import { useCallback } from 'react';

export function usePreloadPage() {
  return useCallback((pageName: keyof typeof pageComponents) => {
    preloadPage(pageName);
  }, []);
}