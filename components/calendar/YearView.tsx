'use client';

import { CalendarEvent } from '@/lib/supabase/types';
import { getEventColor } from '@/lib/utils/event-colors';
import { parseDateFlexible } from '@/lib/utils/date-utils';
import { Category } from '@/lib/categories/categories-client';
import { ViewEditEventModal } from '@/components/calendar/ViewEditEventModal';
import { useState, useRef, useEffect } from 'react';
import { normalizeRichText } from '@/lib/utils/text';
import { LinkifiedText } from '@/components/ui/LinkifiedText';

interface YearViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  googleCalendars?: any[];
  monthsPerPage?: number; // default 4
  onMonthsPerPageChange?: (months: number) => void;
  categories?: Category[];
  onEventsChange?: () => void;
  forceOpenEventId?: string;
  onForceOpenHandled?: () => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function YearView({
  currentDate,
  events,
  googleCalendars = [],
  monthsPerPage = 4,
  onMonthsPerPageChange,
  categories = [],
  onEventsChange,
  forceOpenEventId,
  onForceOpenHandled,
}: YearViewProps) {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<CalendarEvent | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!forceOpenEventId) return;
    const event = events.find(ev => ev.id === forceOpenEventId);
    if (!event) return;
    setSelectedEvent(event);
    onForceOpenHandled?.();
  }, [forceOpenEventId, events, onForceOpenHandled]);
  const [visibleCount, setVisibleCount] = useState(Math.max(1, monthsPerPage));

  useEffect(() => {
    setVisibleCount(Math.max(1, monthsPerPage));
  }, [monthsPerPage]);

  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

  const months = Array.from({ length: visibleCount }, (_, i) => {
    const d = new Date(monthStart);
    d.setMonth(monthStart.getMonth() + i);
    return d;
  });

  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

  const clampToMonth = (date: Date, y: number, m: number, end = false) => {
    const d = new Date(date);
    const first = new Date(y, m, 1);
    const last = new Date(y, m, daysInMonth(y, m), 23, 59, 59, 999);
    if (d < first) return first;
    if (d > last) return end ? last : last; // same
    return d;
  };

  const buildMonthEvents = (y: number, m: number) => {
    const startOfMonth = new Date(y, m, 1);
    const endOfMonth = new Date(y, m, daysInMonth(y, m), 23, 59, 59, 999);
    const monthEvents = events.filter(ev => {
      const s = parseDateFlexible(ev.start_time);
      const e = parseDateFlexible(ev.end_time || ev.start_time);
      return s <= endOfMonth && e >= startOfMonth;
    });

    // Map to positions within the month
    return monthEvents.map(ev => {
      const s = clampToMonth(parseDateFlexible(ev.start_time), y, m);
      const e = clampToMonth(parseDateFlexible(ev.end_time || ev.start_time), y, m, true);
      const startDay = s.getDate();
      const endDay = e.getDate();
      const span = Math.max(1, endDay - startDay + 1);
      return { ev, startDay, span };
    });
  };

  const renderMonthRow = (date: Date) => {
    const y = date.getFullYear();
    const m = date.getMonth();
    const totalDays = daysInMonth(y, m);
    const items = buildMonthEvents(y, m);

    // Separate all-day and timed events
    const allDayItems = items.filter(i => i.ev.all_day === true);
    const timedItems = items.filter(i => i.ev.all_day !== true);

    // Place all-day events in unlimited rows (no hiding)
    const rowsAllDay: Array<typeof items[number]>[] = [];
    allDayItems.forEach(item => {
      let placed = false;
      for (let r = 0; r < rowsAllDay.length; r++) {
        const row = rowsAllDay[r];
        const last = row[row.length - 1];
        if (!last || item.startDay > last.startDay + last.span - 1) {
          row.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) rowsAllDay.push([item]);
    });

    // Place timed events with a reasonable cap; overflow is allowed for timed only
    const MAX_TIMED_ROWS = 2;
    const rowsTimed: Array<typeof items[number]>[] = Array.from({ length: MAX_TIMED_ROWS }, () => [] as Array<typeof items[number]>);
    const timedOverflow: CalendarEvent[] = [];
    timedItems.forEach(item => {
      let placed = false;
      for (let r = 0; r < rowsTimed.length; r++) {
        const row = rowsTimed[r];
        const last = row[row.length - 1];
        if (!last || item.startDay > last.startDay + last.span - 1) {
          row.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) timedOverflow.push(item.ev);
    });

    const rows = [...rowsAllDay, ...rowsTimed];

    return (
      <div key={`${y}-${m}`} className="border-b border-gray-600/30 py-3">
        {/* Month title */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-28 shrink-0 text-sm font-semibold text-text-primary">{MONTHS[m]}</div>
          <div className="flex-1 overflow-x-auto">
            {/* Day numbers */}
            <div
              className="grid gap-px text-[11px] text-text-muted border-b border-gray-500/60 pb-0.5"
              style={{ gridTemplateColumns: `repeat(${totalDays}, minmax(28px, 1fr))` }}
            >
              {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => {
                const weekday = new Date(y, m, d).getDay();
                const isWeekend = weekday === 0 || weekday === 6;
                return (
                  <div
                    key={d}
                    className={`h-6 flex items-center justify-center border border-gray-500/60 ${
                      isWeekend ? 'bg-background-secondary/40' : 'bg-background-secondary/60'
                    }`}
                  >
                    {d}
                  </div>
                );
              })}
            </div>

            {/* Event rows with background day grid lines */}
              {rows.map((row, rIdx) => (
                <div key={rIdx} className="mt-1 relative">
                  {/* vertical grid lines layer */}
                  <div
                  className="absolute inset-0 pointer-events-none grid"
                  style={{ gridTemplateColumns: `repeat(${totalDays}, minmax(28px, 1fr))` }}
                  >
                  {Array.from({ length: totalDays }).map((_, i) => (
                    <div key={i} className="border-l border-gray-500/70" />
                  ))}
                  </div>
                  {/* events layer */}
                  <div
                  className="relative grid gap-0"
                  style={{ gridTemplateColumns: `repeat(${totalDays}, minmax(28px, 1fr))` }}
                  >
                  {row.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedEvent(item.ev)}
                      style={{ gridColumn: `${item.startDay} / span ${item.span}` }}
                      className="h-6 rounded text-[11px] px-2 flex items-center whitespace-nowrap overflow-hidden group focus:outline-none"
                      title={item.ev.title}
                      onMouseEnter={(e) => {
                        setHoveredEvent(item.ev);
                        const mouseX = e.clientX; const mouseY = e.clientY;
                        setTooltipPosition({ left: mouseX + 10, top: mouseY + 10 });
                      }}
                      onMouseMove={(e) => {
                        if (!tooltipRef.current) return;
                        const gap = 10; const w = 256; const h = tooltipRef.current.offsetHeight || 150;
                        let L = e.clientX + gap; let T = e.clientY + gap;
                        if (L + w > window.innerWidth - gap) L = e.clientX - w - gap;
                        if (T + h > window.innerHeight - gap) T = e.clientY - h - gap;
                        if (L < gap) L = gap; if (T < gap) T = gap;
                        setTooltipPosition({ left: L, top: T });
                      }}
                      onMouseLeave={() => setHoveredEvent(null)}
                    >
                      <span
                        className="w-full h-full rounded flex items-center px-2 transition-colors group-hover:opacity-90 group-hover:ring-1 group-hover:ring-white/20"
                        style={{ backgroundColor: getEventColor(item.ev as any, googleCalendars as any) }}
                      >
                        <span className="truncate text-white/95">{item.ev.title}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {timedOverflow.length > 0 && (
              <div className="mt-1 text-[11px] text-text-muted">+{timedOverflow.length} more</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="flex items-center justify-end px-3 py-2 border-b border-gray-700/40">
        <label className="text-sm text-text-muted mr-2">Months:</label>
        <select
          value={visibleCount}
          onChange={(e) => {
            const next = Math.max(1, parseInt(e.target.value, 10));
            setVisibleCount(next);
            onMonthsPerPageChange?.(next);
          }}
          className="bg-background-primary border border-gray-700/50 rounded px-2 py-1 text-sm text-text-primary"
        >
          {[1, 3, 4, 6, 12].map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      {/* Months timeline rows */}
      <div className="flex-1 overflow-auto p-3">
        {months.map(renderMonthRow)}
      </div>

      {/* Hover Tooltip */}
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
            <div>Time: {hoveredEvent.all_day ? 'All day' : parseDateFlexible(hoveredEvent.start_time).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</div>
            <div>
              Calendar: {(() => {
                const cal = (googleCalendars || []).find((c: any) =>
                  (c.google_calendar_id || c.id) === hoveredEvent.google_calendar_id
                );
                return cal?.name || 'Not synced';
              })()}
            </div>
            {hoveredEvent.location && (
              <div>Location: {hoveredEvent.location}</div>
            )}
          </div>
        </div>
      )}

      {/* Event details modal */}
      {selectedEvent && (
        <ViewEditEventModal
          event={selectedEvent}
          categories={categories}
          onClose={() => setSelectedEvent(null)}
          onEventUpdated={() => {
            setSelectedEvent(null);
            onEventsChange?.();
          }}
          onEventsChange={() => onEventsChange?.()}
        />
      )}
    </div>
  );
}

export default YearView;
