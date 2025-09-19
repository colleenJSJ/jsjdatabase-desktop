'use client';

import { useEffect } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';

export interface GoogleCalendar {
  google_calendar_id: string;
  name: string;
  background_color: string;
  foreground_color: string;
  is_primary: boolean;
  can_write?: boolean;
}

interface CalendarSelectorProps {
  calendars: GoogleCalendar[];
  selectedCalendarId: string | null | undefined;
  onCalendarChange: (calendarId: string) => void;
  disabled?: boolean;
  label?: string;
}

export function CalendarSelector({
  calendars,
  selectedCalendarId,
  onCalendarChange,
  disabled = false,
  label = 'Google Calendar'
}: CalendarSelectorProps) {
  // Filter to only show calendars user can write to
  const writableCalendars = calendars.filter(cal => cal.can_write !== false);
  
  // Auto-select primary calendar if none selected
  useEffect(() => {
    if (!selectedCalendarId && writableCalendars.length > 0) {
      const primaryCalendar = writableCalendars.find(cal => cal.is_primary);
      if (primaryCalendar) {
        onCalendarChange(primaryCalendar.google_calendar_id);
      } else {
        onCalendarChange(writableCalendars[0].google_calendar_id);
      }
    }
  }, [selectedCalendarId, writableCalendars, onCalendarChange]);

  if (writableCalendars.length === 0) {
    return (
      <div>
        {label ? (
          <label className="block text-sm font-medium text-text-primary mb-1">
            {label}
          </label>
        ) : null}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-700/20 border border-gray-600/30 rounded-md text-text-muted">
          <CalendarIcon className="h-4 w-4" />
          <span className="text-sm">No calendars available</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {label ? (
        <label className="block text-sm font-medium text-text-primary mb-1">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <select
          value={selectedCalendarId ?? ''}
          onChange={(e) => onCalendarChange(e.target.value)}
          disabled={disabled}
          className="w-full pl-9 pr-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700 disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
        >
          {writableCalendars.map(calendar => (
            <option key={calendar.google_calendar_id} value={calendar.google_calendar_id}>
              {calendar.name}
            </option>
          ))}
        </select>
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <div
            className="w-4 h-4 rounded-full"
            style={{
              backgroundColor: writableCalendars.find(
                cal => cal.google_calendar_id === selectedCalendarId
              )?.background_color || '#6366f1'
            }}
          />
        </div>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg className="h-4 w-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {/* Removed "Primary calendar" helper text for cleaner UI */}
    </div>
  );
}
