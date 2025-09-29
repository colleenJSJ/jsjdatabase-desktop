'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Filter, Check, Calendar as CalendarIcon, X, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { CalendarEventCategory, User } from '@/lib/supabase/types';
import { CategoriesClient, Category } from '@/lib/categories/categories-client';
import { getCategoryEnum, categoryMatches } from '@/lib/utils/category-mapping';
import { usePersonFilter } from '@/contexts/person-filter-context';
import { useFamilyMembers } from '@/hooks/use-family-members';

interface GoogleCalendar {
  google_calendar_id: string;
  name: string;
  background_color: string;
  foreground_color: string;
  is_primary: boolean;
  can_write?: boolean;
}

interface UnifiedSearchFilterProps {
  // Search
  onSearchChange: (search: string) => void;
  
  // Filters
  onCategoryChange: (categories: CalendarEventCategory[]) => void;
  onAttendeeChange: (attendeeIds: string[]) => void;
  onDateRangeChange: (start: Date | null, end: Date | null) => void;
  onCalendarFilterChange: (calendarIds: string[]) => void;
  onShowTasksChange: (showTasks: boolean) => void;
  onShowAllDayOnlyChange?: (showAllDayOnly: boolean) => void;
  
  // Data
  calendars: GoogleCalendar[];
  visibleCalendarIds: string[];
  users: User[];
  currentUserId?: string;
  showTasks: boolean;
  showAllDayOnly?: boolean;
  
  // Initial values
  initialCategories?: CalendarEventCategory[];
  initialAttendees?: string[];
  initialDateRange?: { start: Date | null; end: Date | null };
  
  // Navigation props
  onNavigatePrevious?: () => void;
  onNavigateNext?: () => void;
  onGoToToday?: () => void;
  currentView?: 'month' | 'week' | 'day' | 'list' | 'gantt' | 'year';
  currentDate?: Date;
  ganttTimeScale?: 'day' | 'week' | 'month';
  yearMonthsPerPage?: number;
}

// Month abbreviations
const MONTHS_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// Helper functions for date formatting
function getWeekRange(date: Date): string {
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - date.getDay());
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
    return `${MONTHS_ABBR[startOfWeek.getMonth()]} ${startOfWeek.getDate()}-${endOfWeek.getDate()}, ${startOfWeek.getFullYear()}`;
  } else if (startOfWeek.getFullYear() === endOfWeek.getFullYear()) {
    return `${MONTHS_ABBR[startOfWeek.getMonth()]} ${startOfWeek.getDate()} - ${MONTHS_ABBR[endOfWeek.getMonth()]} ${endOfWeek.getDate()}, ${startOfWeek.getFullYear()}`;
  } else {
    return `${MONTHS_ABBR[startOfWeek.getMonth()]} ${startOfWeek.getDate()}, ${startOfWeek.getFullYear()} - ${MONTHS_ABBR[endOfWeek.getMonth()]} ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`;
  }
}

function getVisibleMonths(currentDate: Date): string {
  return `${MONTHS_ABBR[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
}

function formatDayView(date: Date): string {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const month = MONTHS_ABBR[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  return `${dayName}, ${month} ${day}, ${year}`;
}

export function UnifiedSearchFilter({
  onSearchChange,
  onCategoryChange,
  onAttendeeChange,
  onDateRangeChange,
  onCalendarFilterChange,
  onShowTasksChange,
  onShowAllDayOnlyChange,
  calendars,
  visibleCalendarIds,
  users,
  currentUserId,
  showTasks,
  showAllDayOnly = false,
  initialCategories = [],
  initialAttendees = [],
  initialDateRange = { start: null, end: null },
  onNavigatePrevious,
  onNavigateNext,
  onGoToToday,
  currentView = 'month',
  currentDate = new Date(),
  ganttTimeScale = 'week',
  yearMonthsPerPage = 4
}: UnifiedSearchFilterProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [activeFilterSections, setActiveFilterSections] = useState<Set<string>>(new Set());
  
  // Filter states
  const [selectedCategories, setSelectedCategories] = useState<CalendarEventCategory[]>(initialCategories);
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>(initialAttendees);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>(visibleCalendarIds);
  const [startDate, setStartDate] = useState(initialDateRange.start ? initialDateRange.start.toISOString().split('T')[0] : '');
  const [endDate, setEndDate] = useState(initialDateRange.end ? initialDateRange.end.toISOString().split('T')[0] : '');
  const [localShowTasks, setLocalShowTasks] = useState(showTasks);
  const [localAllDayOnly, setLocalAllDayOnly] = useState(showAllDayOnly);
  const { selectedPersonId, setSelectedPersonId } = usePersonFilter();
  const { members: familyMembers, loading: loadingMembers } = useFamilyMembers({ includePets: false });
  const [dynamicCategories, setDynamicCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch categories from database and map to enum values
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const cats = await CategoriesClient.getCategories('calendar');
        
        // Map categories to use enum values as IDs
        const mappedCategories = cats
          .filter(cat => cat.is_active !== false) // Only show active categories
          .map(cat => {
            const enumValue = getCategoryEnum(cat.name);
            return {
              ...cat,
              id: enumValue, // Use the enum value as the ID for filtering
              originalId: cat.id, // Keep original ID if needed
              displayName: cat.name // Use the actual category name for display
            };
          });
        
        // Remove duplicates based on the mapped enum value
        const uniqueCategories = Array.from(
          new Map(mappedCategories.map(cat => [cat.id, cat])).values()
        );
        
        // Sort categories alphabetically but put locked ones first
        uniqueCategories.sort((a, b) => {
          if (a.is_locked && !b.is_locked) return -1;
          if (!a.is_locked && b.is_locked) return 1;
          return a.name.localeCompare(b.name);
        });
        
        setDynamicCategories(uniqueCategories as Category[]);
      } catch (error) {
        console.error('Error fetching calendar categories:', error);
        // Fallback to basic categories if fetch fails
        setDynamicCategories([
          { id: 'medical', name: 'Health', color: '#5B7CA3', module: 'calendar' },
          { id: 'personal', name: 'Personal', color: '#7A6A8A', module: 'calendar' },
          { id: 'work', name: 'Work', color: '#8C7348', module: 'calendar' },
          { id: 'family', name: 'Family', color: '#6B8A6B', module: 'calendar' },
          { id: 'travel', name: 'Travel', color: '#6B8A6B', module: 'calendar' },
          { id: 'school', name: 'School', color: '#8C7348', module: 'calendar' },
          { id: 'education', name: 'Education', color: '#8C7348', module: 'calendar' },
          { id: 'pets', name: 'Pets', color: '#8C7348', module: 'calendar' },
          { id: 'financial', name: 'Financial', color: '#7A6A8A', module: 'calendar' },
          { id: 'household', name: 'Household', color: '#7A6A8A', module: 'calendar' },
          { id: 'legal', name: 'Legal', color: '#7A6A8A', module: 'calendar' },
          { id: 'administrative', name: 'Administrative', color: '#7A6A8A', module: 'calendar' },
          { id: 'other', name: 'Other', color: '#7A6A8A', module: 'calendar' }
        ] as Category[]);
      } finally {
        setLoadingCategories(false);
      }
    };
    
    fetchCategories();
  }, []);

  useEffect(() => {
    setSelectedCalendarIds(visibleCalendarIds);
  }, [visibleCalendarIds]);

  useEffect(() => {
    setLocalShowTasks(showTasks);
  }, [showTasks]);
  useEffect(() => {
    setLocalAllDayOnly(showAllDayOnly);
  }, [showAllDayOnly]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    onSearchChange(value);
  };

  const handleCategoryToggle = (category: CalendarEventCategory) => {
    const newCategories = selectedCategories.includes(category)
      ? selectedCategories.filter(c => c !== category)
      : [...selectedCategories, category];
    
    setSelectedCategories(newCategories);
    onCategoryChange(newCategories);
  };

  // Sync multi-select attendees with PersonFilterContext (for single selection)
  useEffect(() => {
    if (selectedAttendees.length === 1) {
      // If exactly one person is selected, optionally sync to context
      setSelectedPersonId?.(selectedAttendees[0]);
    } else if (selectedAttendees.length === 0) {
      // If no one is selected, clear context
      setSelectedPersonId?.(null);
    }
    // Don't update context when multiple people are selected
  }, [selectedAttendees, setSelectedPersonId]);

  const handleAttendeeToggle = (attendeeId: string) => {
    const newAttendees = selectedAttendees.includes(attendeeId)
      ? selectedAttendees.filter(a => a !== attendeeId)
      : [...selectedAttendees, attendeeId];
    
    setSelectedAttendees(newAttendees);
    onAttendeeChange(newAttendees);
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

  const handleDateRangeChange = () => {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    onDateRangeChange(start, end);
  };

  const handleShowTasksToggle = (checked: boolean) => {
    setLocalShowTasks(checked);
    onShowTasksChange(checked);
  };
  const handleAllDayToggle = (checked: boolean) => {
    setLocalAllDayOnly(checked);
    onShowAllDayOnlyChange?.(checked);
  };

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedAttendees([]);
    setStartDate('');
    setEndDate('');
    setSelectedCalendarIds(calendars.map(cal => cal.google_calendar_id));
    // Don't reset Show tasks since it's not in the filters dropdown anymore
    
    onCategoryChange([]);
    onAttendeeChange([]);
    onDateRangeChange(null, null);
    onCalendarFilterChange(calendars.map(cal => cal.google_calendar_id));
  };

  const hasActiveFilters = 
    selectedCategories.length > 0 || 
    selectedAttendees.length > 0 || 
    startDate || 
    endDate || 
    selectedCalendarIds.length < calendars.length;

  const allCalendarsSelected = selectedCalendarIds.length === calendars.length;
  const someCalendarsSelected = selectedCalendarIds.length > 0 && selectedCalendarIds.length < calendars.length;

  const filteredUsers = users;

  const toggleSection = (section: string) => {
    const newSections = new Set(activeFilterSections);
    if (newSections.has(section)) {
      newSections.delete(section);
    } else {
      newSections.add(section);
    }
    setActiveFilterSections(newSections);
  };

  // Get the date range display text
  const getDateRangeText = () => {
    if (!currentDate) return '';
    
    if (currentView === 'month') {
      return getVisibleMonths(currentDate);
    } else if (currentView === 'week') {
      return getWeekRange(currentDate);
    } else if (currentView === 'day') {
      return formatDayView(currentDate);
    } else if (currentView === 'list') {
      return getWeekRange(currentDate);
    } else if (currentView === 'gantt') {
      if (ganttTimeScale === 'day') {
        return formatDayView(currentDate);
      } else if (ganttTimeScale === 'week') {
        return getWeekRange(currentDate);
      } else {
        return `${MONTHS_ABBR[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
      }
    } else if (currentView === 'year') {
      const startMonth = currentDate.getMonth();
      const startYear = currentDate.getFullYear();
      const months = Math.max(1, yearMonthsPerPage);
      const endIndex = startMonth + months - 1;
      const endMonth = endIndex % 12;
      const wrapsYear = endIndex >= 12;
      if (wrapsYear) {
        return `${MONTHS_ABBR[startMonth]} ${startYear} - ${MONTHS_ABBR[endMonth]} ${startYear + 1}`;
      }
      return `${MONTHS_ABBR[startMonth]} - ${MONTHS_ABBR[endMonth]} ${startYear}`;
    }
    return getWeekRange(currentDate);
  };

  return (
    <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-3 mb-4">
      <div className="flex items-center gap-3">
        {/* Navigation Controls */}
        {onNavigatePrevious && onNavigateNext && onGoToToday && (
          <>
            <button
              onClick={onNavigatePrevious}
              className="p-2 hover:bg-gray-700 rounded-md transition-colors"
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4 text-text-primary" />
            </button>
            <button
              onClick={onGoToToday}
              className="inline-flex items-center gap-2 px-4 py-1 bg-background-primary hover:bg-gray-700 text-sm text-text-primary font-medium rounded-xl transition-colors"
            >
              Today
            </button>
            <button
              onClick={onNavigateNext}
              className="p-2 hover:bg-gray-700 rounded-md transition-colors"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4 text-text-primary" />
            </button>
            
            {/* Date Range Display */}
            <div className="text-sm font-medium text-text-primary px-2 border-l border-gray-600/30">
              {getDateRangeText()}
            </div>
          </>
        )}
        
        {/* Search Bar */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search events by title or description..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-3 py-1 bg-background-primary border border-gray-600/30 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
          />
        </div>

        {/* All-day Checkbox - Inline (to right of search, left of View Tasks) */}
        <label className="flex items-center gap-2 whitespace-nowrap">
          <input
            type="checkbox"
            checked={localAllDayOnly}
            onChange={(e) => handleAllDayToggle(e.target.checked)}
            className="w-4 h-4 text-gray-700 bg-background-primary border-gray-600 rounded focus:ring-gray-700 focus:ring-2"
          />
          <span className="text-sm text-text-primary">All-day</span>
        </label>

        {/* Tasks Checkbox - Inline */}
        <label className="flex items-center gap-2 whitespace-nowrap">
          <input
            type="checkbox"
            checked={localShowTasks}
            onChange={(e) => handleShowTasksToggle(e.target.checked)}
            className="w-4 h-4 text-gray-700 bg-background-primary border-gray-600 rounded focus:ring-gray-700 focus:ring-2"
          />
          <span className="text-sm text-text-primary">Tasks</span>
        </label>

        {/* Filter Button */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={async () => {
              // Fetch fresh categories when opening filter
              if (!showFilterDropdown) {
                try {
                  const cats = await CategoriesClient.getCategories('calendar');
                  
                  // Create a mapping of category names to enum values
                  const categoryEnumMapping: Record<string, CalendarEventCategory> = {
                    'health': 'medical',
                    'medical': 'medical',
                    'personal': 'personal',
                    'work': 'work',
                    'family': 'family',
                    'family event': 'family',
                    'travel': 'travel',
                    'school': 'school',
                    'j3 academics': 'education',
                    'education': 'education',
                    'pets': 'pets',
                    'pet care': 'pets',
                    'financial': 'financial',
                    'household': 'household',
                    'legal': 'legal',
                    'administrative': 'administrative',
                    'meeting': 'work',
                    'appointment': 'medical',
                    'other': 'other'
                  };
                  
                  // Map categories to use enum values as IDs
                  const mappedCategories = cats.map(cat => {
                    const lowerName = cat.name.toLowerCase();
                    const enumValue = categoryEnumMapping[lowerName] || 'other';
                    return {
                      ...cat,
                      id: enumValue, // Use the enum value as the ID for filtering
                      originalId: cat.id // Keep original ID if needed
                    };
                  });
                  
                  // Remove duplicates based on the mapped enum value
                  const uniqueCategories = Array.from(
                    new Map(mappedCategories.map(cat => [cat.id, cat])).values()
                  );
                  
                  setDynamicCategories(uniqueCategories as Category[]);
                } catch (error) {
                  console.error('Error refreshing calendar categories:', error);
                }
              }
              if (!showFilterDropdown) {
                // Expand Calendars by default when opening
                setActiveFilterSections(new Set(['calendars']));
                setShowFilterDropdown(true);
              } else {
                setShowFilterDropdown(false);
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-1 rounded-xl border border-gray-600/30 bg-background-primary text-text-muted hover:text-text-primary hover:bg-gray-700/20 transition-colors"
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
          </button>

          {/* Filter Dropdown */}
          {showFilterDropdown && (
            <div className="absolute right-0 mt-2 w-96 bg-background-primary border border-gray-600/30 rounded-lg shadow-lg z-50 max-h-[600px] overflow-y-auto">
              <div className="p-4">

                {/* Person Filter */}
                <div className="mb-4">
                  <button
                    onClick={() => toggleSection('attendee')}
                    className="w-full flex items-center justify-between text-sm font-medium text-text-primary mb-2"
                  >
                    <span>Filter by</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${activeFilterSections.has('attendee') ? 'rotate-180' : ''}`} />
                  </button>
                  {activeFilterSections.has('attendee') && (
                    <div className="space-y-2">
                      {!loadingMembers ? (
                        familyMembers.map(member => (
                          <label
                            key={member.id}
                            className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-gray-700/20 transition-colors cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedAttendees.includes(member.id)}
                              onChange={() => handleAttendeeToggle(member.id)}
                              className="w-4 h-4 text-blue-500 bg-background-primary border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                            />
                            <span className="text-sm text-text-primary">
                              {member.display_name || member.name}
                            </span>
                          </label>
                        ))
                      ) : (
                        <div className="text-sm text-text-muted px-2 py-2">Loading family members...</div>
                      )}
                      {familyMembers.length === 0 && !loadingMembers && (
                        <div className="text-sm text-text-muted px-2 py-2">No family members found</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Date Range Filter */}
                <div className="mb-4">
                  <button
                    onClick={() => toggleSection('dateRange')}
                    className="w-full flex items-center justify-between text-sm font-medium text-text-primary mb-2"
                  >
                    <span>Date Range</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${activeFilterSections.has('dateRange') ? 'rotate-180' : ''}`} />
                  </button>
                  {activeFilterSections.has('dateRange') && (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          handleDateRangeChange();
                        }}
                        className="flex-1 px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                      />
                      <span className="text-text-muted text-sm">to</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => {
                          setEndDate(e.target.value);
                          handleDateRangeChange();
                        }}
                        min={startDate}
                        className="flex-1 px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                      />
                    </div>
                  )}
                </div>

                {/* Categories */}
                <div className="mb-4">
                  <button
                    onClick={() => toggleSection('category')}
                    className="w-full flex items-center justify-between text-sm font-medium text-text-primary mb-2"
                  >
                    <span>Categories</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${activeFilterSections.has('category') ? 'rotate-180' : ''}`} />
                  </button>
                  {activeFilterSections.has('category') && (
                    <div>
                      <div className="mb-3 flex flex-wrap gap-2">
                        {!loadingCategories && dynamicCategories.map(cat => (
                          <button
                            key={cat.id}
                            onClick={() => handleCategoryToggle(cat.id as CalendarEventCategory)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all ${
                              selectedCategories.includes(cat.id as CalendarEventCategory)
                                ? 'border-gray-500 bg-gray-700/30'
                                : 'border-gray-600/30 hover:border-gray-500'
                            }`}
                          >
                            <span className="text-xs text-text-primary">{cat.name}</span>
                            {selectedCategories.includes(cat.id as CalendarEventCategory) && (
                              <Check className="h-3 w-3 text-green-500" />
                            )}
                          </button>
                        ))}
                      </div>
                      {loadingCategories && (
                        <div className="text-sm text-text-muted">Loading categories...</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Calendars (bottom) */}
                <div className="mb-4">
                  <button
                    onClick={() => toggleSection('calendars')}
                    className="w-full flex items-center justify-between text-sm font-medium text-text-primary mb-2"
                  >
                    <span>Calendars</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${activeFilterSections.has('calendars') ? 'rotate-180' : ''}`} />
                  </button>
                  {activeFilterSections.has('calendars') && (
                    <div className="space-y-2">
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
                  )}
                </div>

                {/* Clear Filters */}
                {hasActiveFilters && (
                  <div className="pt-4 border-t border-gray-600/30">
                    <button
                      onClick={clearAllFilters}
                      className="w-full flex items-center justify-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors"
                    >
                      <X className="h-4 w-4" />
                      Clear all filters
                    </button>
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
