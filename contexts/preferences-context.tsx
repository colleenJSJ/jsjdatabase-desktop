'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useUser } from '@/contexts/user-context';

export interface UserPreferences {
  timezone: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  weekStartsOn: number;
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  taskReminders: boolean;
  calendarDefaultView: 'month' | 'week' | 'day' | 'list';
  theme: 'light' | 'dark' | 'system';
  language: string;
}

const defaultPreferences: UserPreferences = {
  timezone: 'America/New_York',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  weekStartsOn: 0,
  notificationsEnabled: true,
  emailNotifications: true,
  taskReminders: true,
  calendarDefaultView: 'month',
  theme: 'dark',
  language: 'en'
};

interface PreferencesContextType {
  preferences: UserPreferences;
  updatePreferences: (updates: Partial<UserPreferences>) => Promise<void>;
  loading: boolean;
  formatDate: (date: Date | string) => string;
  formatTime: (date: Date | string) => string;
  formatDateTime: (date: Date | string) => string;
  getUserTimezone: () => string;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);

  // Load user preferences
  useEffect(() => {
    if (user) {
      loadPreferences();
    } else {
      setPreferences(defaultPreferences);
      setLoading(false);
    }
  }, [user]);

  const loadPreferences = async () => {
    try {
      const response = await fetch('/api/preferences');
      if (response.ok) {
        const data = await response.json();
        setPreferences({
          ...defaultPreferences,
          ...data.preferences
        });
      } else {
        // If no preferences exist, create default ones
        await createDefaultPreferences();
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      setPreferences(defaultPreferences);
    } finally {
      setLoading(false);
    }
  };

  const createDefaultPreferences = async () => {
    try {
      const response = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaultPreferences)
      });
      if (response.ok) {
        const data = await response.json();
        setPreferences(data.preferences);
      }
    } catch (error) {
      console.error('Error creating default preferences:', error);
    }
  };

  const updatePreferences = async (updates: Partial<UserPreferences>) => {
    try {
      const newPreferences = { ...preferences, ...updates };
      
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      
      if (response.ok) {
        setPreferences(newPreferences);
      } else {
        throw new Error('Failed to update preferences');
      }
    } catch (error) {
      console.error('Error updating preferences:', error);
      throw error;
    }
  };

  const formatDate = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const format = preferences.dateFormat;
    
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    
    return format
      .replace('DD', day)
      .replace('MM', month)
      .replace('YYYY', year.toString())
      .replace('YY', year.toString().slice(-2));
  };

  const formatTime = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    
    if (preferences.timeFormat === '24h') {
      return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: preferences.timezone
      });
    } else {
      return d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: preferences.timezone
      });
    }
  };

  const formatDateTime = (date: Date | string): string => {
    return `${formatDate(date)} ${formatTime(date)}`;
  };

  const getUserTimezone = (): string => {
    return preferences.timezone;
  };

  return (
    <PreferencesContext.Provider value={{
      preferences,
      updatePreferences,
      loading,
      formatDate,
      formatTime,
      formatDateTime,
      getUserTimezone
    }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return context;
}