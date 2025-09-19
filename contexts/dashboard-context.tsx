'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Task, CalendarEvent, User } from '@/lib/supabase/types';
import { useUser } from '@/contexts/user-context';
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

interface DashboardContextType extends DashboardData {
  refreshData: () => Promise<void>;
  updateAnnouncements: (announcements: Announcement[]) => void;
  updateTasks: (tasks: Task[]) => void;
  updateEvents: (events: CalendarEvent[]) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

const REFRESH_INTERVAL = 60000; // 60 seconds

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [data, setData] = useState<DashboardData>({
    announcements: [],
    tasks: [],
    events: [],
    travelData: {},
    isLoading: true,
    error: null,
    lastUpdated: null,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);

  // Fetch all dashboard data in parallel
  const fetchAllData = useCallback(async () => {
    // Prevent duplicate concurrent fetches
    if (isFetchingRef.current) {
      console.log('[DashboardContext] Fetch already in progress, skipping...');
      return;
    }

    isFetchingRef.current = true;
    console.log('[DashboardContext] Starting consolidated data fetch...');

    try {
      // Fetch all data in parallel
      const [announcementsRes, tasksRes, eventsRes, travelRes] = await Promise.allSettled([
        fetch('/api/announcements'),
        fetch('/api/tasks'),
        fetch('/api/calendar-events'),
        fetch('/api/travel/dashboard').catch(() => ({ ok: false })), // Graceful fallback
      ]);

      const newData: Partial<DashboardData> = {
        lastUpdated: new Date(),
        error: null,
      };

      // Process announcements
      if (announcementsRes.status === 'fulfilled' && announcementsRes.value.ok) {
        const announcementsData = await announcementsRes.value.json();
        newData.announcements = announcementsData.announcements || [];
      } else {
        console.error('[DashboardContext] Failed to fetch announcements');
        newData.announcements = data.announcements; // Keep existing data
      }

      // Process tasks
      if (tasksRes.status === 'fulfilled' && tasksRes.value.ok) {
        const tasksData = await tasksRes.value.json();
        const allTasks = tasksData.tasks || [];
        
        // Filter for active tasks for dashboard widget
        const activeTasks = allTasks
          .filter((task: Task) => task.status !== 'completed')
          .sort((a: Task, b: Task) => {
            // Sort by priority then due date
            const priorityOrder: Record<string, number> = { high: 1, medium: 2, low: 3 };
            const priorityDiff = (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
            if (priorityDiff !== 0) return priorityDiff;
            
            if (a.due_date && b.due_date) {
              return parseDateOnlyLocal(a.due_date).getTime() - parseDateOnlyLocal(b.due_date).getTime();
            }
            if (a.due_date && !b.due_date) return -1;
            if (!a.due_date && b.due_date) return 1;
            return 0;
          })
          .slice(0, 5); // Get top 5 tasks
        
        newData.tasks = activeTasks;
      } else {
        console.error('[DashboardContext] Failed to fetch tasks');
        newData.tasks = data.tasks;
      }

      // Process calendar events
      if (eventsRes.status === 'fulfilled' && eventsRes.value.ok) {
        const eventsData = await eventsRes.value.json();
        const calendarEvents = eventsData.events || [];
        
        // Filter upcoming non-task events
        const now = new Date();
        const upcomingEvents = calendarEvents
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
        
        newData.events = upcomingEvents;
      } else {
        console.error('[DashboardContext] Failed to fetch events');
        newData.events = data.events;
      }

      // Process travel data
      if (travelRes.status === 'fulfilled' && (travelRes.value as Response).ok) {
        const travelData = await (travelRes.value as Response).json();
        newData.travelData = travelData || {};
      } else {
        console.error('[DashboardContext] Failed to fetch travel data');
        newData.travelData = data.travelData;
      }

      setData(prev => ({
        ...prev,
        ...newData,
        isLoading: false,
      }));

      console.log('[DashboardContext] Data fetch completed successfully');
    } catch (error) {
      console.error('[DashboardContext] Error fetching dashboard data:', error);
      setData(prev => ({
        ...prev,
        error: 'Failed to fetch dashboard data',
        isLoading: false,
      }));
    } finally {
      isFetchingRef.current = false;
    }
  }, [data.announcements, data.tasks, data.events, data.travelData]);

  // Manual refresh function
  const refreshData = useCallback(async () => {
    console.log('[DashboardContext] Manual refresh triggered');
    await fetchAllData();
  }, [fetchAllData]);

  // Update functions for individual widgets
  const updateAnnouncements = useCallback((announcements: Announcement[]) => {
    setData(prev => ({ ...prev, announcements }));
  }, []);

  const updateTasks = useCallback((tasks: Task[]) => {
    setData(prev => ({ ...prev, tasks }));
  }, []);

  const updateEvents = useCallback((events: CalendarEvent[]) => {
    setData(prev => ({ ...prev, events }));
  }, []);

  // Set up polling interval
  useEffect(() => {
    if (!user) return;

    // Initial fetch
    fetchAllData();

    // Set up interval for periodic refresh
    intervalRef.current = setInterval(() => {
      console.log('[DashboardContext] Periodic refresh triggered');
      fetchAllData();
    }, REFRESH_INTERVAL);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user, fetchAllData]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      isFetchingRef.current = false;
    };
  }, []);

  const contextValue: DashboardContextType = {
    ...data,
    refreshData,
    updateAnnouncements,
    updateTasks,
    updateEvents,
  };

  return (
    <DashboardContext.Provider value={contextValue}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}
