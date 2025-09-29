'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Filter, Check, Calendar as CalendarIcon } from 'lucide-react';

interface GoogleCalendar {
  google_calendar_id: string;
  name: string;
  background_color: string;
  foreground_color: string;
  is_primary: boolean;
  can_write?: boolean;
}

interface CalendarSearchFilterProps {
  onSearchChange: (search: string) => void;
  onCalendarFilterChange: (calendarIds: string[]) => void;
  calendars: GoogleCalendar[];
  visibleCalendarIds: string[];
}

export function CalendarSearchFilter({
  onSearchChange,
  onCalendarFilterChange,
  calendars,
  visibleCalendarIds
}: CalendarSearchFilterProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showCalendarFilter, setShowCalendarFilter] = useState(false);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>(visibleCalendarIds);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedCalendarIds(visibleCalendarIds);
  }, [visibleCalendarIds]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCalendarFilter(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    onSearchChange(value);
  };

  const handleCalendarToggle = async (calendarId: string) => {
    let newSelectedIds: string[];
    
    if (calendarId === 'all') {
      // Toggle all calendars
      if (selectedCalendarIds.length === calendars.length) {
        newSelectedIds = [];
      } else {
        newSelectedIds = calendars.map(cal => cal.google_calendar_id);
      }
    } else {
      // Toggle individual calendar
      if (selectedCalendarIds.includes(calendarId)) {
        newSelectedIds = selectedCalendarIds.filter(id => id !== calendarId);
      } else {
        newSelectedIds = [...selectedCalendarIds, calendarId];
      }
    }

    setSelectedCalendarIds(newSelectedIds);
    onCalendarFilterChange(newSelectedIds);

    // Save preferences to backend
    try {
      await fetch('/api/user/calendar-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible_calendar_ids: newSelectedIds })
      });
    } catch (error) {
      console.error('Error saving calendar preferences:', error);
    }
  };

  const allCalendarsSelected = selectedCalendarIds.length === calendars.length;
  const someCalendarsSelected = selectedCalendarIds.length > 0 && selectedCalendarIds.length < calendars.length;

  return (
    <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-4">
        {/* Search Bar */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search events by title or description..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
          />
        </div>

        {/* Calendar Filter Button */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowCalendarFilter(!showCalendarFilter)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
              showCalendarFilter || selectedCalendarIds.length < calendars.length
                ? 'bg-gray-700 text-text-primary'
                : 'bg-background-primary text-text-muted hover:bg-gray-700/20'
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
            {selectedCalendarIds.length < calendars.length && (
              <span className="ml-1 px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                {selectedCalendarIds.length}/{calendars.length}
              </span>
            )}
          </button>

          {/* Calendar Filter Dropdown */}
          {showCalendarFilter && (
            <div className="absolute right-0 mt-2 w-72 bg-background-primary border border-gray-600/30 rounded-lg shadow-lg z-50">
              <div className="p-2">
                <div className="text-xs font-medium text-text-muted uppercase tracking-wider px-2 py-1">
                  Calendar Visibility
                </div>
                
                {/* All Calendars Option */}
                <button
                  onClick={() => handleCalendarToggle('all')}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-700/20 transition-colors"
                >
                  <div className={`w-4 h-4 border rounded flex items-center justify-center ${
                    allCalendarsSelected 
                      ? 'bg-blue-500 border-blue-500' 
                      : someCalendarsSelected
                      ? 'bg-blue-500/50 border-blue-500'
                      : 'border-gray-600'
                  }`}>
                    {(allCalendarsSelected || someCalendarsSelected) && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </div>
                  <CalendarIcon className="h-4 w-4 text-text-muted" />
                  <span className="text-sm text-text-primary font-medium">All Calendars</span>
                </button>

                <div className="my-2 border-t border-gray-600/30"></div>

                {/* Individual Calendar Options */}
                {calendars.map(calendar => (
                  <button
                    key={calendar.google_calendar_id}
                    onClick={() => handleCalendarToggle(calendar.google_calendar_id)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-700/20 transition-colors"
                  >
                    <div className={`w-4 h-4 border rounded flex items-center justify-center ${
                      selectedCalendarIds.includes(calendar.google_calendar_id)
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-gray-600'
                    }`}>
                      {selectedCalendarIds.includes(calendar.google_calendar_id) && (
                        <Check className="h-3 w-3 text-white" />
                      )}
                    </div>
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: calendar.background_color }}
                    />
                    <span className="text-sm text-text-primary truncate flex-1 text-left">
                      {calendar.name}
                    </span>
                    {calendar.is_primary && (
                      <span className="text-xs text-text-muted bg-gray-700/50 px-1.5 py-0.5 rounded">
                        Primary
                      </span>
                    )}
                  </button>
                ))}

                {calendars.length === 0 && (
                  <div className="px-2 py-4 text-center text-sm text-text-muted">
                    No calendars available
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}