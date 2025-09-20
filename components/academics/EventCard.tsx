'use client';

import { usePreferences } from '@/contexts/preferences-context';
import { toInstantFromNaive, formatInstantInTimeZone } from '@/lib/utils/date-utils';
import { Edit2, Trash2, Calendar } from 'lucide-react';

interface EventCardProps {
  event: any;
  children: { id: string; name: string }[];
  onEdit: () => void;
  onDelete: () => void;
  isAdmin: boolean;
  onClick?: () => void;
}

// Helper function to get first name from full name
const getFirstName = (fullName: string) => {
  return fullName.split(' ')[0];
};

// Helper function to generate event title
const generateEventTitle = (event: any) => {
  const eventType = event.event_type || 'Event';
  const title = event.event_title || 'School Event';
  return title;
};

// Helper function to generate natural language summary
const generateEventSummary = (event: any, children: any[]) => {
  const attendeeNames = event.attendees?.map((id: string) => {
    const child = children.find(c => c.id === id);
    return child ? getFirstName(child.name) : null;
  }).filter(Boolean) || [];
  
  const eventType = event.event_type?.toLowerCase() || 'event';
  const location = event.location;
  
  let sentence = attendeeNames.length > 0 
    ? `${attendeeNames.join(' and ')} will be attending `
    : 'Students will be attending ';
  
  // Add event type with article
  if (eventType === 'meeting') {
    sentence += 'a meeting';
  } else if (eventType === 'conference') {
    sentence += 'a conference';
  } else if (eventType === 'field trip') {
    sentence += 'a field trip';
  } else if (eventType === 'performance') {
    sentence += 'a performance';
  } else if (eventType === 'sports') {
    sentence += 'a sports event';
  } else if (eventType === 'test') {
    sentence += 'a test';
  } else if (eventType === 'deadline') {
    sentence += 'a deadline';
  } else {
    sentence += `a ${eventType}`;
  }
  
  // Add location
  if (location) {
    sentence += ` at ${location}`;
  }
  
  // Add date and time
  if (event.event_date) {
    const date = new Date(event.event_date);
    
    // Format date
    const dateOptions: Intl.DateTimeFormatOptions = { 
      weekday: 'short', 
      month: 'long', 
      day: 'numeric' 
    };
    const dateStr = date.toLocaleDateString('en-US', dateOptions);
    sentence += ` on ${dateStr}`;
    
    // Format time (only if not midnight)
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    if (hours !== 0 || minutes !== 0) {
      const ampm = hours >= 12 ? 'pm' : 'am';
      const hour12 = hours % 12 || 12;
      const timeStr = minutes > 0 ? `${hour12}:${minutes.toString().padStart(2, '0')}${ampm}` : `${hour12}${ampm}`;
      sentence += ` at ${timeStr}`;
    }
  }
  
  sentence += '.';
  
  return sentence;
};

export function EventCard({
  event,
  children,
  onEdit,
  onDelete,
  isAdmin,
  onClick
}: EventCardProps) {
  const { preferences } = usePreferences();
  const eventDate = event.event_date ? toInstantFromNaive(event.event_date, preferences.timezone) : null;
  const summary = generateEventSummary(event, children);

  return (
    <div
      className="bg-background-secondary border border-gray-600/30 hover:border-gray-500 rounded-xl p-4 cursor-pointer transition-colors"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <div className="text-text-muted mt-0.5">
            <Calendar className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-text-primary truncate">
                  {generateEventTitle(event)}
                </h3>
                {summary && (
                  <p className="text-xs text-text-muted mt-1 truncate">
                    {summary}
                  </p>
                )}
              </div>
              {eventDate && (
                <span className="text-xs text-text-muted whitespace-nowrap">
                  {formatInstantInTimeZone(eventDate, preferences.timezone, { month: 'short', day: 'numeric' })}
                  {(() => {
                    const t = formatInstantInTimeZone(eventDate, preferences.timezone, { hour: 'numeric', minute: '2-digit', hour12: true });
                    return /12:00 AM/.test(t) ? '' : ` • ${t.toLowerCase()}`;
                  })()}
                </span>
              )}
            </div>
            {event.description && (
              <p className="text-xs text-text-muted/70 mt-2 line-clamp-2">
                {event.description}
              </p>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 text-text-muted hover:text-urgent transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
