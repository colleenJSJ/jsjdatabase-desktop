'use client';

import { useState } from 'react';
import { usePreferences } from '@/contexts/preferences-context';
import { toInstantFromNaive, formatInstantInTimeZone } from '@/lib/utils/date-utils';
import { Edit2, Trash2, Calendar, MapPin } from 'lucide-react';

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

  return (
    <div 
      className="bg-background-secondary border border-gray-600/30 rounded-xl p-4 cursor-pointer hover:border-gray-500 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <Calendar className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            {/* Simple Title with Date/Time */}
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-sm font-medium text-text-primary">
                {generateEventTitle(event)}
              </h3>
              {eventDate && (
                <span className="text-xs text-text-muted whitespace-nowrap ml-2">
                  {formatInstantInTimeZone(eventDate, preferences.timezone, { month: 'short', day: 'numeric' })}
                  {(() => { const t = formatInstantInTimeZone(eventDate, preferences.timezone, { hour: 'numeric', minute: '2-digit', hour12: true }); return /12:00 AM/.test(t) ? '' : ` at ${t.toLowerCase()}`; })()}
                </span>
              )}
            </div>
            
            {/* Natural Language Summary */}
            <p className="text-sm text-text-muted">
              {generateEventSummary(event, children)}
            </p>
            
            {/* Additional Notes */}
            {event.description && (
              <p className="text-xs text-text-muted/70 mt-1">
                {event.description}
              </p>
            )}
          </div>
        </div>
        {/* Admin Controls */}
        {isAdmin && (
          <div className="flex items-center gap-1 ml-3">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 text-text-muted hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
