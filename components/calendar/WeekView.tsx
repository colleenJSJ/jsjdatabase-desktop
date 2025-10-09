'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { CalendarEvent, CalendarEventCategory } from '@/lib/supabase/types';
import { Category } from '@/lib/categories/categories-client';
import { Plus } from 'lucide-react';
import { calculateTooltipPosition } from '@/lib/utils/tooltip';
import { usePreferences } from '@/contexts/preferences-context';
import { parseDateFlexible, eventOverlapsHour, eventOverlapsDate, formatDateForStorage, getEventRangeLocal, getEventTimeZone, formatInTimeZone, isEventOnDayInViewerTZ, getStartEndMinutesOnDayInViewerTZ, getZonedParts } from '@/lib/utils/date-utils';
import { startOfWeek, addWeeks, format, isSameMonth } from 'date-fns';
import { ViewEditEventModal } from './ViewEditEventModal';
import { getEventColor } from '@/lib/utils/event-colors';
import { normalizeRichText } from '@/lib/utils/text';
import { LinkifiedText } from '@/components/ui/LinkifiedText';
import { useCalendarRangeSelection } from '@/hooks/useCalendarRangeSelection';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  categories: Category[];
  googleCalendars?: any[];
  user: { role: string } | null;
  setSelectedDate: (date: Date | null) => void;
  setShowCreateModal: (show: boolean) => void;
  onEventsChange: () => void;
  onRangeSelect?: (range: { start: Date; end: Date; isAllDay: boolean }) => void;
  forceOpenEventId?: string;
  onForceOpenHandled?: () => void;
}

export function WeekView({
  currentDate,
  events,
  categories,
  googleCalendars = [],
  user,
  setSelectedDate,
  setShowCreateModal,
  onEventsChange,
  onRangeSelect,
  forceOpenEventId,
  onForceOpenHandled
}: WeekViewProps) {
  const { preferences } = usePreferences();
  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null);
  const [dragOverCell, setDragOverCell] = useState<{ day: Date; hour: number } | null>(null);
  const [showEditModal, setShowEditModal] = useState<CalendarEvent | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updateTooltipPosition = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const tooltipEl = tooltipRef.current;
    if (!tooltipEl) return;

    const gap = 12;
    const width = tooltipEl.offsetWidth || 256;
    const height = tooltipEl.offsetHeight || 150;

    let left = event.clientX + gap;
    let top = event.clientY + gap;

    if (left + width > window.innerWidth - gap) {
      left = event.clientX - width - gap;
    }

    if (top + height > window.innerHeight - gap) {
      top = event.clientY - height - gap;
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = tooltipRef.current;
      if (!el) return;
      el.style.left = `${Math.max(gap, left)}px`;
      el.style.top = `${Math.max(gap, top)}px`;
    });
  }, []);

  // Memoized calendar map for fast lookups
  const calById = useMemo(() => {
    const m = new Map<string, any>();
    (googleCalendars || []).forEach((c: any) => m.set(c.google_calendar_id || c.id, c));
    return m;
  }, [googleCalendars]);

  useEffect(() => {
    if (!forceOpenEventId) return;
    const event = events.find(ev => ev.id === forceOpenEventId);
    if (!event) return;
    setShowEditModal(event);
    onForceOpenHandled?.();
  }, [forceOpenEventId, events, onForceOpenHandled]);

  // Show only the current week
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday

  // Generate days for current week only
  const weekDays = [] as Date[];
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + dayIndex);
    weekDays.push(day);
  }

  // Separate all-day events from timed events
  const allDayEvents = events.filter(event => event.all_day === true);
  const timedEvents = events.filter(event => !event.all_day);

  // Precompute positions per day in viewer timezone for performance
  const positionsByDay = useMemo(() => {
    const computeLayout = (items: Array<{ ev: CalendarEvent; startMin: number; endMin: number }>) => {
      const sorted = [...items]
        .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
        .map(item => ({ ...item }));

      type ActiveItem = { startMin: number; endMin: number; column: number; clusterId: number };
      const active: ActiveItem[] = [];
      const clusterMaxColumns = new Map<number, number>();
      let clusterId = 0;

      sorted.forEach(item => {
        for (let i = active.length - 1; i >= 0; i--) {
          if (active[i].endMin <= item.startMin) {
            active.splice(i, 1);
          }
        }

        if (active.length === 0) {
          clusterId += 1;
        }

        const usedColumns = new Set(active.map(a => a.column));
        let column = 0;
        while (usedColumns.has(column)) {
          column += 1;
        }

        const layoutItem: ActiveItem = {
          startMin: item.startMin,
          endMin: item.endMin,
          column,
          clusterId
        };

        (item as any).column = column;
        (item as any).clusterId = clusterId;

        active.push(layoutItem);

        const currentMax = clusterMaxColumns.get(clusterId) ?? 0;
        clusterMaxColumns.set(clusterId, Math.max(currentMax, active.length, column + 1));
      });

      return sorted.map(item => ({
        ...item,
        column: (item as any).column as number,
        columns: clusterMaxColumns.get((item as any).clusterId) ?? ((item as any).column + 1)
      }));
    };

    const base = getZonedParts(weekDays[0], preferences.timezone);
    const baseDate = new Date(base.year, base.month - 1, base.day, 0, 0, 0, 0);

    return weekDays.map((_, dayIndex) => {
      const targetDate = new Date(baseDate);
      targetDate.setDate(baseDate.getDate() + dayIndex);
      const raw = timedEvents.map(ev => {
        const evTz = getEventTimeZone(ev, googleCalendars, calById);
        if (!isEventOnDayInViewerTZ(ev.start_time, ev.end_time, evTz, targetDate, preferences.timezone)) {
          return null;
        }
        const { startMin, endMin } = getStartEndMinutesOnDayInViewerTZ(ev.start_time, ev.end_time, evTz, targetDate, preferences.timezone);
        if (endMin <= 0 || startMin >= 1440) return null;
        return {
          ev,
          startMin: Math.max(0, startMin),
          endMin: Math.min(1440, endMin)
        };
      }).filter(Boolean) as Array<{ ev: CalendarEvent; startMin: number; endMin: number }>;

      return computeLayout(raw);
    });
  }, [timedEvents, preferences.timezone, googleCalendars, calById, weekDays]);
  
  // Build all-day segments that can span multiple days across the current week
  type AllDaySegment = { event: CalendarEvent; startDay: number; endDay: number; row: number };
  const allDaySegments: AllDaySegment[] = (() => {
    const segments: AllDaySegment[] = [];
    const weekStartLocal = new Date(weekStart); weekStartLocal.setHours(0,0,0,0);
    const weekEndLocal = new Date(weekStart); weekEndLocal.setDate(weekStart.getDate() + 6); weekEndLocal.setHours(23,59,59,999);

    allDayEvents.forEach(event => {
      const { start: evStart, end: evEnd } = getEventRangeLocal(event);
      if (evEnd < weekStartLocal || evStart > weekEndLocal) return; // no overlap

      const clampedStart = evStart < weekStartLocal ? weekStartLocal : evStart;
      const clampedEnd = evEnd > weekEndLocal ? weekEndLocal : evEnd;

      const dayMs = 24 * 60 * 60 * 1000;
      const startDay = Math.max(0, Math.floor((clampedStart.getTime() - weekStartLocal.getTime()) / dayMs));
      const endDay = Math.min(6, Math.floor((clampedEnd.getTime() - weekStartLocal.getTime()) / dayMs));

      segments.push({ event, startDay, endDay, row: 0 });
    });

    // Assign rows to avoid overlaps
    const occupied: boolean[][] = [];
    segments.sort((a, b) => a.startDay - b.startDay || (b.endDay - b.startDay) - (a.endDay - a.startDay));
    segments.forEach(seg => {
      let r = 0;
      while (true) {
        if (!occupied[r]) occupied[r] = new Array(7).fill(false);
        let ok = true;
        for (let d = seg.startDay; d <= seg.endDay; d++) {
          if (occupied[r][d]) { ok = false; break; }
        }
        if (ok) {
          for (let d = seg.startDay; d <= seg.endDay; d++) occupied[r][d] = true;
          seg.row = r;
          break;
        }
        r++;
      }
    });
    return segments;
  })();

  const getEventsForDateTime = (date: Date, hour: number) => {
    return timedEvents.filter(event => {
      const s = parseDateFlexible(event.start_time);
      const e = parseDateFlexible(event.end_time);
      return eventOverlapsHour(s, e, date, hour) && eventOverlapsDate(s, e, date);
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const handleDragStart = (event: CalendarEvent, e: React.DragEvent) => {
    if (user?.role !== 'admin') return;
    
    setDraggedEvent(event);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', event.id);
  };

  const handleDragOver = (day: Date, hour: number, e: React.DragEvent) => {
    if (!draggedEvent || user?.role !== 'admin') return;
    
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCell({ day, hour });
  };

  const handleDragLeave = () => {
    setDragOverCell(null);
  };

  const handleDrop = async (day: Date, hour: number, e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedEvent || user?.role !== 'admin') return;

    // Calculate new start time
    const newStartTime = new Date(day);
    const originalStart = parseDateFlexible(draggedEvent.start_time);
    newStartTime.setHours(hour, originalStart.getMinutes(), 0, 0);

    // Calculate duration and new end time
    const duration = parseDateFlexible(draggedEvent.end_time).getTime() - parseDateFlexible(draggedEvent.start_time).getTime();
    const newEndTime = new Date(newStartTime.getTime() + duration);

    try {
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.put(`/api/calendar-events/${draggedEvent.id}`, {
        event: {
          ...draggedEvent,
          start_time: formatDateForStorage(newStartTime),
          end_time: formatDateForStorage(newEndTime)
        }
      });
      if (response.success) {
        onEventsChange();
      }
    } catch (error) {
      console.error('Error updating event:', error);
    }

    setDraggedEvent(null);
    setDragOverCell(null);
  };

  const handleDragEnd = () => {
    setDraggedEvent(null);
    setDragOverCell(null);
  };
  const getEventStyle = (event: CalendarEvent, cellDate: Date, cellHour: number) => {
    const eventStart = parseDateFlexible(event.start_time);
    const eventEnd = parseDateFlexible(event.end_time);
    const cellStart = new Date(cellDate);
    cellStart.setHours(cellHour, 0, 0, 0);
    const cellEnd = new Date(cellDate);
    cellEnd.setHours(cellHour + 1, 0, 0, 0);

    // Check if this is a point-in-time event (start === end)
    const isPointEvent = eventEnd <= eventStart;
    
    // Calculate position within the hour cell
    let startMinutes = 0;
    let endMinutes = 60;
    
    // If event starts within this cell
    if (eventStart >= cellStart && eventStart < cellEnd) {
      startMinutes = eventStart.getMinutes();
    }
    // If event starts before this cell
    else if (eventStart < cellStart) {
      startMinutes = 0;
    }
    // If event starts after this cell (shouldn't happen with proper filtering)
    else {
      startMinutes = 60;
    }
    
    // For point-in-time events, ensure minimum height
    if (isPointEvent) {
      // Point event: add 1 minute for visual representation
      if (eventStart >= cellStart && eventStart < cellEnd) {
        endMinutes = Math.min(startMinutes + 1, 60);
      }
    } else {
      // Regular event with duration
      // If event ends within this cell
      if (eventEnd > cellStart && eventEnd <= cellEnd) {
        endMinutes = eventEnd.getHours() === cellHour ? eventEnd.getMinutes() : 60;
      }
      // If event ends after this cell
      else if (eventEnd > cellEnd) {
        endMinutes = 60;
      }
      // If event ends before this cell (shouldn't happen with proper filtering)
      else {
        endMinutes = 0;
      }
    }
    
    const top = (startMinutes / 60) * 100;
    const height = Math.max(((endMinutes - startMinutes) / 60) * 100, 2); // Min 2% height for visibility

    // Add visual indicators for multi-day events
    const isFirstDay = eventStart.toDateString() === cellDate.toDateString();
    const isLastDay = eventEnd.toDateString() === cellDate.toDateString();
    const continuesFromPrevious = eventStart < cellStart && cellHour === 0;
    const continuesToNext = eventEnd > cellEnd && cellHour === 23;

    return {
      top: `${top}%`,
      height: `${height}%`,
      minHeight: '16px', // Ensure minimum height of 16px
      backgroundColor: getEventColor(event, googleCalendars),
      borderRadius: `${isFirstDay || cellHour === 0 ? '4px' : '0px'} ${isLastDay || cellHour === 23 ? '4px' : '0px'} ${isLastDay || cellHour === 23 ? '4px' : '0px'} ${isFirstDay || cellHour === 0 ? '4px' : '0px'}`,
      continuesFromPrevious,
      continuesToNext
    };
  };

  // Timezone labels and formatters
  const CR_TZ = 'America/Costa_Rica';
  const USER_TZ = preferences.timezone;
  const LABEL_COL_WIDTH = 120; // px

  const formatHourInTz = (baseDate: Date, hour: number, tz: string) => {
    const d = new Date(baseDate);
    d.setHours(hour, 0, 0, 0);
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: true, timeZone: tz }).format(d);
  };

  const getGmtLabel = (tz: string) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date());
    const name = parts.find(p => p.type === 'timeZoneName')?.value || '';
    const m = name.match(/GMT([+-]\d{1,2})/i) || name.match(/UTC([+-]\d{1,2})/i);
    if (m && m[1]) {
      const raw = m[1];
      const norm = /^[+-]\d$/.test(raw) ? `${raw[0]}0${raw[1]}` : raw;
      return `GMT${norm}`;
    }
    return name || 'GMT';
  };

  const CR_GMT = getGmtLabel(CR_TZ);
  const USER_GMT = getGmtLabel(USER_TZ);

  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="min-w-[800px] h-full flex flex-col">
          {/* Week header - fixed */}
          <div className="grid flex-shrink-0" style={{ gridTemplateColumns: `${LABEL_COL_WIDTH}px repeat(7, 1fr)` }}>
          <div className="p-2 text-sm font-medium text-text-muted border-b-2 border-gray-600/50 bg-[#30302e]">
            {/* Empty corner cell */}
          </div>
          {weekDays.map((day, dayIndex) => {
            const isTodayDate = isToday(day);
            return (
              <div
                key={dayIndex}
                className={`p-2 text-center border-l-2 border-b-2 border-gray-600/50 bg-[#30302e] relative`}
              >
                <div className={`text-sm font-medium ${
                  isTodayDate ? 'text-blue-500 font-bold' : 'text-text-primary'
                }`}>
                  {WEEKDAYS[day.getDay()]} {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* All-Day Events Section - fixed */}
        {allDaySegments.length > 0 && (() => {
          const rows = Math.max(0, ...allDaySegments.map(s => s.row)) + 1;
          return (
            <div className="border-b border-gray-600 bg-background-primary/30 flex-shrink-0">
              <div className="grid" style={{ gridTemplateColumns: `${LABEL_COL_WIDTH}px repeat(7, 1fr)` }}>
                {/* Label column */}
                <div className="p-2 text-xs text-text-muted text-center border-r-2 border-gray-600/30 bg-[#30302e]">
                  All Day
                </div>
                {/* Spanning container */}
                <div className="relative p-1" style={{ gridColumn: '2 / span 7' }}>
                  <div
                    className="grid gap-1"
                    style={{ gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: `repeat(${rows}, 22px)` }}
                  >
                    {allDaySegments.map((seg, idx) => (
                      <button
                        key={seg.event.id + '-' + idx}
                        className="rounded text-xs px-2 font-medium text-white truncate hover:opacity-90 cursor-pointer"
                        style={{
                          gridColumn: `${seg.startDay + 1} / span ${seg.endDay - seg.startDay + 1}`,
                          gridRow: `${seg.row + 1}`,
                          backgroundColor: getEventColor(seg.event, googleCalendars)
                        }}
                        onMouseEnter={(e) => {
                          setHoveredEventId(seg.event.id);
                          updateTooltipPosition(e);
                        }}
                        onMouseMove={updateTooltipPosition}
                        onMouseLeave={() => setHoveredEventId(prev => (prev === seg.event.id ? null : prev))}
                        onClick={() => setShowEditModal(seg.event)}
                        aria-label={seg.event.title}
                      >
                        {seg.event.title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Timezone header row (below All Day) */}
        <div className="grid flex-shrink-0" style={{ gridTemplateColumns: `${LABEL_COL_WIDTH}px repeat(7, 1fr)` }}>
          <div className="p-1 text-[11px] text-text-muted border-b border-gray-600/50 bg-[#30302e] flex items-center justify-between">
            <span>{CR_GMT}</span>
            <span>{USER_GMT}</span>
          </div>
          <div className="border-b border-gray-600/50" style={{ gridColumn: '2 / span 7' }} />
        </div>

        {/* Time grid for current week - expandable */}
        <div className="flex-1 min-h-0 overflow-y-auto relative">
          {/* Background hour rows */}
          <div className="grid h-full" style={{ gridTemplateRows: `repeat(${HOURS.length}, 1fr)` }}>
            {HOURS.map(hour => (
              <div key={hour} className="grid border-b border-gray-600/30" style={{ gridTemplateColumns: `${LABEL_COL_WIDTH}px repeat(7, 1fr)` }}>
                <div className="flex items-center justify-between h-full px-2 text-xs text-text-muted bg-[#30302e] whitespace-nowrap gap-2">
                  <span>{formatHourInTz(currentDate, hour, CR_TZ)}</span>
                  <span>{hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}</span>
                </div>
                {weekDays.map((day, dayIndex) => {
                const isDragOver = dragOverCell?.day.toDateString() === day.toDateString() && 
                                 dragOverCell?.hour === hour;
                const isTodayDate = isToday(day);
                
                return (
                  <div
                    key={dayIndex}
                    className={`relative border-l-2 border-gray-600/30 ${
                      isDragOver ? 'bg-blue-900/20' : ''
                    } hover:bg-gray-700/10`}
                    style={{ 
                      backgroundColor: isTodayDate ? 'rgba(107, 114, 128, 0.2)' : '#575553'
                    }}
                    onDragOver={(e) => handleDragOver(day, hour, e)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(day, hour, e)}
                  >
                    {user?.role === 'admin' && (
                      <button
                        onClick={() => {
                          const newDate = new Date(day);
                          newDate.setHours(hour);
                          setSelectedDate(newDate);
                          setShowCreateModal(true);
                        }}
                        className="absolute inset-0 w-full h-full hover:bg-gray-700/10 transition-colors z-[1]"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          </div>

          {/* Timed events overlay: render once per day across full height */}
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
            <div className="grid h-full" style={{ gridTemplateColumns: `${LABEL_COL_WIDTH}px repeat(7, 1fr)` }}>
              <div />
              {weekDays.map((day, dayIndex) => {
                const eventsForDay = positionsByDay[dayIndex] || [];
                return (
                  <div key={dayIndex} className="relative" style={{ position: 'relative' }}>
                    {eventsForDay.map(({ ev, startMin, endMin, column, columns }) => {
                      const startMins = startMin;
                      const endMins = endMin;
                      const topPct = (startMins / 1440) * 100;
                      const heightPct = Math.max(((endMins - startMins) / 1440) * 100, 1.5);
                      const colCount = Math.max(columns || 1, 1);
                      const columnWidth = 100 / colCount;
                      const leftPct = columnWidth * column;
                      return (
                        <div
                          key={ev.id}
                          className="absolute px-1 text-xs text-white truncate cursor-pointer pointer-events-auto"
                          style={{
                            top: `${topPct}%`,
                            height: `${heightPct}%`,
                            left: `calc(${leftPct}% + 2px)`,
                            width: `calc(${columnWidth}% - 4px)`,
                            backgroundColor: getEventColor(ev, googleCalendars, calById),
                            borderRadius: 4
                          }}
                          onClick={() => setShowEditModal(ev)}
                          onMouseEnter={(e) => {
                            setHoveredEventId(ev.id);
                            updateTooltipPosition(e);
                          }}
                          onMouseMove={updateTooltipPosition}
                          onMouseLeave={() => setHoveredEventId(null)}
                        >
                          <div className="truncate font-medium">{ev.title}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current time indicator (red line) */}
          {(() => {
            // Compute current time and day in the viewer's selected timezone
            const now = new Date();
            const parts = getZonedParts(now, preferences.timezone);
            const mins = parts.hour * 60 + parts.minute;
            const topPct = (mins / 1440) * 100;
            const todayLocal = new Date(parts.year, parts.month - 1, parts.day);
            const dayIndex = weekDays.findIndex(d => d.toDateString() === todayLocal.toDateString());
            if (dayIndex === -1) return null;
            return (
              <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 3 }}>
                <div className="grid h-full" style={{ gridTemplateColumns: `${LABEL_COL_WIDTH}px repeat(7, 1fr)` }}>
                  <div />
                  {weekDays.map((d,i) => (
                    <div key={i} className="relative">
                      {i === dayIndex && (
                        <div className="absolute left-1 right-1 h-[2px] bg-red-500" style={{ top: `${topPct}%` }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <ViewEditEventModal
          event={showEditModal}
          categories={categories}
          onClose={() => setShowEditModal(null)}
          onEventUpdated={() => {
            setShowEditModal(null);
            onEventsChange();
          }}
          onEventsChange={onEventsChange}
        />
      )}

      {/* Hover Tooltip */}
      {hoveredEventId && (() => {
        const event = events.find(e => e.id === hoveredEventId);
        if (!event) return null;
        
        const eventTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: preferences.timezone }).format(parseDateFlexible(event.start_time));
        
        return (
          <div 
            ref={tooltipRef}
            className="fixed z-[100] w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-3 pointer-events-none"
            style={{
              position: 'fixed',
              top: `0px`,
              left: `0px`,
              visibility: 'visible'
            }}
          >
            <h4 className="font-medium text-white mb-1">{event.title}</h4>
            {event.description && (
              <LinkifiedText text={normalizeRichText(event.description)} className="text-sm text-gray-300 mb-2 line-clamp-3" />
            )}
            <div className="space-y-1 text-xs text-gray-400">
              <div>Time: {eventTime}</div>
              <div>
                Calendar: {(() => {
                  const cal = event.google_calendar_id ? calById.get(event.google_calendar_id) : undefined;
                  return cal?.name || 'Not synced';
                })()}
              </div>
            {(event as any).meeting_link && (
              <div>
                Join: <a href={(event as any).meeting_link} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">link</a>
              </div>
            )}
            {event.location && (
              <div>Location: {event.location}</div>
            )}
              {event.attendees && event.attendees.length > 0 && (
                <div>Attendees: {event.attendees.length} people</div>
              )}
            </div>
            <div className="mt-2 text-xs text-gray-500">Click to edit</div>
          </div>
        );
      })()}
    </div>
  );
}
