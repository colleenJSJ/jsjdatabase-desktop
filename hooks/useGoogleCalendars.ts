import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface GoogleCalendar {
  id: string;
  name: string;
  description: string | null;
  backgroundColor: string;
  foregroundColor: string;
  colorId: string | null;
  isPrimary: boolean;
  canWrite: boolean;
  accessRole: string;
  timeZone: string | null;
}

export function useGoogleCalendars() {
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchCalendars = async () => {
    try {
      const response = await fetch('/api/google/calendars/list');
      if (!response.ok) {
        throw new Error('Failed to fetch calendars');
      }
      const data = await response.json();
      setCalendars(data.calendars || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching Google calendars:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setCalendars([]);
    } finally {
      setIsLoading(false);
    }
  };

  const syncCalendars = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/google/calendars/sync', {
        method: 'POST'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync calendars');
      }

      const data = await response.json();
      console.log(`Synced ${data.count} calendars from Google`);
      
      // Refresh calendar list
      await fetchCalendars();
      return data;
    } catch (err) {
      console.error('Error syncing Google calendars:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    } finally {
      setIsSyncing(false);
    }
  };

  const checkSyncStatus = async () => {
    try {
      const response = await fetch('/api/google/calendars/sync');
      if (!response.ok) {
        throw new Error('Failed to check sync status');
      }
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Error checking sync status:', err);
      return { connected: false, expired: false, calendar_count: 0 };
    }
  };

  useEffect(() => {
    fetchCalendars();
  }, []);

  return {
    calendars,
    isLoading,
    error,
    isSyncing,
    syncCalendars,
    checkSyncStatus,
    refetch: fetchCalendars
  };
}