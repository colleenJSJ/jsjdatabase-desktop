'use client';

import { useUser } from '@/contexts/user-context';
import { TravelWidget } from '@/components/dashboard/travel-widget';
import { WeeklyAnnouncements } from '@/components/dashboard/weekly-announcements';
import { CalendarOverview } from '@/components/dashboard/calendar-overview';
import { TasksWidget } from '@/components/dashboard/tasks-widget';
import { CheckSquare } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';

export default function DashboardPage() {
  const { user, loading } = useUser();

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
      {/* Welcome Header */}
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

      {/* Weekly Announcements - Top Priority */}
      <ErrorBoundary sectionName="Weekly Announcements">
        <div className="w-full">
          <WeeklyAnnouncements />
        </div>
      </ErrorBoundary>

      {/* Tasks Section */}
      <ErrorBoundary sectionName="Tasks Widget">
        <div className="rounded-xl" style={{ backgroundColor: '#2a2a29' }}>
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
      </ErrorBoundary>

      {/* Events & Appointments and Upcoming Trips - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Calendar Overview - Left Side */}
        <ErrorBoundary sectionName="Calendar Overview">
          <div className="w-full">
            <CalendarOverview />
          </div>
        </ErrorBoundary>

        {/* Upcoming Flights - Right Side */}
        <ErrorBoundary sectionName="Travel Widget">
          <div className="w-full">
            <TravelWidget />
          </div>
        </ErrorBoundary>
      </div>
    </div>
  );
}
