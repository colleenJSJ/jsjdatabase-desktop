'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { CalendarEvent, CalendarEventCategory } from '@/lib/supabase/types';
import { Category } from '@/lib/categories/categories-client';
import { Plus } from 'lucide-react';
import { parseDateFlexible, getEventRangeLocal, getEventTimeZone, formatInTimeZone, eventOverlapsHour, isEventOnDayInViewerTZ, getStartEndMinutesOnDayInViewerTZ, getZonedParts } from '@/lib/utils/date-utils';
import { ViewEditEventModal } from './ViewEditEventModal';
import { usePreferences } from '@/contexts/preferences-context';
import { getEventColor } from '@/lib/utils/event-colors';
import { normalizeRichText } from '@/lib/utils/text';
import { LinkifiedText } from '@/components/ui/LinkifiedText';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface DayViewProps {
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

export function DayView({
  currentDate,
  events,
  categories,
  googleCalendars = [],
  user,
  setSelectedDate,
  setShowCreateModal,
  onEventsChange,
  onRangeSelect
}: DayViewProps) {
  const { preferences } = usePreferences();
  const [showEditModal, setShowEditModal] = useState<CalendarEvent | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const tooltipPosRef = useRef({ top: 0, left: 0 });
  const rafRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  // Memoized calendar map for fast lookups
  const calById = useMemo(() => {
    const m = new Map<string, any>();
    (googleCalendars || []).forEach((c: any) => m.set(c.google_calendar_id || c.id, c));
    return m;
  }, [googleCalendars]);

  // Separate all-day events from timed events
  const allDayEvents = events.filter(event => event.all_day === true);
  const timedEvents = events.filter(event => !event.all_day);
  
  // Precompute positions for current day in viewer timezone (after timedEvents is defined)
  const dayPositions = useMemo(() => {
    return timedEvents.map(ev => {
      const evTz = getEventTimeZone(ev, googleCalendars, calById);
      const { startMin, endMin } = getStartEndMinutesOnDayInViewerTZ(ev.start_time, ev.end_time, evTz, currentDate, preferences.timezone);
      if (endMin <= 0 || startMin >= 1440) return null;
      return { ev, startMin: Math.max(0, startMin), endMin: Math.min(1440, endMin) };
    }).filter(Boolean) as { ev: any, startMin: number, endMin: number }[];
  }, [timedEvents, preferences.timezone, googleCalendars, calById, currentDate]);
  
  // Get all-day events for the current day
  const getTodayAllDayEvents = () => {
    const dayStart = new Date(currentDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(currentDate);
    dayEnd.setHours(23, 59, 59, 999);
    
    return allDayEvents.filter(event => {
      const { start: eventStart, end: eventEnd } = getEventRangeLocal(event);
      return eventStart <= dayEnd && eventEnd >= dayStart;
    });
  };

  const getEventsForHour = (hour: number) => {
    return timedEvents.filter(event => {
      const evTz = getEventTimeZone(event, googleCalendars, calById);
      if (!isEventOnDayInViewerTZ(event.start_time, event.end_time, evTz, currentDate, preferences.timezone)) return false;
      const { startMin, endMin } = getStartEndMinutesOnDayInViewerTZ(event.start_time, event.end_time, evTz, currentDate, preferences.timezone);
      const cellStart = hour * 60, cellEnd = cellStart + 60;
      return startMin < cellEnd && endMin > cellStart;
    });
  };

  const getEventStyle = (event: CalendarEvent, hour: number) => {
    const evTz = getEventTimeZone(event, googleCalendars, calById);
    const { startMin, endMin } = getStartEndMinutesOnDayInViewerTZ(event.start_time, event.end_time, evTz, currentDate, preferences.timezone);
    const cellStart = hour * 60, cellEnd = cellStart + 60;
    const s = Math.max(startMin, cellStart) - cellStart;
    const e = Math.min(endMin, cellEnd) - cellStart;
    const top = (s / 60) * 100;
    const height = Math.max(((e - s) / 60) * 100, 2);
    return {
      top: `${top}%`,
      height: `${height}%`,
      minHeight: '16px',
      backgroundColor: getEventColor(event, googleCalendars, calById)
    };
  };

  const formatDate = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: preferences.timezone }).format(date);
  };

  // Dual timezone labels (Costa Rica + current user)
  const CR_TZ = 'America/Costa_Rica';
  const USER_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })();
  const LABEL_COL_WIDTH = 120; // px
  const formatHourInTz = (baseDate: Date, hour: number, tz: string) => {
    const d = new Date(baseDate); d.setHours(hour, 0, 0, 0);
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
        <div className="min-w-[600px] h-full flex flex-col">
        
        {/* All-Day Events Section - fixed */}
        {getTodayAllDayEvents().length > 0 && (
          <div className="border-b border-gray-600 bg-background-primary/30 flex-shrink-0">
            <div className="flex">
              {/* Time column header with dual TZ labels */}
              <div className="p-2 text-[11px] text-text-muted border-r-2 border-gray-600/30 bg-[#30302e] flex items-center justify-between"
                   style={{ width: LABEL_COL_WIDTH }}>
                <span>{CR_GMT}</span>
                <span>{USER_GMT}</span>
              </div>
              
              {/* All-day events */}
              <div className="flex-1 p-2 min-h-[40px]">
                <div className="space-y-1">
                  {getTodayAllDayEvents().map(event => (
                    <div
                      key={event.id}
                      className="text-xs px-2 py-1 rounded cursor-pointer hover:opacity-90 truncate text-white font-medium inline-block mr-2"
                      style={{ backgroundColor: getEventColor(event, googleCalendars) }}
                      onClick={() => setShowEditModal(event)}
                      title={event.title}
                    >
                      {event.title}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Time grid - expandable */}
        <div className="flex-1 min-h-0 overflow-y-auto relative">
          {/* Background hour rows */}
          <div className="grid h-full" style={{ gridTemplateRows: `repeat(${HOURS.length}, 1fr)` }}>
            {HOURS.map(hour => {
              const hourEvents = getEventsForHour(hour);
              
              return (
                <div key={hour} className="grid border-b border-gray-600/30" style={{ gridTemplateColumns: `${LABEL_COL_WIDTH}px 1fr` }}>
                  <div className="flex items-center justify-between px-2 text-xs text-text-muted bg-[#30302e] whitespace-nowrap">
                    <span>{formatHourInTz(currentDate, hour, CR_TZ)}</span>
                    <span>{hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}</span>
                  </div>
                  <div className="flex-1 relative border-l-2 border-gray-600/30 bg-[#575553] hover:bg-gray-700/10">
                  {user?.role === 'admin' && (
                    <button
                      onClick={() => {
                        if (onRangeSelect) {
                          // Create a time-based event (not all-day) when clicking on an hour slot
                          const startDate = new Date(currentDate);
                          startDate.setHours(hour, 0, 0, 0);
                          const endDate = new Date(currentDate);
                          endDate.setHours(hour + 1, 0, 0, 0);
                          onRangeSelect({ 
                            start: startDate, 
                            end: endDate, 
                            isAllDay: false  // Explicitly set to false for hour clicks
                          });
                        } else {
                          // Fallback to old behavior
                          const newDate = new Date(currentDate);
                          newDate.setHours(hour);
                          setSelectedDate(newDate);
                          setShowCreateModal(true);
                        }
                      }}
                      className="absolute inset-0 w-full h-full hover:bg-gray-700/10 transition-colors z-[1]"  
                    />
                  )}
                </div>
              </div>
            );
          })}
          </div>

          {/* Events overlay for the day */}
          <div className="absolute inset-0" style={{ zIndex: 2 }}>
            <div className="grid h-full" style={{ gridTemplateColumns: `${LABEL_COL_WIDTH}px 1fr` }}>
              <div />
              <div className="relative">
                {dayPositions.map(({ ev, startMin: startM, endMin: endM }) => {
                  const topPct = (startM/1440)*100; const heightPct = Math.max(((endM-startM)/1440)*100, 1.5);
                  return (
                    <div
                      key={ev.id}
                      className="absolute left-2 right-2 px-2 text-xs text-white truncate cursor-pointer"
                      style={{ top: `${topPct}%`, height: `${heightPct}%`, backgroundColor: getEventColor(ev, googleCalendars), borderRadius: 4 }}
                      onClick={() => setShowEditModal(ev)}
                      onMouseEnter={(e) => { setHoveredEventId(ev.id); if (tooltipRef.current) { tooltipRef.current.style.left = `${e.clientX+10}px`; tooltipRef.current.style.top = `${e.clientY+10}px`; } }}
                      onMouseMove={(e) => { if(!tooltipRef.current)return; const gap=10,w=256,h=tooltipRef.current.offsetHeight||150; let L=e.clientX+gap,T=e.clientY+gap; if(L+w>innerWidth-gap)L=e.clientX-w-gap; if(T+h>innerHeight-gap)T=e.clientY-h-gap; if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(()=>{ if (tooltipRef.current){ tooltipRef.current.style.left = `${L}px`; tooltipRef.current.style.top = `${T}px`; }}); }}
                      onMouseLeave={() => setHoveredEventId(null)}
                    >
                      <div className="truncate font-medium">{ev.title}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Current time red line */}
          {(() => {
            // Red line in viewer's display timezone
            const parts = getZonedParts(new Date(), preferences.timezone);
            const todayLocal = new Date(parts.year, parts.month - 1, parts.day);
            if (todayLocal.toDateString() !== currentDate.toDateString()) return null;
            const mins = parts.hour * 60 + parts.minute;
            const topPct = (mins/1440)*100;
            return (
              <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 3 }}>
                <div className="grid h-full" style={{ gridTemplateColumns: `${LABEL_COL_WIDTH}px 1fr` }}>
                  <div />
                  <div className="relative">
                    <div className="absolute left-2 right-2 h-[2px] bg-red-500" style={{ top: `${topPct}%` }} />
                  </div>
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
            style={{ position: 'fixed', top: `0px`, left: `0px` }}
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
          </div>
        );
      })()}
    </div>
  );
}
