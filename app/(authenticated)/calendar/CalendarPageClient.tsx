"use client";

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/contexts/user-context';
import { CalendarEvent } from '@/lib/supabase/types';
import { CategoriesClient, Category } from '@/lib/categories/categories-client';
import { MonthView } from '@/components/calendar/MonthView';
import { WeekView } from '@/components/calendar/WeekView';
import { DayView } from '@/components/calendar/DayView';
import { ListView } from '@/components/calendar/ListView';
import { YearView } from '@/components/calendar/YearView';
import { GanttView } from '@/components/calendar/GanttView';
import { GoogleMapsLoader } from '@/components/calendar/GoogleMapsLoader';
import { CreateEventModal } from '@/components/calendar/CreateEventModal';
import { useGoogleCalendars } from '@/hooks/useGoogleCalendars';
import { Plus, Maximize2, Minimize2 } from 'lucide-react';
import { UnifiedSearchFilter } from '@/components/calendar/UnifiedSearchFilter';
import { CalendarEventCategory } from '@/lib/supabase/types';

type CalendarView = 'month' | 'week' | 'day' | 'list' | 'gantt' | 'year';

export default function CalendarPageClient() {
  const { user } = useUser();
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [view, setView] = useState<CalendarView>('month');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const { calendars: googleCalendars } = useGoogleCalendars();
  const [rangePrefill, setRangePrefill] = useState<{ startDate: Date; endDate: Date; isAllDay: boolean } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<CalendarEventCategory[]>([]);
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [visibleCalendarIds, setVisibleCalendarIds] = useState<string[]>([]);
  const [showTasks, setShowTasks] = useState<boolean>(false);
  const [showAllDayOnly, setShowAllDayOnly] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [evRes, cats] = await Promise.all([
          fetch('/api/calendar-events').then(r => r.ok ? r.json() : Promise.reject('Failed events')),
          CategoriesClient.getCategories('calendar')
        ]);
        setEvents(evRes?.events || []);
        setCategories(cats || []);
      } catch (e) {
        // noop
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggleFullscreen = () => {
    const el = document.documentElement;
    const isHidden = el.getAttribute('data-chrome-hidden') === 'true';
    if (isHidden) {
      el.setAttribute('data-chrome-hidden', 'false');
      setIsFullscreen(false);
    } else {
      el.setAttribute('data-chrome-hidden', 'true');
      setIsFullscreen(true);
    }
  };

  const onEventsChange = async () => {
    try {
      const res = await fetch('/api/calendar-events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data?.events || []);
      }
    } catch {}
  };

  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => {
    const d = new Date(currentDate);
    if (view === 'month' || view === 'list' || view === 'year') {
      d.setMonth(d.getMonth() - 1);
    } else if (view === 'week' || view === 'gantt') {
      d.setDate(d.getDate() - 7);
    } else {
      d.setDate(d.getDate() - 1);
    }
    setCurrentDate(d);
  };
  const goNext = () => {
    const d = new Date(currentDate);
    if (view === 'month' || view === 'list' || view === 'year') {
      d.setMonth(d.getMonth() + 1);
    } else if (view === 'week' || view === 'gantt') {
      d.setDate(d.getDate() + 7);
    } else {
      d.setDate(d.getDate() + 1);
    }
    setCurrentDate(d);
  };
  const formatHeader = () => {
    const opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
    if (view === 'day') {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    if (view === 'week' || view === 'gantt') {
      const start = new Date(currentDate);
      start.setDate(currentDate.getDate() - currentDate.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: start.getFullYear() !== end.getFullYear() ? 'numeric' : undefined })}`;
    }
    return currentDate.toLocaleDateString('en-US', opts);
  };

  return (
    <div className="flex flex-col h-full w-full">
      <GoogleMapsLoader />
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-text-primary">Calendar</h1>
          <div className="flex items-center gap-3">
            {user?.role === 'admin' && (
              <button
                onClick={() => { setSelectedDate(new Date()); setShowCreateModal(true); }}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Add Event</span>
              </button>
            )}
            <div className="flex items-center rounded-xl overflow-hidden border border-gray-600/40">
              {(['month','week','day','year','gantt','list'] as CalendarView[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-4 py-2 text-sm ${view===v ? 'bg-gray-700 text-white font-semibold' : 'bg-background-secondary text-text-muted hover:text-text-primary'}`}
                >
                  {v[0].toUpperCase()+v.slice(1)}
                </button>
              ))}
            </div>
            <button
              onClick={toggleFullscreen}
              className={`px-4 py-2 text-sm rounded-xl border border-gray-600/40 ${isFullscreen ? 'bg-gray-700 text-white' : 'bg-background-secondary text-text-muted hover:text-text-primary'}`}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="mb-3">
          <UnifiedSearchFilter
            onSearchChange={setSearchTerm}
            onCategoryChange={setSelectedCategories}
            onAttendeeChange={setSelectedAttendees}
            onDateRangeChange={(start, end) => setDateRange({ start, end })}
            onCalendarFilterChange={setVisibleCalendarIds}
            onShowTasksChange={setShowTasks}
            onShowAllDayOnlyChange={setShowAllDayOnly}
            calendars={(googleCalendars || []).map((c: any) => ({
              google_calendar_id: c.google_calendar_id || c.id,
              name: c.summary || c.name || 'Calendar',
              background_color: c.backgroundColor || '#777',
              foreground_color: c.foregroundColor || '#fff',
              is_primary: !!c.primary
            }))}
            visibleCalendarIds={visibleCalendarIds}
            users={[]}
            currentUserId={undefined}
            showTasks={showTasks}
            showAllDayOnly={showAllDayOnly}
            currentView={view}
            currentDate={currentDate}
            onNavigatePrevious={goPrev}
            onNavigateNext={goNext}
            onGoToToday={goToday}
          />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
            </div>
          ) : (
            <>
              {(() => {
                const term = searchTerm.trim().toLowerCase();
                let evs = events;
                // Text search
                if (term) {
                  evs = evs.filter(e => (e.title || '').toLowerCase().includes(term) || (e.description || '').toLowerCase().includes(term));
                }
                // Category filter
                if (selectedCategories.length > 0) {
                  evs = evs.filter(e => !!e.category && selectedCategories.includes(e.category));
                }
                // Attendees filter
                if (selectedAttendees.length > 0) {
                  evs = evs.filter(e => (e.attendees || []).some(a => selectedAttendees.includes(a)));
                }
                // Date range overlap filter
                if (dateRange.start || dateRange.end) {
                  const startMs = dateRange.start ? new Date(dateRange.start).getTime() : -Infinity;
                  const endMs = dateRange.end ? new Date(dateRange.end).getTime() : Infinity;
                  evs = evs.filter(e => {
                    const s = new Date(e.start_time).getTime();
                    const en = new Date(e.end_time || e.start_time).getTime();
                    return s <= endMs && en >= startMs;
                  });
                }
                // Google calendar filter
                if ((googleCalendars?.length || 0) > 0 && visibleCalendarIds.length > 0) {
                  evs = evs.filter(e => !e.google_calendar_id || visibleCalendarIds.includes(e.google_calendar_id));
                }
                // All-day only
                if (showAllDayOnly) {
                  evs = evs.filter(e => e.all_day === true);
                }
                return (
                  <>
                    {view === 'month' && (
                      <MonthView
                        currentDate={currentDate}
                        events={evs}
                        categories={categories}
                        googleCalendars={googleCalendars}
                        user={user ? { role: user.role } : null}
                        setSelectedDate={setSelectedDate}
                        setShowCreateModal={setShowCreateModal}
                        onEventsChange={onEventsChange}
                        onRangeSelect={(r) => { setRangePrefill({ startDate: r.start, endDate: r.end, isAllDay: r.isAllDay }); setSelectedDate(r.start); setShowCreateModal(true); }}
                      />
                    )}
                    {view === 'week' && (
                      <WeekView
                        currentDate={currentDate}
                        events={evs}
                        categories={categories}
                        googleCalendars={googleCalendars}
                        user={user ? { role: user.role } : null}
                        setSelectedDate={setSelectedDate}
                        setShowCreateModal={setShowCreateModal}
                        onEventsChange={onEventsChange}
                        onRangeSelect={(r) => { setRangePrefill({ startDate: r.start, endDate: r.end, isAllDay: r.isAllDay }); setSelectedDate(r.start); setShowCreateModal(true); }}
                      />
                    )}
                    {view === 'day' && (
                      <DayView
                        currentDate={currentDate}
                        events={evs}
                        categories={categories}
                        googleCalendars={googleCalendars}
                        user={user ? { role: user.role } : null}
                        setSelectedDate={setSelectedDate}
                        setShowCreateModal={setShowCreateModal}
                        onEventsChange={onEventsChange}
                        onRangeSelect={(r) => { setRangePrefill({ startDate: r.start, endDate: r.end, isAllDay: r.isAllDay }); setSelectedDate(r.start); setShowCreateModal(true); }}
                      />
                    )}
                    {view === 'list' && (
                      <ListView
                        events={evs}
                        categories={categories}
                        googleCalendars={googleCalendars}
                        user={user ? { role: user.role } : null}
                        onEventsChange={onEventsChange}
                      />
                    )}
                    {view === 'year' && (
                      <div className="h-full">
                        <YearView
                          currentDate={currentDate}
                          events={evs}
                          googleCalendars={googleCalendars}
                          categories={categories}
                          onEventsChange={onEventsChange}
                        />
                      </div>
                    )}
                    {view === 'gantt' && (
                      <div className="h-full">
                        <GanttView
                          currentDate={currentDate}
                          events={evs}
                          categories={categories}
                          googleCalendars={googleCalendars}
                          user={user ? { role: user.role } : null}
                          onEventsChange={onEventsChange}
                        />
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {showCreateModal && selectedDate && (
        <CreateEventModal
          onClose={() => setShowCreateModal(false)}
          selectedDate={selectedDate}
          prefillData={rangePrefill || undefined}
          onEventCreated={() => { onEventsChange(); setShowCreateModal(false); setRangePrefill(null); }}
        />
      )}
    </div>
  );
}
