'use client';

import { useState } from 'react';
import { CalendarEventCategory, User } from '@/lib/supabase/types';
import { Search, Filter, Calendar, User as UserIcon, X } from 'lucide-react';

interface FilterBarProps {
  onCategoryChange: (category: CalendarEventCategory | 'all') => void;
  onAttendeeChange: (attendeeId: string | 'all') => void;
  onDateRangeChange: (start: Date | null, end: Date | null) => void;
  onMyEventsToggle: (showMyEvents: boolean) => void;
  users: User[];
  currentUserId?: string;
}

export function FilterBar({
  onCategoryChange,
  onAttendeeChange,
  onDateRangeChange,
  onMyEventsToggle,
  users,
  currentUserId
}: FilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CalendarEventCategory | 'all'>('all');
  const [selectedAttendee, setSelectedAttendee] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showMyEvents, setShowMyEvents] = useState(false);

  const handleCategoryChange = (value: CalendarEventCategory | 'all') => {
    setSelectedCategory(value);
    onCategoryChange(value);
  };

  const handleAttendeeChange = (value: string) => {
    setSelectedAttendee(value);
    onAttendeeChange(value);
  };

  const handleDateRangeChange = () => {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    onDateRangeChange(start, end);
  };

  const handleMyEventsToggle = (checked: boolean) => {
    setShowMyEvents(checked);
    onMyEventsToggle(checked);
    if (checked && currentUserId) {
      handleAttendeeChange(currentUserId);
    } else {
      handleAttendeeChange('all');
    }
  };

  const clearFilters = () => {
    setSelectedCategory('all');
    setSelectedAttendee('all');
    setStartDate('');
    setEndDate('');
    setShowMyEvents(false);
    
    onCategoryChange('all');
    onAttendeeChange('all');
    onDateRangeChange(null, null);
    onMyEventsToggle(false);
  };

  const hasActiveFilters = selectedCategory !== 'all' || selectedAttendee !== 'all' || startDate || endDate || showMyEvents;

  return (
    <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-4 mb-6">
      {/* Filter Toggle Button */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
            showFilters || hasActiveFilters
              ? 'bg-gray-700 text-text-primary'
              : 'bg-background-primary text-text-muted hover:bg-gray-700/20'
          }`}
        >
          <Filter className="h-4 w-4" />
          <span>Filters</span>
          {hasActiveFilters && (
            <span className="ml-1 px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full">
              Active
            </span>
          )}
        </button>
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="mt-4 pt-4 border-t border-gray-600/30">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value as CalendarEventCategory | 'all')}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              >
                <option value="all">All Categories</option>
                <option value="medical">Health</option>
                <option value="personal">Personal</option>
                <option value="work">Work</option>
                <option value="family">Family</option>
                <option value="travel">Travel</option>
                <option value="school">School</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Attendee Filter */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Attendee
              </label>
              <select
                value={selectedAttendee}
                onChange={(e) => handleAttendeeChange(e.target.value)}
                disabled={showMyEvents}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700 disabled:opacity-50"
              >
                <option value="all">All Attendees</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.name.split(' ')[0]}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div className="lg:col-span-1">
              <label className="block text-sm font-medium text-text-primary mb-1">
                Date Range
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    handleDateRangeChange();
                  }}
                  className="flex-1 px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
                <span className="text-text-muted">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    handleDateRangeChange();
                  }}
                  min={startDate}
                  className="flex-1 px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>
            </div>
          </div>

          {/* Additional Options */}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showMyEvents}
                  onChange={(e) => handleMyEventsToggle(e.target.checked)}
                  className="w-4 h-4 text-gray-700 bg-background-primary border-gray-600 rounded focus:ring-gray-700 focus:ring-2"
                />
                <span className="text-sm text-text-primary">Show only my events</span>
              </label>
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="h-4 w-4" />
                Clear all filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}