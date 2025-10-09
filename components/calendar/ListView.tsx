'use client';

import { useEffect, useState } from 'react';
import { CalendarEvent, CalendarEventCategory } from '@/lib/supabase/types';
import { Category } from '@/lib/categories/categories-client';
import { Clock, MapPin, Users, Copy, Edit, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { ViewEditEventModal } from './ViewEditEventModal';
import { usePreferences } from '@/contexts/preferences-context';
import { getEventColor } from '@/lib/utils/event-colors';
import { getEventRangeLocal, parseDateFlexible, getZonedParts, toInstantFromNaive, getEventTimeZone } from '@/lib/utils/date-utils';
import { LinkifiedText } from '@/components/ui/LinkifiedText';
import { normalizeRichText } from '@/lib/utils/text';

interface ListViewProps {
  events: CalendarEvent[];
  categories: Category[];
  googleCalendars?: any[];
  user: { role: string } | null;
  onEventsChange: () => void;
  forceOpenEventId?: string;
  onForceOpenHandled?: () => void;
}

export function ListView({ events, categories, googleCalendars = [], user, onEventsChange, forceOpenEventId, onForceOpenHandled }: ListViewProps) {
  const { preferences } = usePreferences();
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  // Initialize with today's date expanded
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => {
    const today = new Date().toDateString();
    return new Set([today]);
  });

  useEffect(() => {
    if (!forceOpenEventId) return;
    const event = events.find(ev => ev.id === forceOpenEventId);
    if (!event) return;
    setEditingEvent(event);
    onForceOpenHandled?.();
  }, [forceOpenEventId, events, onForceOpenHandled]);

  // Group events by day
  const groupedEvents = events.reduce((groups, event) => {
    // Group by the viewer's timezone day, converting from the event's own timezone first
    const evTz = getEventTimeZone(event, googleCalendars as any);
    const instant = toInstantFromNaive(event.start_time, evTz);
    const localParts = getZonedParts(instant, preferences.timezone);
    const localDate = new Date(localParts.year, localParts.month - 1, localParts.day, 0, 0, 0, 0);
    const dateKey = localDate.toDateString();
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(event);
    return groups;
  }, {} as Record<string, CalendarEvent[]>);

  // Sort days chronologically
  const sortedDays = Object.keys(groupedEvents).sort((a, b) => 
    new Date(a).getTime() - new Date(b).getTime()
  );

  // Filter to show only yesterday and forward
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  
  const filteredByDate = sortedDays.filter(day => {
    const dayDate = new Date(day);
    dayDate.setHours(0, 0, 0, 0);
    return dayDate >= yesterday;
  });

  // Use all days since filtering is handled by parent component
  const filteredDays = filteredByDate;

  const toggleDay = (dateKey: string) => {
    const newExpanded = new Set(expandedDays);
    if (newExpanded.has(dateKey)) {
      newExpanded.delete(dateKey);
    } else {
      newExpanded.add(dateKey);
    }
    setExpandedDays(newExpanded);
  };

  const handleCopyEvent = async (event: CalendarEvent) => {
    // Create a copy of the event
    const newEvent: any = {
      ...event,
      title: `Copy of ${event.title}`,
      google_calendar_id: null,
      google_sync_enabled: true
    };
    delete newEvent.id;
    delete newEvent.created_at;
    delete newEvent.updated_at;

    try {
      const response = await fetch('/api/calendar-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: newEvent })
      });

      if (response.ok) {
        onEventsChange();
      }
    } catch (error) {
      console.error('Error copying event:', error);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
      const response = await fetch(`/api/calendar-events/${eventId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        onEventsChange();
      }
    } catch (error) {
      console.error('Error deleting event:', error);
    }
  };

  const formatTime = (_event: CalendarEvent, dateString: string) => {
    const d = parseDateFlexible(dateString);
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: preferences.timezone }).format(d);
  };

  const formatDateHeader = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Events List */}
      <div className="space-y-4">
        {filteredDays.length === 0 ? (
          <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-8 text-center">
            <p className="text-text-muted">No events found</p>
          </div>
        ) : (
          filteredDays.map(dateKey => {
            const dayEvents = groupedEvents[dateKey]
              .sort((a, b) => parseDateFlexible(a.start_time).getTime() - parseDateFlexible(b.start_time).getTime());

            const today = new Date().toDateString();
            const isToday = dateKey === today;
            const isExpanded = expandedDays.has(dateKey) || isToday;

            return (
              <div key={dateKey} className="bg-background-secondary border border-gray-600/30 rounded-lg overflow-hidden">
                {/* Date Header */}
                <button
                  onClick={() => toggleDay(dateKey)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-700/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-text-muted" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-text-muted" />
                    )}
                    <h3 className="text-lg font-semibold text-text-primary">
                      {formatDateHeader(dateKey)}
                    </h3>
                    <span className="text-sm text-text-muted">
                      ({dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'})
                    </span>
                  </div>
                </button>

                {/* Events for this day */}
                {isExpanded && (
                  <div className="border-t border-gray-600/30">
                    {dayEvents.map(event => (
                      <div
                        key={event.id}
                        className="p-4 border-b border-gray-600/30 last:border-b-0 hover:bg-gray-700/10 transition-colors cursor-pointer"
                        onClick={() => setEditingEvent(event)}
                      >
                        <div className="flex items-start gap-4">
                          {/* Color indicator */}
                          <div
                            className="w-2 h-2 rounded-full border border-white/30 mt-1.5 flex-shrink-0"
                            style={{ backgroundColor: getEventColor(event, googleCalendars) }}
                          />
                          
                          {/* Event details */}
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h4 className="font-medium text-text-primary">{event.title}</h4>
                                {event.description && (
                                  <LinkifiedText 
                                    text={normalizeRichText(event.description)} 
                                    className="text-sm text-text-muted mt-1 line-clamp-2"
                                  />
                                )}
                                
                                <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-text-muted">
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {event.all_day ? 'All day' : `${formatTime(event, event.start_time)} - ${formatTime(event, event.end_time)}`}
                                  </div>
                                  
                                  {event.location && (
                                    <div className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {event.location}
                                    </div>
                                  )}
                                  
                                  {event.attendees && event.attendees.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      <Users className="h-3 w-3" />
                                      {event.attendees.length} attendees
                                    </div>
                                  )}
                                  
                                  <span className="capitalize px-2 py-0.5 rounded-full text-xs" 
                                    style={{ 
                                      backgroundColor: `${getEventColor(event, googleCalendars)}20`,
                                      color: getEventColor(event, googleCalendars)
                                    }}>
                                    {event.category}
                                  </span>
                                  
                                  <span className="text-xs">
                                    {event.google_calendar_id ? (
                                      <span className="text-green-400">
                                        {(() => {
                                          const cal = (googleCalendars || []).find((c: any) =>
                                            (c.google_calendar_id || c.id) === event.google_calendar_id
                                          );
                                          return cal?.name ? `Synced: ${cal.name}` : 'Synced';
                                        })()}
                                      </span>
                                    ) : (
                                      <span className="text-text-muted">Not synced</span>
                                    )}
                                  </span>
                                </div>
                              </div>
                              
                              {/* Actions */}
                              {user?.role === 'admin' && (
                                <div className="flex items-center gap-1 ml-4">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingEvent(event);
                                    }}
                                    className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                                    title="Edit"
                                  >
                                    <Edit className="h-4 w-4 text-text-muted" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyEvent(event);
                                    }}
                                    className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                                    title="Copy"
                                  >
                                    <Copy className="h-4 w-4 text-text-muted" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteEvent(event.id);
                                    }}
                                    className="p-1.5 hover:bg-red-900/20 rounded transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-400" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Edit Modal */}
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
    </div>
  );
}
