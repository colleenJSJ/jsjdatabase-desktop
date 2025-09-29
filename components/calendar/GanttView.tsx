'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { CalendarEvent, CalendarEventCategory } from '@/lib/supabase/types';
import { Category } from '@/lib/categories/categories-client';
import { Calendar, Clock, Users, MapPin, Plus, Minus } from 'lucide-react';
import { ViewEditEventModal } from './ViewEditEventModal';
import { UnifiedEventModal } from './UnifiedEventModal';
import { calculateTooltipPosition } from '@/lib/utils/tooltip';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isThisWeek, isThisMonth, isWithinInterval, differenceInMinutes, isSameDay, differenceInDays } from 'date-fns';
import { getEventColor } from '@/lib/utils/event-colors';
import { parseDateFlexible } from '@/lib/utils/date-utils';
import { normalizeRichText } from '@/lib/utils/text';
import { LinkifiedText } from '@/components/ui/LinkifiedText';

type TimeScale = 'day' | 'week' | 'month';

interface GanttViewProps {
  events: CalendarEvent[];
  categories: Category[];
  googleCalendars?: any[];
  user: { role: string } | null;
  onEventsChange: () => void;
  currentDate?: Date;
  timeScale?: TimeScale;
  onTimeScaleChange?: (timeScale: TimeScale) => void;
  onDateChange?: (date: Date) => void;
}

interface EventWithRow extends CalendarEvent {
  rowIndex: number;
  stackIndex: number;
  stackCount: number;
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  const hour = i === 0 ? 12 : i > 12 ? i - 12 : i;
  const period = i < 12 ? 'AM' : 'PM';
  return `${hour} ${period}`;
});

export function GanttView({ events, categories, googleCalendars = [], user, onEventsChange, currentDate: propCurrentDate, timeScale: propTimeScale, onTimeScaleChange, onDateChange }: GanttViewProps) {
  const [internalTimeScale, setInternalTimeScale] = useState<TimeScale>('week');
  const [internalCurrentDate, setInternalCurrentDate] = useState(new Date());
  const [columnScale, setColumnScale] = useState(1); // Magnification scale
  
  const SCALE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  
  // Use props if provided, otherwise use internal state
  const timeScale = propTimeScale || internalTimeScale;
  const currentDate = propCurrentDate || internalCurrentDate;
  
  const setTimeScale = (scale: TimeScale) => {
    if (onTimeScaleChange) {
      onTimeScaleChange(scale);
    } else {
      setInternalTimeScale(scale);
    }
  };
  
  const setCurrentDate = (date: Date) => {
    if (onDateChange) {
      onDateChange(date);
    } else {
      setInternalCurrentDate(date);
    }
  };
  const [columnWidth] = useState(60); // Only used for fallback
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDateTime, setSelectedDateTime] = useState<Date | null>(null);
  // Dragging removed per requirements
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [containerWidth, setContainerWidth] = useState(0);
  
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const [currentTimePosition, setCurrentTimePosition] = useState(0);

  // Memoized calendar map for fast lookups
  const calById = useMemo(() => {
    const m = new Map<string, any>();
    (googleCalendars || []).forEach((c: any) => m.set(c.google_calendar_id || c.id, c));
    return m;
  }, [googleCalendars]);

  // Get date range based on time scale
  const getDateRange = useCallback(() => {
    switch (timeScale) {
      case 'day':
        return {
          start: startOfDay(currentDate),
          end: endOfDay(currentDate),
          days: [currentDate]
        };
      case 'week':
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday
        return {
          start: weekStart,
          end: weekEnd,
          days: eachDayOfInterval({ start: weekStart, end: weekEnd })
        };
      case 'month':
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        return {
          start: monthStart,
          end: monthEnd,
          days: eachDayOfInterval({ start: monthStart, end: monthEnd })
        };
    }
  }, [currentDate, timeScale]);

  const dateRange = getDateRange();

  // Filter and process events
  const processedEvents = useCallback((): EventWithRow[] => {
    const filtered = events.filter(event => {
      const eventStart = parseDateFlexible(event.start_time);
      const eventEnd = parseDateFlexible(event.end_time);
      return isWithinInterval(eventStart, { start: dateRange.start, end: dateRange.end }) ||
             isWithinInterval(eventEnd, { start: dateRange.start, end: dateRange.end }) ||
             (eventStart <= dateRange.start && eventEnd >= dateRange.end);
    });

    // Sort events by start time
    filtered.sort((a, b) => parseDateFlexible(a.start_time).getTime() - parseDateFlexible(b.start_time).getTime());

    // Assign rows to events to handle overlaps
    const processedEvents: EventWithRow[] = [];
    const rows: { endTime: Date }[][] = [];

    filtered.forEach(event => {
      const eventStart = parseDateFlexible(event.start_time);
      const eventEnd = parseDateFlexible(event.end_time);
      
      let rowIndex = -1;
      let stackIndex = 0;
      
      // Find first available row
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let canFit = true;
        
        for (let j = 0; j < row.length; j++) {
          if (eventStart < row[j].endTime) {
            canFit = false;
            break;
          }
        }
        
        if (canFit) {
          rowIndex = i;
          stackIndex = row.filter(item => eventStart < item.endTime).length;
          break;
        }
      }
      
      // Create new row if needed
      if (rowIndex === -1) {
        rowIndex = rows.length;
        rows.push([]);
      }
      
      rows[rowIndex].push({ endTime: eventEnd });
      
      processedEvents.push({
        ...event,
        rowIndex,
        stackIndex,
        stackCount: 1
      });
    });

    return processedEvents;
  }, [events, dateRange]);

  const ganttEvents = processedEvents();
  

  // Synchronized scrolling
  const handleScroll = useCallback((e: Event) => {
    const target = e.target as HTMLDivElement;
    const scrollTop = target.scrollTop;
    
    if (leftPanelRef.current && rightPanelRef.current) {
      if (target === leftPanelRef.current) {
        rightPanelRef.current.scrollTop = scrollTop;
      } else if (target === rightPanelRef.current) {
        leftPanelRef.current.scrollTop = scrollTop;
      }
    }
  }, []);

  useEffect(() => {
    const leftPanel = leftPanelRef.current;
    const rightPanel = rightPanelRef.current;
    
    if (leftPanel && rightPanel) {
      leftPanel.addEventListener('scroll', handleScroll);
      rightPanel.addEventListener('scroll', handleScroll);
      
      return () => {
        leftPanel.removeEventListener('scroll', handleScroll);
        rightPanel.removeEventListener('scroll', handleScroll);
      };
    }
  }, [handleScroll]);

  // Update container width with ResizeObserver
  useEffect(() => {
    const container = timelineContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.unobserve(container);
      resizeObserver.disconnect();
    };
  }, []);

  // Function to get the number of columns based on time scale
  const getColumnCount = useCallback(() => {
    if (timeScale === 'day') return 24;
    if (timeScale === 'week') return 7;
    return dateRange.days.length;
  }, [timeScale, dateRange.days.length]);

  // Calculate column width based on container width and zoom
  const dynamicColumnWidth = useCallback(() => {
    if (!containerWidth) return 60; // Fallback while measuring
    
    const columnCount = getColumnCount();
    if (!columnCount) return 60;
    
    // At 100% zoom, columns should fit exactly within container
    const baseColumnWidth = containerWidth / columnCount;
    
    // Apply zoom scale for zooming functionality
    return baseColumnWidth * columnScale;
  }, [containerWidth, getColumnCount, columnScale]);

  const effectiveColumnWidth = dynamicColumnWidth();

  // Update current time indicator
  useEffect(() => {
    const updateCurrentTime = () => {
      const now = new Date();
      
      if (timeScale === 'day') {
        const startOfToday = startOfDay(now);
        const minutesSinceStart = differenceInMinutes(now, startOfToday);
        const positionPercentage = (minutesSinceStart / (24 * 60)) * 100;
        setCurrentTimePosition(positionPercentage);
      } else if (timeScale === 'week') {
        const weekStart = startOfWeek(now, { weekStartsOn: 0 });
        const minutesSinceWeekStart = differenceInMinutes(now, weekStart);
        const positionPercentage = (minutesSinceWeekStart / (7 * 24 * 60)) * 100;
        setCurrentTimePosition(positionPercentage);
      } else if (timeScale === 'month') {
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);
        const totalMinutes = differenceInMinutes(monthEnd, monthStart);
        const minutesSinceMonthStart = differenceInMinutes(now, monthStart);
        const positionPercentage = (minutesSinceMonthStart / totalMinutes) * 100;
        setCurrentTimePosition(positionPercentage);
      }
    };

    updateCurrentTime();
    const interval = setInterval(updateCurrentTime, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, [timeScale, currentDate]);

  // Calculate event position and width
  const getEventStyle = useCallback((event: EventWithRow) => {
    const eventStart = parseDateFlexible(event.start_time);
    const eventEnd = parseDateFlexible(event.end_time);
    
    let leftPercentage = 0;
    let widthPercentage = 0;
    
    if (timeScale === 'day') {
      // Calculate position based on hours for the current day
      const dayStart = startOfDay(currentDate);
      const dayEnd = endOfDay(currentDate);
      
      // Handle events that span multiple days
      const effectiveStart = eventStart < dayStart ? dayStart : eventStart;
      const effectiveEnd = eventEnd > dayEnd ? dayEnd : eventEnd;
      
      const minutesFromStart = differenceInMinutes(effectiveStart, dayStart);
      const duration = differenceInMinutes(effectiveEnd, effectiveStart);
      
      leftPercentage = (minutesFromStart / (24 * 60)) * 100;
      widthPercentage = Math.max((duration / (24 * 60)) * 100, 100 / 48); // Minimum 30 min width
    } else if (timeScale === 'week') {
      // Calculate position based on days
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday start
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
      
      // Handle events that span multiple weeks
      const effectiveStart = eventStart < weekStart ? weekStart : eventStart;
      const effectiveEnd = eventEnd > weekEnd ? weekEnd : eventEnd;
      
      // Calculate position
      const startDayIndex = differenceInDays(startOfDay(effectiveStart), weekStart);
      const endDayIndex = differenceInDays(startOfDay(effectiveEnd), weekStart);
      
      leftPercentage = (startDayIndex / 7) * 100;
      
      // Width spans from start to end day
      const daySpan = endDayIndex - startDayIndex + 1;
      widthPercentage = Math.max((daySpan / 7) * 100, 14.28); // Minimum 1 day width
    } else {
      // Month view
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      
      // Handle events that span multiple months
      const effectiveStart = eventStart < monthStart ? monthStart : eventStart;
      const effectiveEnd = eventEnd > monthEnd ? monthEnd : eventEnd;
      
      // Find which day of the month
      const startDayIndex = dateRange.days.findIndex(day => 
        isSameDay(day, startOfDay(effectiveStart))
      );
      const endDayIndex = dateRange.days.findIndex(day => 
        isSameDay(day, startOfDay(effectiveEnd))
      );
      
      if (startDayIndex !== -1) {
        leftPercentage = (startDayIndex / dateRange.days.length) * 100;
        
        // Width spans from start to end day
        const daySpan = endDayIndex !== -1 ? (endDayIndex - startDayIndex + 1) : 1;
        widthPercentage = Math.max((daySpan / dateRange.days.length) * 100, 100 / dateRange.days.length);
      } else {
        // Event is outside current month view
        leftPercentage = 0;
        widthPercentage = 0;
      }
    }
    
    const height = event.stackCount > 1 ? 36 / event.stackCount : 36;
    const top = 6 + (event.stackIndex * (height + 2));
    
    return {
      position: 'absolute' as const,
      left: `${leftPercentage}%`,
      width: `${widthPercentage}%`,
      height: `${height}px`,
      top: `${top}px`,
      backgroundColor: getEventColor(event, googleCalendars),
      opacity: 1
    };
  }, [timeScale, currentDate, dateRange]);

  // Navigation functions
  const navigatePrevious = () => {
    switch (timeScale) {
      case 'day':
        setCurrentDate(new Date(currentDate.getTime() - 24 * 60 * 60 * 1000));
        break;
      case 'week':
        setCurrentDate(new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000));
        break;
      case 'month':
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
        break;
    }
  };

  const navigateNext = () => {
    switch (timeScale) {
      case 'day':
        setCurrentDate(new Date(currentDate.getTime() + 24 * 60 * 60 * 1000));
        break;
      case 'week':
        setCurrentDate(new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000));
        break;
      case 'month':
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
        break;
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Zoom controls - disabled when using responsive layout
  const zoomIn = () => {
    // Zoom is now automatic based on container width
  };

  const zoomOut = () => {
    // Zoom is now automatic based on container width
  };

  // Drag and drop disabled

  // Handle double-click to create event
  const handleTimelineDoubleClick = (e: React.MouseEvent) => {
    if (user?.role !== 'admin') return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const xPercentage = (x / rect.width) * 100;
    
    let clickedTime: Date;
    
    if (timeScale === 'day') {
      const hour = Math.floor((xPercentage / 100) * 24);
      clickedTime = new Date(currentDate);
      clickedTime.setHours(hour, 0, 0, 0);
    } else if (timeScale === 'week') {
      const dayIndex = Math.floor((xPercentage / 100) * 7);
      if (dayIndex >= 0 && dayIndex < dateRange.days.length) {
        clickedTime = new Date(dateRange.days[dayIndex]);
        clickedTime.setHours(9, 0, 0, 0); // Default to 9 AM
      } else {
        return;
      }
    } else {
      const dayIndex = Math.floor((xPercentage / 100) * dateRange.days.length);
      if (dayIndex < dateRange.days.length) {
        clickedTime = new Date(dateRange.days[dayIndex]);
        clickedTime.setHours(9, 0, 0, 0);
      } else {
        return;
      }
    }
    
    setSelectedDateTime(clickedTime);
    setShowCreateModal(true);
  };

  // Tooltip positioning
  const updateTooltipPosition = useCallback((event: React.MouseEvent) => {
    if (!tooltipRef.current) return;

    const target = event.currentTarget as HTMLElement;
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    
    const position = calculateTooltipPosition({
      targetRect,
      tooltipRect,
      mousePosition,
      preferredPlacement: 'auto',
      gap: 8
    });
    
    setTooltipPosition(position);
  }, [mousePosition]);

  // Format time headers
  const getTimeHeaders = () => {
    if (timeScale === 'day') {
      return HOUR_LABELS;
    } else if (timeScale === 'week') {
      return dateRange.days.map(day => format(day, 'EEE d'));
    } else {
      return dateRange.days.map(day => format(day, 'd'));
    }
  };


  return (
    <div className="flex flex-col">
      {/* Controls - fixed */}
      <div className="bg-[#30302E] border border-gray-600/30 rounded-lg p-4 mb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Time scale selector */}
            <div className="flex items-center gap-1 bg-gray-800 rounded-md p-1">
              <button
                onClick={() => setTimeScale('day')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  timeScale === 'day' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => setTimeScale('week')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  timeScale === 'week' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setTimeScale('month')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  timeScale === 'month' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Month
              </button>
            </div>
            
            {/* Magnification controls */}
            <div className="flex items-center gap-2 bg-gray-800 rounded-md p-1">
              <button
                onClick={() => {
                  const currentIndex = SCALE_OPTIONS.indexOf(columnScale);
                  if (currentIndex > 0) {
                    setColumnScale(SCALE_OPTIONS[currentIndex - 1]);
                  }
                }}
                className="p-1 hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={columnScale === SCALE_OPTIONS[0]}
              >
                <Minus className="h-4 w-4 text-gray-400" />
              </button>
              
              <span className="text-sm text-gray-400 min-w-[3rem] text-center">
                {Math.round(columnScale * 100)}%
              </span>
              
              <button
                onClick={() => {
                  const currentIndex = SCALE_OPTIONS.indexOf(columnScale);
                  if (currentIndex < SCALE_OPTIONS.length - 1) {
                    setColumnScale(SCALE_OPTIONS[currentIndex + 1]);
                  }
                }}
                className="p-1 hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={columnScale === SCALE_OPTIONS[SCALE_OPTIONS.length - 1]}
              >
                <Plus className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            
            {/* View label */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">
                View: {timeScale === 'day' ? 'Hourly' : timeScale === 'week' ? 'Daily' : 'Monthly'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Gantt Chart - expandable */}
      <div className="relative w-full" style={{ height: 'calc(100vh - 16rem)', minHeight: '400px' }}>
        <div className="absolute inset-0 bg-[#575553] border border-gray-600/30 rounded-lg flex overflow-hidden">
        {/* Left Panel - Event List */}
        <div className="w-[20%] flex flex-col">
          {/* Header - fixed */}
          <div className="h-12 border-b border-gray-600/30 bg-[#30302E] px-4 flex items-center font-medium flex-shrink-0">
            Events
          </div>
          
          {/* Event rows - expandable */}
          <div ref={leftPanelRef} className="flex-1 min-h-0 overflow-y-auto">
            {ganttEvents.map((event, index) => (
              <div
                key={event.id}
                className={`h-12 flex items-center px-4 hover:bg-gray-700/40 cursor-pointer transition-colors ${
                  index % 2 === 0 ? 'bg-[#575553]' : 'bg-[#4A4847]'
                }`}
                onClick={() => setEditingEvent(event)}
              >
                <div
                  className="w-1 h-8 mr-3 rounded-full"
                  style={{ backgroundColor: getEventColor(event, googleCalendars) }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{event.title}</div>
                  <div className="text-xs text-gray-400">
                    {parseDateFlexible(event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    {event.all_day ? ' - All day' : ''}
                  </div>
                </div>
                {event.attendees && event.attendees.length > 0 && (
                  <div className="flex -space-x-2 ml-2">
                    {event.attendees.slice(0, 3).map((attendee, i) => (
                      <div
                        key={i}
                        className="w-6 h-6 rounded-full bg-gray-600 border border-gray-800 flex items-center justify-center text-xs"
                        title={attendee}
                      >
                        {attendee.charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {event.attendees.length > 3 && (
                      <div className="w-6 h-6 rounded-full bg-gray-700 border border-gray-800 flex items-center justify-center text-xs">
                        +{event.attendees.length - 3}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel - Timeline */}
        <div className="w-[80%] flex flex-col min-w-0 border-l-2 border-gray-500/60 relative">
          {/* Left-edge inner shadow/gutter */}
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-black/20 to-transparent z-20" />
          {/* Time headers - fixed */}
          <div className="h-12 border-b border-gray-600/30 bg-[#30302E] overflow-x-auto overflow-y-hidden relative z-30"
               onScroll={(e) => {
                 // Sync header scroll with content
                 if (rightPanelRef.current) {
                   rightPanelRef.current.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
                 }
               }}>
            <div 
              className="flex h-full"
              style={{ width: `${effectiveColumnWidth * getColumnCount()}px` }}
            >
              {getTimeHeaders().map((header, index) => (
                <div
                  key={index}
                  className="border-r border-gray-600/30 flex items-center justify-center text-xs text-gray-400"
                  style={{ width: `${effectiveColumnWidth}px` }}
                >
                  {header}
                </div>
              ))}
            </div>
          </div>
          
          {/* Timeline grid - expandable */}
          <div 
            ref={(el) => {
              rightPanelRef.current = el;
              timelineContainerRef.current = el;
            }}
            className="flex-1 overflow-auto relative"
            onDoubleClick={handleTimelineDoubleClick}
            onScroll={(e) => {
              // Sync content scroll with header
              const scrollLeft = (e.target as HTMLDivElement).scrollLeft;
              const headerEl = e.currentTarget.previousElementSibling as HTMLDivElement;
              if (headerEl) {
                headerEl.scrollLeft = scrollLeft;
              }
            }}
          >
            <div 
              ref={timelineRef}
              className="relative"
              style={{ 
                width: `${effectiveColumnWidth * getColumnCount()}px`,
                height: `${Math.max(ganttEvents.length * 48, 48)}px`
              }}
            >
              {/* Grid lines - using percentage-based positioning */}
              {Array.from({ length: getColumnCount() }, (_, i) => (
                <div
                  key={i}
                  className={`absolute top-0 bottom-0 border-r ${
                    timeScale === 'day' ? 'border-gray-500/50' : 'border-gray-600/30'
                  } ${
                    timeScale === 'month' && i % 7 === 0 ? 'border-r-2' : ''
                  } pointer-events-none z-10`}
                  style={{ 
                    left: `${i * effectiveColumnWidth}px`, 
                    width: `${effectiveColumnWidth}px` 
                  }}
                />
              ))}
              
              {/* Row backgrounds */}
              {ganttEvents.map((_, index) => (
                <div
                  key={index}
                  className={`absolute left-0 right-0 h-12 z-0 ${
                    index % 2 === 0 ? 'bg-[#575553]' : 'bg-[#4A4847]'
                  }`}
                  style={{ top: `${index * 48}px` }}
                />
              ))}
              
              {/* Event bars */}
              {ganttEvents.map((event, index) => (
                <div
                  key={event.id}
                  className="absolute left-0 right-0 h-12"
                  style={{ top: `${index * 48}px` }}
                >
                  <div
                    className={`rounded-md cursor-pointer hover:brightness-110 hover:shadow-lg transition-all flex items-center px-3 text-white text-xs font-medium shadow-md border border-white/20 relative z-20 max-w-full overflow-hidden`}
                    style={getEventStyle(event)}
                    onClick={() => setEditingEvent(event)}
                    onMouseEnter={(e) => {
                        const mouseX = e.clientX;
                        const mouseY = e.clientY;
                        
                        setHoveredEventId(event.id);
                        setMousePosition({ x: mouseX, y: mouseY });
                        
                        // Set initial position at mouse cursor
                        setTooltipPosition({
                          left: mouseX + 10,
                          top: mouseY + 10
                        });
                    }}
                    onMouseMove={(e) => {
                        const mouseX = e.clientX;
                        const mouseY = e.clientY;
                        setMousePosition({ x: mouseX, y: mouseY });
                        
                        if (hoveredEventId && tooltipRef.current) {
                          const tooltipWidth = 256; // w-64 = 16rem = 256px
                          const tooltipHeight = tooltipRef.current.offsetHeight || 200;
                          const gap = 10;
                          
                          let left = mouseX + gap;
                          let top = mouseY + gap;
                          
                          // Check right boundary
                          if (left + tooltipWidth > window.innerWidth - gap) {
                            left = mouseX - tooltipWidth - gap;
                          }
                          
                          // Check bottom boundary
                          if (top + tooltipHeight > window.innerHeight - gap) {
                            top = mouseY - tooltipHeight - gap;
                          }
                          
                          // Check left boundary
                          if (left < gap) left = gap;
                          
                          // Check top boundary
                          if (top < gap) top = gap;
                          
                          setTooltipPosition({ left, top });
                        }
                    }}
                    onMouseLeave={() => {
                      setHoveredEventId(null);
                    }}
                  >
                    <span className="truncate" title={event.title}>{event.title}</span>
                  </div>
                </div>
              ))}
              
              {/* Current time indicator */}
              {((timeScale === 'day' && isToday(currentDate)) ||
                (timeScale === 'week' && isThisWeek(currentDate, { weekStartsOn: 0 })) ||
                (timeScale === 'month' && isThisMonth(currentDate))) && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-10"
                  style={{ left: `${currentTimePosition}%` }}
                >
                  <div className="absolute -top-1 -left-1 w-2 h-2 bg-red-500 rounded-full" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Modals */}
      {editingEvent && (
        <ViewEditEventModal
          event={editingEvent}
          categories={categories}
          onClose={() => setEditingEvent(null)}
          onEventUpdated={() => {
            setEditingEvent(null);
            onEventsChange();
          }}
          onEventsChange={onEventsChange}
        />
      )}

      {showCreateModal && (
        <UnifiedEventModal
          categories={categories}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedDateTime(null);
          }}
          selectedDate={selectedDateTime || undefined}
          prefillData={selectedDateTime ? { startDate: selectedDateTime, endDate: selectedDateTime, isAllDay: false } : undefined}
          onEventCreated={() => {
            setShowCreateModal(false);
            setSelectedDateTime(null);
            onEventsChange();
          }}
        />
      )}

      {/* Tooltip */}
      {hoveredEventId && (() => {
        const event = events.find(e => e.id === hoveredEventId);
        if (!event) return null;
        
        return (
          <div 
            ref={tooltipRef}
            className="fixed z-[100] w-64 max-w-xs bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-3 pointer-events-none break-words"
            style={{
              position: 'fixed',
              top: `${tooltipPosition.top}px`,
              left: `${tooltipPosition.left}px`,
              visibility: tooltipPosition.top === 0 && tooltipPosition.left === 0 ? 'hidden' : 'visible'
            }}
          >
            <h4 className="font-medium text-white mb-2 break-words">{event.title}</h4>
            {event.description && (
              <LinkifiedText text={normalizeRichText(event.description)} className="text-sm text-gray-300 mb-2 line-clamp-3 break-words" />
            )}
            <div className="space-y-1 text-xs text-gray-400 break-words">
              <div className="flex items-center gap-1 break-words">
                <Clock className="w-3 h-3" />
                {`${parseDateFlexible(event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${parseDateFlexible(event.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`}
              </div>
              <div className="flex items-center gap-1 break-words">
                <Calendar className="w-3 h-3" />
                {parseDateFlexible(event.start_time).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
              {event.location && (
                <div className="flex items-center gap-1 break-words">
                  <MapPin className="w-3 h-3" />
                  {event.location}
                </div>
              )}
              {event.attendees && event.attendees.length > 0 && (
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {event.attendees.length} attendee{event.attendees.length > 1 ? 's' : ''}
                </div>
              )}
              <div className="mt-2 pt-2 border-t border-gray-700">
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium" 
                  style={{ 
                    backgroundColor: `${getEventColor(event, googleCalendars, calById)}20`,
                    color: getEventColor(event, googleCalendars, calById)
                  }}
                >
                  {(() => {
                    const cal = event.google_calendar_id ? calById.get(event.google_calendar_id) : undefined;
                    return cal?.name || 'Not synced';
                  })()}
                </span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
