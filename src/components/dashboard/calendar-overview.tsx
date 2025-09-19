'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { CalendarEvent } from '@/lib/supabase/types';
import { usePreferences } from '@/contexts/preferences-context';
import { toInstantFromNaive, formatInstantInTimeZone, getEventTimeZone } from '@/lib/utils/date-utils';
import { useGoogleCalendars } from '@/hooks/useGoogleCalendars';
import { TIME_INTERVALS } from '@/constants';
import { useUser } from '@/contexts/user-context';
import { EventDetailsModal } from './event-details-modal';
import { CategoriesClient, Category } from '@/lib/categories/categories-client';

export function CalendarOverview() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [familyMemberId, setFamilyMemberId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const { user } = useUser();
  const { preferences } = usePreferences();
  const { calendars } = useGoogleCalendars();

  // Create a function to get category color
  const getCategoryColor = (categoryName: string) => {
    if (!categoryName) return '#7A6A8A';
    const category = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
    return category?.color || '#7A6A8A'; // Default to a gray color if not found
  };

  useEffect(() => {
    if (user) {
      // Fetch categories and family member ID first, then fetch events
      Promise.all([
        fetchCategories(),
        fetchUserFamilyMemberId()
      ]).then(() => {
        fetchUpcomingEvents();
      });
      
      // Refresh every minute to remove past events
      const interval = setInterval(() => {
        fetchUpcomingEvents();
      }, 60000); // 1 minute
      
      return () => clearInterval(interval);
    }
  }, [user]);
  
  // Also refetch events when familyMemberId changes
  useEffect(() => {
    if (familyMemberId) {
      fetchUpcomingEvents();
    }
  }, [familyMemberId]);

  const fetchCategories = async () => {
    try {
      const calendarCategories = await CategoriesClient.getCategories('calendar');
      setCategories(calendarCategories);
    } catch (error) {
      console.error('Failed to fetch calendar categories:', error);
    }
  };

  const fetchUserFamilyMemberId = async () => {
    if (!user?.email) return;
    
    try {
      // Import Supabase client
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      
      // Try to find family member by email
      const { data: familyMember } = await supabase
        .from('family_members')
        .select('id')
        .eq('email', user.email)
        .single();
      
      if (familyMember) {
        setFamilyMemberId(familyMember.id);
      }
    } catch (error) {
      console.error('Error fetching family member ID:', error);
    }
  };

  const fetchUpcomingEvents = async () => {
    try {
      // Fetch calendar events (this includes both regular events and task-synced events)
      const response = await fetch('/api/calendar-events');
      if (!response.ok) {
        console.error('[CalendarOverview] API response not OK:', response.status);
        const errorData = await response.json();
        console.error('[CalendarOverview] Error data:', errorData);
        return;
      }
      
      const data = await response.json();
      const calendarEvents: CalendarEvent[] = data.events || [];

      
      // Filter for upcoming events (including today) and sort by date
      const now = new Date();
      
      const upcomingEvents = calendarEvents
        .filter(event => {
          // Exclude tasks from the Events & Appointments card
          // Tasks have their own dedicated widget on the dashboard, so we don't want duplicates
          // Tasks are identified by having source: 'tasks' (set when tasks sync to calendar)
          // or by having their title prefixed with "Task: "
          if (event.source === 'tasks' || event.title?.startsWith('Task: ')) {
            return false;
          }
          
          const startTime = new Date(event.start_time);
          const endTime = event.end_time ? new Date(event.end_time) : startTime;
          
          // For non-admin users, only show events they're attending
          if (user?.role !== 'admin') {
            // Check both auth user ID and family member ID
            const isAttendingAsAuthUser = event.attendees && event.attendees.includes(user?.id || '');
            const isAttendingAsFamilyMember = familyMemberId && event.attendees && event.attendees.includes(familyMemberId);
            const isCreator = event.created_by === user?.id;
            
            if (!isAttendingAsAuthUser && !isAttendingAsFamilyMember && !isCreator) {
              return false;
            }
          }
          
          // Filter out events that have already ended
          return endTime >= now;
        })
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
        .slice(0, 5); // Get 5 events total

      setEvents(upcomingEvents);
    } catch (error) {
      console.error('Error fetching calendar events:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatEventTime = (dateString: string, evTz?: string) => {
    // Build instant in event timezone, then render in display timezone
    const date = toInstantFromNaive(dateString, evTz || preferences.timezone);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return `Today, ${formatInstantInTimeZone(date, preferences.timezone, { hour: 'numeric', minute: '2-digit' })}`;
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow, ${formatInstantInTimeZone(date, preferences.timezone, { hour: 'numeric', minute: '2-digit' })}`;
    } else {
      return formatInstantInTimeZone(date, preferences.timezone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl p-6" style={{ backgroundColor: '#2a2a29' }}>
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-4 h-4 bg-gray-700 rounded"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const hasEvents = events.length > 0;
  const displayedEvents = expanded ? events : events.slice(0, 3);
  const hasMoreEvents = events.length > 3;

  const handleEventClick = (eventId: string) => {
    // Open the event details modal
    setSelectedEventId(eventId);
    setShowEventModal(true);
  };

  const getEventAttendeeNames = (event: CalendarEvent) => {
    // For now, just show the count. In a real app, you'd fetch user names
    if (!event.attendees || event.attendees.length === 0) return null;
    return `${event.attendees.length} attendee${event.attendees.length > 1 ? 's' : ''}`;
  };

  return (
    <div className="rounded-xl" style={{ backgroundColor: '#2a2a29' }}>
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-5 w-5 text-text-muted" />
          <h3 className="font-medium text-text-primary">Events & Appointments</h3>
        </div>

        {!hasEvents ? (
          <div>
            <p className="text-text-muted text-sm">No upcoming events</p>
            <div className="flex items-center justify-end mt-4">
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                {collapsed ? (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Show events
                  </>
                ) : (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Hide events
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <>
            {!collapsed && (
              <div className="space-y-3">
                {displayedEvents.map((event) => (
                  <div 
                    key={event.id} 
                    className="rounded-xl px-4 py-3 transition-colors cursor-pointer"
                    style={{ 
                      backgroundColor: '#30302e',
                      border: '1px solid #30302e'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.border = '1px solid #30302e';
                    }}
                    onClick={() => handleEventClick(event.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div 
                        className="w-3 h-3 rounded-full mt-1 flex-shrink-0" 
                        style={{ backgroundColor: event.color || getCategoryColor(event.category) }}
                      />
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-white">
                          {event.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-2 text-xs text-text-muted">
                          <Clock className="h-3 w-3" />
                          <span>{formatEventTime(event.start_time, getEventTimeZone(event, calendars as any))}</span>
                          {event.location && (
                            <>
                              <span>•</span>
                              <span>{event.location}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex items-center justify-between mt-4">
              {!collapsed && hasMoreEvents && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(!expanded);
                  }}
                  className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="w-3 h-3" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3 h-3" />
                      +{events.length - 3} more
                    </>
                  )}
                </button>
              )}
              
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors ml-auto"
              >
                {collapsed ? (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Show events
                  </>
                ) : (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Hide events
                  </>
                )}
              </button>
            </div>
          </>
        )}
      
      {/* Event Details Modal */}
      <EventDetailsModal
        isOpen={showEventModal}
        onClose={() => {
          setShowEventModal(false);
          setSelectedEventId(null);
        }}
        eventId={selectedEventId}
      />
      </div>
    </div>
  );
}
