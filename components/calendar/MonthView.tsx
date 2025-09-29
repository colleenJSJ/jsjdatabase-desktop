'use client';

import { useState, useRef, useMemo, useCallback } from 'react';
import { CalendarEvent, CalendarEventCategory } from '@/lib/supabase/types';
import { Category } from '@/lib/categories/categories-client';
import { Plus } from 'lucide-react';
import { parseDateFlexible, eventOverlapsDate, formatDateForStorage, getEventRangeLocal, getEventTimeZone, toInstantFromNaive, getZonedParts } from '@/lib/utils/date-utils';
import { usePreferences } from '@/contexts/preferences-context';
import { getEventColor } from '@/lib/utils/event-colors';
import { normalizeRichText } from '@/lib/utils/text';
import { LinkifiedText } from '@/components/ui/LinkifiedText';
import { ViewEditEventModal } from './ViewEditEventModal';
import { useCalendarRangeSelection } from '@/hooks/useCalendarRangeSelection';
import { calculateTooltipPosition } from '@/lib/utils/tooltip';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  categories: Category[];
  googleCalendars?: any[];
  user: { role: string } | null;
  setSelectedDate: (date: Date | null) => void;
  setShowCreateModal: (show: boolean) => void;
  onEventsChange: () => void;
  onRangeSelect?: (range: { start: Date; end: Date; isAllDay: boolean }) => void;
}

interface EventSegment {
  event: CalendarEvent;
  startDay: number; // 0-6 within the week
  endDay: number;   // 0-6 within the week
  row: number;      // vertical position within the week
  isStart: boolean; // true if this is the start of the event
  isEnd: boolean;   // true if this is the end of the event
}

export function MonthView({
  currentDate,
  events,
  categories,
  googleCalendars = [],
  user,
  setSelectedDate,
  setShowCreateModal,
  onEventsChange,
  onRangeSelect
}: MonthViewProps) {
  const { preferences } = usePreferences();
  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null);
  const [dragOverDate, setDragOverDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [hoveredEvent, setHoveredEvent] = useState<CalendarEvent | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const draggedElementRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Memoized calendar map for fast lookups
  const calById = useMemo(() => {
    const m = new Map<string, any>();
    (googleCalendars || []).forEach((c: any) => m.set(c.google_calendar_id || c.id, c));
    return m;
  }, [googleCalendars]);

  // Initialize range selection hook
  const {
    isSelecting,
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp,
    isDateInSelection,
    isSelectionStart,
    isSelectionEnd
  } = useCalendarRangeSelection({
    onRangeSelect: onRangeSelect,
    disabled: !user || user.role !== 'admin' // Only admins can create events
  });

  // Calculate month view grid for the current month
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  // Build the visible month grid anchored to the viewer's timezone
  const viewerParts = getZonedParts(currentDate, preferences.timezone);
  const vYear = viewerParts.year;
  const vMonth = viewerParts.month; // 1-12
  // First of month (viewer tz midnight instant)
  const firstOfMonthNaive = `${vYear}-${String(vMonth).padStart(2,'0')}-01T00:00:00`;
  const firstOfMonthInstant = toInstantFromNaive(firstOfMonthNaive, preferences.timezone);
  // Day of week for the first (0=Sun)
  const firstDayOfWeek = new Date(vYear, vMonth - 1, 1).getDay();
  // Days in viewer month
  const daysInMonth = new Date(vYear, vMonth, 0).getDate();
  const weeksCount = Math.ceil((firstDayOfWeek + daysInMonth) / 7);
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
  const firstVisibleInstant = addDays(firstOfMonthInstant, -firstDayOfWeek);
  const days = Array.from({ length: weeksCount * 7 }, (_, i) => addDays(firstVisibleInstant, i));

  // Process events into week segments for continuous display
  const weekSegments = useMemo(() => {
    const weeks: EventSegment[][] = [];
    
    // Process each week
    for (let weekIdx = 0; weekIdx < weeksCount; weekIdx++) {
      const weekStart = days[weekIdx * 7];
      const weekEnd = days[weekIdx * 7 + 6];
      // Make the week window inclusive of the entire last day to ensure
      // timed events on that day (e.g., Saturday afternoon) are included
      const weekStartInclusive = weekStart; // already viewer tz midnight instant
      const weekEndInclusive = weekEnd;     // viewer tz midnight instant of last day
      const weekSegments: EventSegment[] = [];
      
      // Find all events that overlap this week
      events.forEach(event => {
        const evTz = getEventTimeZone(event, googleCalendars, calById);
        // Convert to true instants
        const startInstant = toInstantFromNaive(event.start_time, evTz);
        let endInstant = toInstantFromNaive(event.end_time, evTz);

        if (event.all_day) {
          endInstant = new Date(endInstant.getTime() - 1);
        }
        // Convert instants to viewer timezone Y/M/D
        const startP = getZonedParts(startInstant, preferences.timezone);
        const endP = getZonedParts(endInstant, preferences.timezone);
        const wStartP = getZonedParts(weekStartInclusive, preferences.timezone);
        const wEndP = getZonedParts(weekEndInclusive, preferences.timezone);
        const toMid = (p: any) => new Date(p.year, p.month - 1, p.day, 0, 0, 0, 0);
        const sD = toMid(startP), eD = toMid(endP), wsD = toMid(wStartP), weD = toMid(wEndP);
        if (eD < wsD || sD > weD) return; // no overlap in viewer tz
        const dayMs = 24 * 60 * 60 * 1000;
        const startIdxRaw = Math.floor((sD.getTime() - wsD.getTime()) / dayMs);
        const endIdxRaw = event.all_day ? Math.floor((eD.getTime() - wsD.getTime()) / dayMs) : startIdxRaw;
        const startDayIdx = Math.max(0, Math.min(6, startIdxRaw));
        const endDayIdx = Math.max(0, Math.min(6, endIdxRaw));
        weekSegments.push({
          event,
          startDay: startDayIdx,
          endDay: endDayIdx,
          row: 0,
          isStart: sD >= wsD,
          isEnd: eD <= weD
        });
      });
      
      // Sort segments by start day, then by duration (longer events first)
      weekSegments.sort((a, b) => {
        if (a.startDay !== b.startDay) return a.startDay - b.startDay;
        return (b.endDay - b.startDay) - (a.endDay - a.startDay);
      });
      
      // Assign rows to avoid overlaps
      const occupiedSlots: boolean[][] = [];
      weekSegments.forEach(segment => {
        let row = 0;
        
        // Find the first available row
        while (true) {
          if (!occupiedSlots[row]) {
            occupiedSlots[row] = new Array(7).fill(false);
          }
          
          // Check if this row is available for the segment
          let available = true;
          for (let day = segment.startDay; day <= segment.endDay; day++) {
            if (occupiedSlots[row][day]) {
              available = false;
              break;
            }
          }
          
          if (available) {
            // Mark the slots as occupied
            for (let day = segment.startDay; day <= segment.endDay; day++) {
              occupiedSlots[row][day] = true;
            }
            segment.row = row;
            break;
          }
          
          row++;
        }
      });
      
      weeks.push(weekSegments);
    }
    
    return weeks;
  }, [events, days]);

  const isToday = (instant: Date) => {
    const p1 = getZonedParts(instant, preferences.timezone);
    const p2 = getZonedParts(new Date(), preferences.timezone);
    return p1.year === p2.year && p1.month === p2.month && p1.day === p2.day;
  };

  const isCurrentMonth = (instant: Date) => {
    const p = getZonedParts(instant, preferences.timezone);
    return p.month === vMonth && p.year === vYear;
  };

  const getEventDisplayColor = (event: CalendarEvent) => {
    // Use the getEventColor utility which handles Google Calendar colors
    return getEventColor(event, googleCalendars, calById);
  };

  const handleDragStart = (event: CalendarEvent, e: React.DragEvent) => {
    setDraggedEvent(event);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedEvent(null);
    setDragOverDate(null);
  };

  const handleDragOver = (date: Date, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(date);
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = async (date: Date, e: React.DragEvent) => {
    e.preventDefault();
    
    if (!draggedEvent) return;
    
    // Calculate the day difference
    const originalStart = parseDateFlexible(draggedEvent.start_time);
    const originalEnd = parseDateFlexible(draggedEvent.end_time);
    const dayDiff = Math.floor((date.getTime() - originalStart.getTime()) / (1000 * 60 * 60 * 24));
    
    // Update the event dates
    const newStart = new Date(originalStart);
    newStart.setDate(originalStart.getDate() + dayDiff);
    
    const newEnd = new Date(originalEnd);
    newEnd.setDate(originalEnd.getDate() + dayDiff);
    
    // Update the event in the database
    try {
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.patch(`/api/calendar-events/${draggedEvent.id}`, {
        start_time: formatDateForStorage(newStart),
        end_time: formatDateForStorage(newEnd)
      });
      if (response.success) {
        onEventsChange();
      }
    } catch (error) {
      console.error('Failed to update event:', error);
    }
    
    handleDragEnd();
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setShowEventModal(true);
  };

  const handleEventMouseEnter = useCallback((event: CalendarEvent, e: React.MouseEvent) => {
    setHoveredEvent(event);
    
    // Initial position at mouse cursor
    setTooltipPosition({
      left: e.clientX + 10,
      top: e.clientY + 10
    });
    
    // React synthetic events are pooled; capture values now for async use
    const capturedTargetRect = (e.currentTarget as HTMLElement)?.getBoundingClientRect?.();
    const capturedMouse = { x: e.clientX, y: e.clientY };

    // Calculate proper position after tooltip renders
    requestAnimationFrame(() => {
      if (!tooltipRef.current || !capturedTargetRect) return;
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const position = calculateTooltipPosition({
        targetRect: capturedTargetRect,
        tooltipRect,
        mousePosition: capturedMouse,
        preferredPlacement: 'auto',
        gap: 8
      });
      setTooltipPosition(position);
    });
  }, []);

  const handleEventMouseMove = useCallback((e: React.MouseEvent) => {
    if (!hoveredEvent || !tooltipRef.current) return;
    
    const gap = 10;
    const tooltipWidth = 256; // w-64
    const tooltipHeight = tooltipRef.current.offsetHeight || 150;
    
    let left = e.clientX + gap;
    let top = e.clientY + gap;
    
    // Adjust position to keep tooltip in viewport
    if (left + tooltipWidth > window.innerWidth - gap) {
      left = e.clientX - tooltipWidth - gap;
    }
    if (top + tooltipHeight > window.innerHeight - gap) {
      top = e.clientY - tooltipHeight - gap;
    }
    if (left < gap) left = gap;
    if (top < gap) top = gap;
    
    setTooltipPosition({ left, top });
  }, [hoveredEvent]);

  const handleEventMouseLeave = useCallback(() => {
    setHoveredEvent(null);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0 border-b border-gray-600 flex-shrink-0">
        {WEEKDAYS.map(day => (
          <div key={day} className="text-center py-2 text-xs font-medium text-gray-400">
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar grid - 6 weeks */}
      <div className="flex-1 flex flex-col">
        {Array.from({ length: weeksCount }, (_, i) => i).map(weekIdx => {
          const weekStartIdx = weekIdx * 7;
          const currentWeekSegments = weekSegments[weekIdx] || [];
          const maxRow = Math.max(0, ...currentWeekSegments.map(s => s.row));
          const eventHeight = 20; // Height of each event bar in pixels
          const topOffset = 32; // px reserved above events (top-8)
          const baseMin = 100; // base minimum height
          const dynamicMin = topOffset + (maxRow + 1) * (eventHeight + 2) + 16; // add small padding
          const minHeight = Math.max(baseMin, dynamicMin);
          
          return (
            <div key={weekIdx} className={`relative ${weekIdx < 5 ? 'border-b' : ''} border-gray-600 flex-1`} style={{ minHeight: `${minHeight}px` }}>
              {/* Day cells */}
              <div className="h-full grid grid-cols-7">
                {[0, 1, 2, 3, 4, 5, 6].map(dayIdx => {
                  const day = days[weekStartIdx + dayIdx];
                  const isCurrentMonthDay = isCurrentMonth(day);
                  const isTodayDate = isToday(day);
                  const isDragOver = dragOverDate?.toDateString() === day.toDateString();
                  
                  const isInSelection = isDateInSelection(day);
                  const isStartOfSelection = isSelectionStart(day);
                  const isEndOfSelection = isSelectionEnd(day);
                  
                  // Determine background color based on selection state
                  let backgroundColor = !isCurrentMonthDay ? '#30302e' : '#575553';
                  if (isDragOver) {
                    backgroundColor = 'rgba(30, 58, 138, 0.2)';
                  } else if (isInSelection) {
                    backgroundColor = 'rgba(59, 130, 246, 0.3)'; // Blue selection color
                  }
                  
                  return (
                    <div
                      key={dayIdx}
                      className={`relative border-r border-gray-600 ${dayIdx === 6 ? 'border-r-0' : ''} ${
                        isSelecting ? 'select-none' : ''
                      } ${
                        isInSelection ? 'ring-1 ring-blue-500 ring-inset' : ''
                      }`}
                      style={{ backgroundColor }}
                      onMouseDown={(e) => {
                        if (user?.role === 'admin' && !draggedEvent) {
                          e.preventDefault();
                          handleMouseDown(day, true);
                        }
                      }}
                      onMouseEnter={() => {
                        if (isSelecting) {
                          handleMouseEnter(day);
                        }
                      }}
                      onMouseUp={() => {
                        if (isSelecting) {
                          handleMouseUp(day);
                        }
                      }}
                      onDragOver={(e) => handleDragOver(day, e)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(day, e)}
                    >
                      <div className="flex items-start justify-between p-1">
                        <span className={`text-xs font-medium ${
                          isTodayDate 
                            ? 'text-blue-500 font-bold' 
                            : isCurrentMonthDay 
                              ? 'text-white' 
                              : 'text-neutral-400'
                        }`}>
                          {getZonedParts(day, preferences.timezone).day}
                        </span>
                        {user?.role === 'admin' && !isSelecting && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDate(day);
                              setShowCreateModal(true);
                            }}
                            className="p-0.5 hover:bg-gray-700/30 rounded transition-colors group opacity-0 hover:opacity-100"
                            title="Add event"
                          >
                            <Plus className="h-3 w-3 text-gray-400 group-hover:text-white" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Event bars - positioned absolutely across the week */}
              <div className="absolute inset-x-0 top-8 px-0.5" style={{ pointerEvents: 'none' }}>
                {currentWeekSegments.map((segment, segmentIdx) => {
                  const leftPercent = (segment.startDay / 7) * 100;
                  // Timed events should render like Google: a single-day entry with a dot + title
                  const daySpan = segment.event.all_day ? (segment.endDay - segment.startDay + 1) : 1;
                  const widthPercent = (daySpan / 7) * 100;
                  const topPosition = segment.row * (eventHeight + 2);
                  const eventColor = getEventDisplayColor(segment.event);
                  
                  return (
                    <div
                      key={`${segment.event.id}-${segmentIdx}`}
                      className="absolute"
                      style={{
                        left: `${leftPercent}%`,
                        width: `calc(${widthPercent}% - 4px)`,
                        top: `${topPosition}px`,
                        height: `${eventHeight}px`,
                        pointerEvents: 'auto',
                        marginLeft: segment.isStart ? '2px' : '0',
                        marginRight: segment.isEnd ? '2px' : '0'
                      }}
                      draggable={user?.role === 'admin'}
                      onDragStart={(e) => handleDragStart(segment.event, e)}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleEventClick(segment.event)}
                      onMouseEnter={(e) => handleEventMouseEnter(segment.event, e)}
                      onMouseMove={handleEventMouseMove}
                      onMouseLeave={handleEventMouseLeave}
                    >
                      <div 
                        className={`h-full px-1 text-xs flex items-center cursor-pointer hover:opacity-90 transition-opacity ${
                          !segment.isStart ? 'rounded-l-none' : 'rounded-l'
                        } ${
                          !segment.isEnd ? 'rounded-r-none' : 'rounded-r'
                        } ${
                          draggedEvent?.id === segment.event.id ? 'opacity-50' : ''
                        }`}
                        style={{
                          backgroundColor: segment.event.all_day ? eventColor : 'transparent',
                          color: segment.event.all_day ? '#fff' : undefined,
                          // No border for timed (dot) events per UX refinement
                          borderLeft: !segment.isStart ? 'none' : undefined,
                          borderRight: !segment.isEnd ? 'none' : undefined
                        }}
                        aria-label={`${segment.event.title}${segment.event.location ? ` - ${segment.event.location}` : ''}`}
                      >
                        <span className="truncate font-medium flex items-center gap-1">
                          {!segment.event.all_day && (
                            <span
                              className="w-2 h-2 min-w-[8px] min-h-[8px] rounded-full border border-white/40 flex-none"
                              style={{ backgroundColor: eventColor, display: 'inline-block' }}
                            />
                          )}
                          {segment.isStart ? (
                            <>
                              {!segment.event.all_day && (
                                <span className="mr-1 opacity-75">
                                  {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: preferences.timezone })
                                    .format(toInstantFromNaive(segment.event.start_time, getEventTimeZone(segment.event, googleCalendars, calById)))}
                                </span>
                              )}
                              {segment.event.title}
                            </>
                          ) : (
                            <span className="opacity-75">← {segment.event.title}</span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Tooltip */}
      {hoveredEvent && (
        <div
          ref={tooltipRef}
          className="fixed z-[100] w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-3 pointer-events-none"
          style={{
            position: 'fixed',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            visibility: tooltipPosition.top === 0 && tooltipPosition.left === 0 ? 'hidden' : 'visible'
          }}
        >
          <h4 className="font-medium text-white mb-1">{hoveredEvent.title}</h4>
          {hoveredEvent.description && (
            <LinkifiedText text={normalizeRichText(hoveredEvent.description)} className="text-sm text-gray-300 mb-2 line-clamp-3" />
          )}
          <div className="space-y-1 text-xs text-gray-400">
            <div>
              Time: {hoveredEvent.all_day ? 'All day' : parseDateFlexible(hoveredEvent.start_time).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
            </div>
            <div>
              Calendar: {(() => {
                const cal = hoveredEvent.google_calendar_id ? calById.get(hoveredEvent.google_calendar_id) : undefined;
                return cal?.name || 'Not synced';
              })()}
            </div>
            {(hoveredEvent as any).meeting_link && (
              <div>
                Join: <a href={(hoveredEvent as any).meeting_link} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">link</a>
              </div>
            )}
            {hoveredEvent.location && (
              <div>Location: {hoveredEvent.location}</div>
            )}
            {hoveredEvent.attendees && hoveredEvent.attendees.length > 0 && (
              <div>Attendees: {hoveredEvent.attendees.length} people</div>
            )}
          </div>
          <div className="mt-2 text-xs text-gray-500">Click to edit</div>
        </div>
      )}

      {/* Event View/Edit Modal */}
      {showEventModal && selectedEvent && (
        <ViewEditEventModal
          event={selectedEvent}
          categories={categories}
          onClose={() => {
            setShowEventModal(false);
            setSelectedEvent(null);
          }}
          onEventUpdated={() => onEventsChange()}
          onEventsChange={() => {
            onEventsChange();
            setShowEventModal(false);
            setSelectedEvent(null);
          }}
        />
      )}
    </div>
  );
}
