/**
 * React hooks for Supabase Realtime subscriptions
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { realtimeClient, RealtimeConfig, RealtimeSubscription } from '@/lib/realtime/realtime-client';
import { taskKeys } from '@/hooks/queries/useTasks';
import { categoryKeys } from '@/hooks/queries/useCategories';
import { useToast } from '@/hooks/use-toast';

/**
 * Subscribe to table changes
 */
export function useRealtimeSubscription(
  config: RealtimeConfig & { enabled?: boolean }
) {
  const subscriptionRef = useRef<RealtimeSubscription | null>(null);
  const { toast } = useToast();
  const { enabled = true, ...realtimeConfig } = config;

  useEffect(() => {
    if (!enabled) return;

    // Add error handler if not provided
    const configWithError = {
      ...realtimeConfig,
      onError: realtimeConfig.onError || ((error) => {
        console.error('[useRealtimeSubscription] Error:', error);
        toast({
          title: 'Connection Error',
          description: 'Real-time updates may be delayed',
          variant: 'destructive',
        });
      })
    };

    subscriptionRef.current = realtimeClient.subscribeToTable(configWithError);

    return () => {
      subscriptionRef.current?.unsubscribe();
    };
  }, [enabled, JSON.stringify(realtimeConfig)]);

  return subscriptionRef.current;
}

/**
 * Subscribe to task changes
 */
export function useRealtimeTasks() {
  const queryClient = useQueryClient();
  
  useRealtimeSubscription({
    table: 'tasks',
    event: '*',
    onInsert: (task) => {
      console.log('[Realtime] New task:', task);
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: taskKeys.dashboard() });
    },
    onUpdate: (task) => {
      console.log('[Realtime] Task updated:', task);
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: taskKeys.dashboard() });
    },
    onDelete: (task) => {
      console.log('[Realtime] Task deleted:', task);
      queryClient.removeQueries({ queryKey: taskKeys.detail(task.id) });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: taskKeys.dashboard() });
    }
  });
}

/**
 * Subscribe to calendar event changes
 */
export function useRealtimeCalendarEvents() {
  const queryClient = useQueryClient();
  
  useRealtimeSubscription({
    table: 'calendar_events',
    event: '*',
    onInsert: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    },
    onUpdate: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    },
    onDelete: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    }
  });
}

/**
 * Subscribe to announcements
 */
export function useRealtimeAnnouncements() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  useRealtimeSubscription({
    table: 'announcements',
    event: '*',
    onInsert: (announcement) => {
      console.log('[Realtime] New announcement:', announcement);
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      
      // Show toast for new announcements
      toast({
        title: 'New Announcement',
        description: announcement.title,
      });
    },
    onUpdate: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
    onDelete: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    }
  });
}

/**
 * Subscribe to presence (who's online)
 */
export function usePresence(
  room: string,
  userData?: any
) {
  const [presenceState, setPresenceState] = useState<Record<string, any>>({});
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const subscriptionRef = useRef<RealtimeSubscription | null>(null);

  useEffect(() => {
    if (!room || !userData) return;

    subscriptionRef.current = realtimeClient.subscribeToPresence(
      room,
      userData,
      (state) => {
        setPresenceState(state);
        // Flatten presence state to get online users
        const users = Object.values(state).flat();
        setOnlineUsers(users);
      },
      (key, current, newPresence) => {
        console.log('[Presence] User joined:', newPresence);
      },
      (key, current, leftPresence) => {
        console.log('[Presence] User left:', leftPresence);
      }
    );

    return () => {
      subscriptionRef.current?.unsubscribe();
    };
  }, [room, JSON.stringify(userData)]);

  return {
    presenceState,
    onlineUsers,
    isOnline: (userId: string) => 
      onlineUsers.some(u => u.user_id === userId)
  };
}

/**
 * Subscribe to broadcast messages
 */
export function useBroadcast(
  channelName: string,
  event: string,
  onMessage: (payload: any) => void
) {
  const subscriptionRef = useRef<RealtimeSubscription | null>(null);

  useEffect(() => {
    subscriptionRef.current = realtimeClient.subscribeToBroadcast(
      channelName,
      event,
      onMessage
    );

    return () => {
      subscriptionRef.current?.unsubscribe();
    };
  }, [channelName, event]);

  const broadcast = useCallback((payload: any) => {
    realtimeClient.broadcast(channelName, event, payload);
  }, [channelName, event]);

  return { broadcast };
}

/**
 * Subscribe to document changes
 */
export function useRealtimeDocuments() {
  const queryClient = useQueryClient();
  
  useRealtimeSubscription({
    table: 'documents',
    event: '*',
    onChange: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    }
  });
}

/**
 * Subscribe to password changes (admin only)
 */
export function useRealtimePasswords(isAdmin: boolean) {
  const queryClient = useQueryClient();
  
  useRealtimeSubscription({
    table: 'passwords',
    event: '*',
    enabled: isAdmin,
    onChange: () => {
      queryClient.invalidateQueries({ queryKey: ['passwords'] });
    }
  });
}

/**
 * Subscribe to travel updates
 */
export function useRealtimeTravel() {
  const queryClient = useQueryClient();
  
  // Subscribe to trips
  useRealtimeSubscription({
    table: 'travel_trips',
    event: '*',
    onChange: () => {
      queryClient.invalidateQueries({ queryKey: ['travel', 'trips'] });
    }
  });
  
  // Subscribe to travel details
  useRealtimeSubscription({
    table: 'travel_details',
    event: '*',
    onChange: () => {
      queryClient.invalidateQueries({ queryKey: ['travel', 'details'] });
    }
  });
  
  // Subscribe to accommodations
  useRealtimeSubscription({
    table: 'travel_accommodations',
    event: '*',
    onChange: () => {
      queryClient.invalidateQueries({ queryKey: ['travel', 'accommodations'] });
    }
  });
}

/**
 * Subscribe to health records
 */
export function useRealtimeHealth() {
  const queryClient = useQueryClient();
  
  useRealtimeSubscription({
    table: 'medical_records',
    event: '*',
    onChange: () => {
      queryClient.invalidateQueries({ queryKey: ['health', 'records'] });
    }
  });
  
  useRealtimeSubscription({
    table: 'medical_appointments',
    event: '*',
    onChange: () => {
      queryClient.invalidateQueries({ queryKey: ['health', 'appointments'] });
    }
  });
  
  useRealtimeSubscription({
    table: 'medications',
    event: '*',
    onChange: () => {
      queryClient.invalidateQueries({ queryKey: ['health', 'medications'] });
    }
  });
}

/**
 * Global realtime subscriptions for dashboard
 */
export function useDashboardRealtime() {
  useRealtimeTasks();
  useRealtimeCalendarEvents();
  useRealtimeAnnouncements();
  
  // Subscribe to dashboard-specific broadcast channel
  const { broadcast } = useBroadcast(
    'dashboard',
    'refresh',
    () => {
      console.log('[Dashboard] Manual refresh triggered');
      // This will be handled by React Query invalidation
    }
  );
  
  return { 
    triggerRefresh: () => broadcast({ timestamp: Date.now() })
  };
}

/**
 * Clean up all realtime subscriptions
 */
export function useCleanupRealtime() {
  useEffect(() => {
    return () => {
      realtimeClient.unsubscribeAll();
    };
  }, []);
}