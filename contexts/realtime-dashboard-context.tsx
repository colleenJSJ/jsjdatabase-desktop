'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Task, CalendarEvent } from '@/lib/supabase/types';
import { useUser } from '@/contexts/user-context';
import { useQuery } from '@tanstack/react-query';
import { realtimeClient } from '@/lib/realtime/realtime-client';
import ApiClient from '@/lib/api/api-client';
import { parseDateOnlyLocal } from '@/lib/utils/date-utils';

interface Announcement {
  id: string;
  title: string;
  message: string;
  created_by: string;
  created_by_user?: {
    id: string;
    name: string;
  };
  is_pinned: boolean;
  expires_at: string;
  created_at: string;
}

interface TravelData {
  trips?: any[];
  upcomingFlights?: any[];
}

interface DashboardData {
  announcements: Announcement[];
  tasks: Task[];
  events: CalendarEvent[];
  travelData: TravelData;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

interface RealtimeDashboardContextType extends DashboardData {
  refreshData: () => Promise<void>;
  updateAnnouncements: (announcements: Announcement[]) => void;
  updateTasks: (tasks: Task[]) => void;
  updateEvents: (events: CalendarEvent[]) => void;
}

const RealtimeDashboardContext = createContext<RealtimeDashboardContextType | undefined>(undefined);

export function RealtimeDashboardProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [subscriptions, setSubscriptions] = useState<any[]>([]);

  // Use React Query for data fetching with realtime updates
  const { data: announcements = [], refetch: refetchAnnouncements } = useQuery({
    queryKey: ['dashboard', 'announcements'],
    queryFn: async () => {
      const response = await ApiClient.get('/api/announcements');
      return response.data?.announcements || [];
    },
    enabled: !!user,
    staleTime: Infinity, // Data never goes stale with realtime
  });

  const { data: tasks = [], refetch: refetchTasks } = useQuery({
    queryKey: ['dashboard', 'tasks'],
    queryFn: async () => {
      const response = await ApiClient.get('/api/tasks');
      const allTasks = response.data?.tasks || [];
      
      // Filter for active dashboard tasks
      return allTasks
        .filter((task: Task) => task.status !== 'completed')
        .sort((a: Task, b: Task) => {
          const priorityOrder: Record<string, number> = { high: 1, medium: 2, low: 3 };
          const priorityDiff = (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
          if (priorityDiff !== 0) return priorityDiff;
          
          if (a.due_date && b.due_date) {
            return parseDateOnlyLocal(a.due_date).getTime() - parseDateOnlyLocal(b.due_date).getTime();
          }
          return 0;
        })
        .slice(0, 5);
    },
    enabled: !!user,
    staleTime: Infinity,
  });

  const { data: events = [], refetch: refetchEvents } = useQuery({
    queryKey: ['dashboard', 'events'],
    queryFn: async () => {
      const response = await ApiClient.get('/api/calendar-events');
      const calendarEvents = response.data?.events || [];
      
      const now = new Date();
      return calendarEvents
        .filter((event: CalendarEvent) => {
          if (event.source === 'tasks' || event.title?.startsWith('Task: ')) {
            return false;
          }
          const endTime = event.end_time ? new Date(event.end_time) : new Date(event.start_time);
          return endTime >= now;
        })
        .sort((a: CalendarEvent, b: CalendarEvent) => 
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        )
        .slice(0, 5);
    },
    enabled: !!user,
    staleTime: Infinity,
  });

  const { data: travelData = {}, refetch: refetchTravel } = useQuery({
    queryKey: ['dashboard', 'travel'],
    queryFn: async () => {
      const response = await ApiClient.get('/api/travel/dashboard');
      return response.data || {};
    },
    enabled: !!user,
    staleTime: Infinity,
  });

  // Set up realtime subscriptions
  useEffect(() => {
    if (!user) return;

    const subs: any[] = [];

    // Subscribe to announcements
    subs.push(
      realtimeClient.subscribeToTable({
        table: 'announcements',
        event: '*',
        onChange: () => {
          console.log('[Dashboard] Announcements changed, refetching...');
          refetchAnnouncements();
        }
      })
    );

    // Subscribe to tasks
    subs.push(
      realtimeClient.subscribeToTable({
        table: 'tasks',
        event: '*',
        onChange: () => {
          console.log('[Dashboard] Tasks changed, refetching...');
          refetchTasks();
        }
      })
    );

    // Subscribe to calendar events
    subs.push(
      realtimeClient.subscribeToTable({
        table: 'calendar_events',
        event: '*',
        onChange: () => {
          console.log('[Dashboard] Calendar events changed, refetching...');
          refetchEvents();
        }
      })
    );

    // Subscribe to travel trips
    subs.push(
      realtimeClient.subscribeToTable({
        table: 'travel_trips',
        event: '*',
        onChange: () => {
          console.log('[Dashboard] Travel data changed, refetching...');
          refetchTravel();
        }
      })
    );

    setSubscriptions(subs);

    // Cleanup subscriptions
    return () => {
      subs.forEach(sub => sub.unsubscribe());
    };
  }, [user]);

  // Manual refresh function
  const refreshData = useCallback(async () => {
    console.log('[Dashboard] Manual refresh triggered');
    await Promise.all([
      refetchAnnouncements(),
      refetchTasks(),
      refetchEvents(),
      refetchTravel(),
    ]);
  }, [refetchAnnouncements, refetchTasks, refetchEvents, refetchTravel]);

  // Update functions for individual widgets
  const updateAnnouncements = useCallback((newAnnouncements: Announcement[]) => {
    // This would be handled by React Query cache updates
    console.log('[Dashboard] Announcements updated locally');
  }, []);

  const updateTasks = useCallback((newTasks: Task[]) => {
    console.log('[Dashboard] Tasks updated locally');
  }, []);

  const updateEvents = useCallback((newEvents: CalendarEvent[]) => {
    console.log('[Dashboard] Events updated locally');
  }, []);

  const contextValue: RealtimeDashboardContextType = {
    announcements,
    tasks,
    events,
    travelData,
    isLoading: false,
    error: null,
    lastUpdated: new Date(),
    refreshData,
    updateAnnouncements,
    updateTasks,
    updateEvents,
  };

  return (
    <RealtimeDashboardContext.Provider value={contextValue}>
      {children}
    </RealtimeDashboardContext.Provider>
  );
}

export function useRealtimeDashboard() {
  const context = useContext(RealtimeDashboardContext);
  if (!context) {
    throw new Error('useRealtimeDashboard must be used within a RealtimeDashboardProvider');
  }
  return context;
}
