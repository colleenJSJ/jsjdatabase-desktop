'use client';

import { useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { EventType } from '@/lib/calendar/event-adapters';

interface EventSyncConfig {
  onCalendarUpdate?: () => void;
  onTravelUpdate?: () => void;
  onHealthUpdate?: () => void;
  onPetsUpdate?: () => void;
  onAcademicsUpdate?: () => void;
  onTasksUpdate?: () => void;
  debounceMs?: number;
}

// Global deduplication map (shared across all hook instances)
const processedEvents = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000; // 5 second window for deduplication

/**
 * Hook to manage event synchronization and cache invalidation
 * Listens for realtime updates and triggers appropriate refresh functions
 * Includes deduplication to prevent infinite loops
 */
export function useEventSync(config: EventSyncConfig = {}) {
  const router = useRouter();
  const supabase = createClient();
  const updateTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const debounceMs = config.debounceMs || 500;

  // Check if we should process this event (deduplication)
  const shouldProcessEvent = useCallback((eventId: string, eventType: string): boolean => {
    const now = Date.now();
    const eventKey = `${eventType}:${eventId}`;
    
    // Clean up old entries
    for (const [key, timestamp] of processedEvents.entries()) {
      if (now - timestamp > DEDUP_WINDOW_MS) {
        processedEvents.delete(key);
      }
    }
    
    // Check if we've processed this event recently
    const lastProcessed = processedEvents.get(eventKey);
    if (lastProcessed && now - lastProcessed < DEDUP_WINDOW_MS) {
      console.log(`[EventSync] Skipping duplicate event: ${eventKey}`);
      return false;
    }
    
    // Mark as processed
    processedEvents.set(eventKey, now);
    return true;
  }, []);

  // Debounced cache invalidation
  const debouncedInvalidate = useCallback((key: string, callback: () => void) => {
    // Clear existing timer for this key
    const existingTimer = updateTimers.current.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Set new timer
    const timer = setTimeout(() => {
      callback();
      updateTimers.current.delete(key);
    }, debounceMs);
    
    updateTimers.current.set(key, timer);
  }, [debounceMs]);

  // Invalidate related caches based on event type
  const invalidateCache = useCallback((eventType: EventType, source?: string, eventId?: string) => {
    // Use event ID for deduplication if available
    if (eventId && !shouldProcessEvent(eventId, eventType)) {
      return;
    }
    
    // Always refresh calendar (debounced)
    if (config.onCalendarUpdate) {
      debouncedInvalidate('calendar', config.onCalendarUpdate);
    }

    // Refresh domain-specific data (debounced)
    switch (eventType) {
      case 'travel':
        if (config.onTravelUpdate) {
          debouncedInvalidate('travel', config.onTravelUpdate);
        }
        break;
      case 'health':
        if (config.onHealthUpdate) {
          debouncedInvalidate('health', config.onHealthUpdate);
        }
        if (config.onTasksUpdate) {
          debouncedInvalidate('tasks', config.onTasksUpdate);
        }
        break;
      case 'pets':
        if (config.onPetsUpdate) {
          debouncedInvalidate('pets', config.onPetsUpdate);
        }
        if (config.onTasksUpdate) {
          debouncedInvalidate('tasks', config.onTasksUpdate);
        }
        break;
      case 'academics':
        if (config.onAcademicsUpdate) {
          debouncedInvalidate('academics', config.onAcademicsUpdate);
        }
        break;
    }

    // If source indicates task update, refresh tasks
    if (source === 'tasks' && config.onTasksUpdate) {
      debouncedInvalidate('tasks', config.onTasksUpdate);
    }
  }, [config, shouldProcessEvent, debouncedInvalidate]);

  // Set up realtime listeners
  useEffect(() => {
    // Listen for calendar_events changes
    const calendarChannel = supabase
      .channel('calendar-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calendar_events' },
        (payload) => {
          const anyPayload: any = payload as any;
          const eventId = anyPayload.new?.id || anyPayload.old?.id;
          console.log(`[EventSync] Calendar event change: ${eventId}`, payload);
          
          // Determine event type from source or category
          const source = (anyPayload.new?.source || anyPayload.old?.source) as any;
          const category = (anyPayload.new?.category || anyPayload.old?.category) as any;
          
          // Map source/category to event type
          let eventType: EventType = 'general';
          if (source === 'travel') eventType = 'travel';
          else if (source === 'health' || category === 'medical') eventType = 'health';
          else if (source === 'pets' || category === 'pets') eventType = 'pets';
          else if (source === 'academics' || category === 'education') eventType = 'academics';
          
          invalidateCache(eventType, source, eventId);
        }
      )
      .subscribe();

    // Listen for tasks changes (for health/pets appointments)
    const tasksChannel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          const anyPayload: any = payload as any;
          const taskId = anyPayload.new?.id || anyPayload.old?.id;
          console.log(`[EventSync] Task change: ${taskId}`, payload);
          
          const category = (anyPayload.new?.category || anyPayload.old?.category) as any;
          
          // Determine if this task is related to an event
          if (category === 'medical') {
            invalidateCache('health', 'tasks', taskId);
          } else if (category === 'pets') {
            invalidateCache('pets', 'tasks', taskId);
          }
          
          // Always update tasks
          if (config.onTasksUpdate) {
            config.onTasksUpdate();
          }
        }
      )
      .subscribe();

    // Listen for travel_details changes
    const travelChannel = supabase
      .channel('travel-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'travel_details' },
        (payload) => {
          console.log('[EventSync] Travel detail change:', payload);
          invalidateCache('travel', 'travel');
        }
      )
      .subscribe();

    // Listen for academic_events changes
    const academicsChannel = supabase
      .channel('academics-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'academic_events' },
        (payload) => {
          console.log('[EventSync] Academic event change:', payload);
          invalidateCache('academics', 'academics');
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      // Clear all pending timers
      for (const timer of updateTimers.current.values()) {
        clearTimeout(timer);
      }
      updateTimers.current.clear();
      
      // Remove realtime channels
      supabase.removeChannel(calendarChannel);
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(travelChannel);
      supabase.removeChannel(academicsChannel);
    };
  }, [supabase, invalidateCache]);

  // Manual refresh function
  const refreshAll = useCallback(() => {
    if (config.onCalendarUpdate) config.onCalendarUpdate();
    if (config.onTravelUpdate) config.onTravelUpdate();
    if (config.onHealthUpdate) config.onHealthUpdate();
    if (config.onPetsUpdate) config.onPetsUpdate();
    if (config.onAcademicsUpdate) config.onAcademicsUpdate();
    if (config.onTasksUpdate) config.onTasksUpdate();
  }, [config]);

  // Trigger update after event creation
  const handleEventCreated = useCallback((eventType: EventType, result: any) => {
    console.log('[EventSync] Event created:', eventType, result);
    
    // Invalidate caches after a short delay to ensure DB writes are complete
    setTimeout(() => {
      invalidateCache(eventType);
    }, 500);
  }, [invalidateCache]);

  return {
    refreshAll,
    handleEventCreated,
    invalidateCache
  };
}

/**
 * Hook to broadcast changes to other tabs/windows
 * Uses localStorage events for cross-tab communication
 */
export function useCrossTabSync(eventKey: string = 'calendar-update') {
  const triggerSync = useCallback((data?: any) => {
    // Trigger storage event for other tabs
    const syncData = {
      timestamp: Date.now(),
      data
    };
    
    localStorage.setItem(eventKey, JSON.stringify(syncData));
    
    // Clean up after trigger
    setTimeout(() => {
      localStorage.removeItem(eventKey);
    }, 100);
  }, [eventKey]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === eventKey && e.newValue) {
        try {
          const syncData = JSON.parse(e.newValue);
          console.log('[CrossTabSync] Received sync event:', syncData);
          
          // Trigger a page refresh or specific update
          window.location.reload();
        } catch (error) {
          console.error('[CrossTabSync] Error parsing sync data:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [eventKey]);

  return { triggerSync };
}
