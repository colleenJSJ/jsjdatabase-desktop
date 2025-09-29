/**
 * Lazy-loaded components with code splitting
 * Each import creates a separate bundle that loads on demand
 */

import dynamic from 'next/dynamic';
import { LoadingSpinner } from '@/components/ui/loading';
import { SkeletonCard, SkeletonWidget, SkeletonCalendar, SkeletonTable } from '@/components/ui/skeleton';

// Loading wrapper for lazy components
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-[200px]">
    <LoadingSpinner message="Loading..." />
  </div>
);

// Dashboard Components (lazy loaded)
export const LazyWeeklyAnnouncements = dynamic(
  () => import('@/components/dashboard/weekly-announcements').then(mod => ({ default: mod.WeeklyAnnouncements })),
  {
    loading: () => <SkeletonWidget title />,
    ssr: false,
  }
);

export const LazyCalendarOverview = dynamic(
  () => import('@/components/dashboard/calendar-overview').then(mod => ({ default: mod.CalendarOverview })),
  {
    loading: () => <SkeletonWidget title />,
    ssr: false,
  }
);

export const LazyTasksWidget = dynamic(
  () => import('@/components/dashboard/tasks-widget').then(mod => ({ default: mod.TasksWidget })),
  {
    loading: () => <SkeletonWidget title />,
    ssr: false,
  }
);

export const LazyTravelWidget = dynamic(
  () => import('@/components/dashboard/travel-widget').then(mod => ({ default: mod.TravelWidget })),
  {
    loading: () => <SkeletonWidget title />,
    ssr: false,
  }
);

// Task Components (lazy loaded)
export const LazyTaskModal = dynamic(
  () => import('@/components/tasks/TaskModal'),
  {
    loading: LoadingFallback,
    ssr: false,
  }
);

export const LazyTaskDetailModal = dynamic(
  () => import('@/components/tasks/TaskDetailModal').then(mod => ({ default: mod.TaskDetailModal })),
  {
    loading: LoadingFallback,
    ssr: false,
  }
);

export const LazyGanttView = dynamic(
  () => import('@/components/tasks/GanttView'),
  {
    loading: () => <SkeletonTable rows={10} columns={7} />,
    ssr: false,
  }
);

export const LazyVirtualizedTaskList = dynamic(
  () => import('@/components/tasks/VirtualizedTaskList').then(mod => ({ default: mod.VirtualizedTaskList })),
  {
    loading: () => <SkeletonTable rows={10} columns={4} />,
    ssr: false,
  }
);

// Calendar Components (lazy loaded)
export const LazyCreateEventModal = dynamic(
  () => import('@/components/calendar/UnifiedEventModal').then(mod => ({ default: mod.UnifiedEventModal })),
  {
    loading: LoadingFallback,
    ssr: false,
  }
);

export const LazyMonthView = dynamic(
  () => import('@/components/calendar/MonthView').then(mod => ({ default: mod.MonthView })),
  {
    loading: () => <SkeletonCalendar />,
    ssr: false,
  }
);

export const LazyWeekView = dynamic(
  () => import('@/components/calendar/WeekView').then(mod => ({ default: mod.WeekView })),
  {
    loading: () => <SkeletonTable rows={24} columns={8} />,
    ssr: false,
  }
);

export const LazyDayView = dynamic(
  () => import('@/components/calendar/DayView').then(mod => ({ default: mod.DayView })),
  {
    loading: () => <SkeletonTable rows={24} columns={2} />,
    ssr: false,
  }
);

// Document Components (lazy loaded)
export const LazyDocumentUpload = dynamic(
  () => import('@/components/documents/document-upload').then(mod => ({ default: mod.DocumentUpload })),
  {
    loading: LoadingFallback,
    ssr: false,
  }
);

export const LazyDocumentList = dynamic(
  () => import('@/components/documents/document-list').then(mod => ({ default: mod.DocumentList })),
  {
    loading: () => <SkeletonTable rows={10} columns={4} />,
    ssr: false,
  }
);

// Travel Components (lazy loaded)
export const LazyAirportAutocomplete = dynamic(
  () => import('@/components/ui/airport-autocomplete').then(mod => ({ default: mod.AirportAutocomplete })),
  {
    loading: LoadingFallback,
    ssr: false,
  }
);

export const LazyDestinationAutocomplete = dynamic(
  () => import('@/components/ui/destination-autocomplete').then(mod => ({ default: mod.DestinationAutocomplete })),
  {
    loading: LoadingFallback,
    ssr: false,
  }
);

// Heavy third-party libraries (lazy loaded)
export const LazyChartComponent = dynamic(
  async () => ({ default: () => null }),
  {
    loading: LoadingFallback,
    ssr: false,
  }
);

export const LazyMapComponent = dynamic(
  () => import('@/components/calendar/GoogleMapsLoader').then(mod => ({ default: mod.GoogleMapsLoader })),
  {
    loading: LoadingFallback,
    ssr: false,
  }
);

// Password Components (lazy loaded)
export const LazyPasswordField = dynamic(
  () => import('@/components/passwords/PasswordField').then(mod => ({ default: mod.PasswordField })),
  {
    loading: LoadingFallback,
    ssr: false,
  }
);

// Admin Components (lazy loaded - only for admin users)
export const LazyAdminSettings = dynamic(
  async () => ({ default: () => null }),
  {
    loading: LoadingFallback,
    ssr: false,
  }
);

export const LazyUserManagement = dynamic(
  async () => ({ default: () => null }),
  {
    loading: () => <SkeletonTable rows={10} columns={5} />,
    ssr: false,
  }
);

// Error Boundary wrapper for lazy components
export const LazyErrorBoundary = dynamic(
  () => import('@/components/error-boundary').then(mod => ({ default: mod.ErrorBoundary })),
  {
    loading: LoadingFallback,
    ssr: true, // Keep SSR for error boundaries
  }
);
