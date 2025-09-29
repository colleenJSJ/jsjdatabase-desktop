'use client';

import { useUser } from '@/contexts/user-context';
import { ErrorBoundary } from '@/components/error-boundary';
import { Suspense, lazy } from 'react';
import { SkeletonWidget } from '@/components/ui/skeleton';
import { CheckSquare } from 'lucide-react';
import { useDashboardRealtime } from '@/hooks/useRealtime';

// Lazy load dashboard components
const WeeklyAnnouncements = lazy(() => 
  import('@/components/dashboard/weekly-announcements').then(mod => ({ 
    default: mod.WeeklyAnnouncements 
  }))
);

const CalendarOverview = lazy(() => 
  import('@/components/dashboard/calendar-overview').then(mod => ({ 
    default: mod.CalendarOverview 
  }))
);

const TasksWidget = lazy(() => 
  import('@/components/dashboard/tasks-widget').then(mod => ({ 
    default: mod.TasksWidget 
  }))
);

const TravelWidget = lazy(() => 
  import('@/components/dashboard/travel-widget').then(mod => ({ 
    default: mod.TravelWidget 
  }))
);

export default function OptimizedDashboardPage() {
  const { user, loading } = useUser();
  
  // Enable realtime updates
  useDashboardRealtime();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-background-tertiary"></div>
      </div>
    );
  }

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'User';
  const capitalizedFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

  return (
    <div className="space-y-8">
      {/* Welcome Header - Render immediately */}
      <div>
        <h1 className="text-3xl font-bold text-text-primary">
          Hello, {capitalizedFirstName}
        </h1>
        <p className="text-text-muted mt-1">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* Weekly Announcements - Lazy loaded */}
      <ErrorBoundary sectionName="Weekly Announcements">
        <Suspense fallback={<SkeletonWidget title />}>
          <div className="w-full">
            <WeeklyAnnouncements />
          </div>
        </Suspense>
      </ErrorBoundary>

      {/* Calendar Overview - Lazy loaded */}
      <ErrorBoundary sectionName="Calendar Overview">
        <Suspense fallback={<SkeletonWidget title />}>
          <div className="w-full">
            <CalendarOverview />
          </div>
        </Suspense>
      </ErrorBoundary>

      {/* Tasks Section - Lazy loaded */}
      <ErrorBoundary sectionName="Tasks Widget">
        <Suspense fallback={
          <div className="bg-background-secondary border border-gray-600/30 rounded-lg">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckSquare className="h-5 w-5 text-text-muted" />
                <h3 className="font-medium text-text-primary">
                  {user?.role === 'admin' ? 'All Tasks' : 'Your Tasks'}
                </h3>
              </div>
              <SkeletonWidget title={false} />
            </div>
          </div>
        }>
          <div className="bg-background-secondary border border-gray-600/30 rounded-lg">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckSquare className="h-5 w-5 text-text-muted" />
                <h3 className="font-medium text-text-primary">
                  {user?.role === 'admin' ? 'All Tasks' : 'Your Tasks'}
                </h3>
              </div>
              <TasksWidget />
            </div>
          </div>
        </Suspense>
      </ErrorBoundary>

      {/* Upcoming Flights - Lazy loaded, lower priority */}
      <ErrorBoundary sectionName="Travel Widget">
        <Suspense fallback={<SkeletonWidget title />}>
          <div className="w-full">
            <TravelWidget />
          </div>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
