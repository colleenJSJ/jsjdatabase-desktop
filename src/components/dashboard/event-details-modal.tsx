'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, Clock, MapPin, Users, Tag, FileText, ExternalLink } from 'lucide-react';
import { CalendarEvent, CalendarEventCategory } from '@/lib/supabase/types';
import { createClient } from '@/lib/supabase/client';
import { LinkifiedText } from '@/components/ui/LinkifiedText';
import { usePreferences } from '@/contexts/preferences-context';
import { getEventTimeZone, toInstantFromNaive, formatInstantInTimeZone } from '@/lib/utils/date-utils';
import { normalizeRichText } from '@/lib/utils/text';

interface EventDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string | null;
}

const categoryColors: Record<CalendarEventCategory, string> = {
  administrative: '#5C6F82',
  education: '#8C7348',
  family: '#6B8A6B',
  financial: '#7A6A8A',
  household: '#6B7A8A',
  legal: '#8C4F5B',
  medical: '#5B7CA3',
  other: '#7A6A8A',
  personal: '#7A6A8A',
  pets: '#8A7A6B',
  school: '#8C7348',
  travel: '#6B8A6B',
  work: '#8C7348'
};

const categoryLabels: Record<CalendarEventCategory, string> = {
  administrative: 'Administrative',
  education: 'Education',
  family: 'Family',
  financial: 'Financial',
  household: 'Household',
  legal: 'Legal',
  medical: 'Health',
  other: 'Other',
  personal: 'Personal',
  pets: 'Pets',
  school: 'School',
  travel: 'Travel',
  work: 'Work'
};

export function EventDetailsModal({ isOpen, onClose, eventId }: EventDetailsModalProps) {
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [attendeeNames, setAttendeeNames] = useState<string[]>([]);
  const { preferences } = usePreferences();

  useEffect(() => {
    if (isOpen && eventId) {
      fetchEventDetails();
    }
  }, [isOpen, eventId]);

  const fetchEventDetails = async () => {
    if (!eventId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/calendar-events?id=${eventId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.events && data.events.length > 0) {
          setEvent(data.events[0]);
          
          // Fetch attendee names if there are attendees
          if (data.events[0].attendees && data.events[0].attendees.length > 0) {
            await fetchAttendeeNames(data.events[0].attendees);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching event details:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendeeNames = async (attendeeIds: string[]) => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('family_members')
        .select('id, name')
        .in('id', attendeeIds);
      
      if (data) {
        setAttendeeNames(data.map(member => member.name));
      }
    } catch (error) {
      console.error('Error fetching attendee names:', error);
    }
  };

  const formatDateTime = (dateString: string) => {
    if (!event) return '';
    const evTz = (event as any).timezone || event.metadata?.timezone;
    const instant = toInstantFromNaive(dateString, evTz || preferences.timezone);
    return formatInstantInTimeZone(instant, preferences.timezone, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  };

  const formatTime = (dateString: string) => {
    if (!event) return '';
    const evTz = (event as any).timezone || event.metadata?.timezone;
    const instant = toInstantFromNaive(dateString, evTz || preferences.timezone);
    return formatInstantInTimeZone(instant, preferences.timezone, { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const getEventDuration = () => {
    if (!event || !event.end_time) return null;
    const evTz = (event as any).timezone || event.metadata?.timezone || preferences.timezone;
    const start = toInstantFromNaive(event.start_time, evTz);
    const end = toInstantFromNaive(event.end_time, evTz);
    const diff = end.getTime() - start.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      return `${minutes} minutes`;
    }
  };

  const getSourceLabel = () => {
    if (!event) return null;
    
    switch (event.source) {
      case 'j3_academics':
        return { label: 'Academic Event', icon: '🎓' };
      case 'health':
        return { label: 'Health Appointment', icon: '🏥' };
      case 'travel':
        return { label: 'Travel', icon: '✈️' };
      case 'tasks':
        return { label: 'Task', icon: '✓' };
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-secondary rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-600/30 sticky top-0 bg-background-secondary flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Calendar className="w-8 h-8 text-blue-500" />
            <h2 className="text-xl font-semibold text-text-primary">
              Event Details
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {loading ? (
          <div className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-700 rounded w-3/4"></div>
              <div className="h-4 bg-gray-700 rounded w-1/2"></div>
              <div className="h-4 bg-gray-700 rounded w-2/3"></div>
            </div>
          </div>
        ) : event ? (
          <div className="p-6 space-y-6">
            {/* Event Information Card */}
            <div className="bg-background-primary rounded-lg p-4">
              <h3 className="text-lg font-medium text-text-primary mb-3">Event Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-text-muted">Event Title</p>
                  <p className="text-text-primary">{event.title}</p>
                </div>
                {getSourceLabel() && (
                  <div>
                    <p className="text-sm text-text-muted">Event Type</p>
                    <p className="text-text-primary flex items-center gap-1">
                      <span>{getSourceLabel()?.icon}</span>
                      {getSourceLabel()?.label}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-text-muted">Date & Time</p>
                  <p className="text-text-primary">{formatDateTime(event.start_time)}</p>
                </div>
                {event.end_time && (
                  <div>
                    <p className="text-sm text-text-muted">Duration</p>
                    <p className="text-text-primary">
                      {getEventDuration() || `Until ${formatTime(event.end_time)}`}
                    </p>
                  </div>
                )}
                {event.location && (
                  <div className="col-span-2">
                    <p className="text-sm text-text-muted">Location</p>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(event.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1"
                    >
                      <MapPin className="h-4 w-4" />
                      {event.location}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Description Card */}
            {event.description && (
              <div className="bg-background-primary rounded-lg p-4">
                <h3 className="text-lg font-medium text-text-primary mb-3">Description</h3>
                {/* Make URLs clickable and wrap long content to avoid horizontal scroll */}
                <LinkifiedText text={normalizeRichText(event.description)} />
              </div>
            )}

            {/* Attendees Card */}
            {attendeeNames.length > 0 && (
              <div className="bg-background-primary rounded-lg p-4">
                <h3 className="text-lg font-medium text-text-primary mb-3">Attendees</h3>
                <div className="flex flex-wrap gap-2">
                  {attendeeNames.map((name, index) => (
                    <span
                      key={index}
                      className="px-3 py-1.5 bg-background-secondary border border-gray-600/30 rounded text-sm text-text-primary"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-center text-text-muted">
            Event not found
          </div>
        )}
      </div>
    </div>
  );
}
