/**
 * Calendar utility functions for event management and deduplication
 */

import { CalendarEvent } from '@/lib/supabase/types';
import { isSameDay } from './timezone';

// Event source types
export type EventSource = 'calendar' | 'tasks' | 'health' | 'google' | 'manual';

// Check if event is from tasks
export function isTaskEvent(event: CalendarEvent): boolean {
  const title = event.title || '';
  return (
    event.source === 'tasks' ||
    title.startsWith('Task: ') ||
    title.startsWith('[Task]') ||
    Boolean(event.metadata && typeof event.metadata === 'object' && 'task_id' in event.metadata)
  );
}

// Check if event is from health/medical
export function isHealthEvent(event: CalendarEvent): boolean {
  const title = event.title || '';
  return (
    event.source === 'health' ||
    event.category === 'medical' ||
    title.includes('Appointment') ||
    title.includes('Dr.') ||
    Boolean(event.metadata && typeof event.metadata === 'object' && 'appointment_id' in event.metadata)
  );
}

// Generate unique event key for deduplication
export function getEventKey(event: CalendarEvent): string {
  // Use multiple fields to create a unique key
  const parts = [
    event.id,
    event.source || 'manual',
    event.google_event_id || '',
    event.title,
    event.start_time,
  ].filter(Boolean);
  
  return parts.join('::');
}

const extractTaskId = (event: CalendarEvent): string | undefined => {
  const metadata = event.metadata as Record<string, unknown> | undefined;
  const metadataTaskId = typeof metadata?.task_id === 'string' ? (metadata.task_id as string) : undefined;
  const externalId = typeof event.external_id === 'string' ? event.external_id : undefined;
  const titleMatch = event.title?.match(/Task:\s*(.+)/)?.[1];
  return metadataTaskId || externalId || titleMatch;
};

// Deduplicate events
export function deduplicateEvents(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Map<string, CalendarEvent>();
  const taskEventIds = new Set<string>();
  
  // First pass: identify all task events
  events.forEach(event => {
    if (isTaskEvent(event)) {
      // Extract task ID if available
      const taskId = extractTaskId(event);
      if (taskId) {
        taskEventIds.add(taskId);
      }
    }
  });
  
  // Second pass: deduplicate
  events.forEach(event => {
    const key = getEventKey(event);
    
    // Skip duplicate task events
    if (isTaskEvent(event)) {
      const taskId = extractTaskId(event);
      
      // If we've already seen this task, skip it
      if (taskId && seen.has(`task::${taskId}`)) {
        return;
      }
      
      if (taskId) {
        seen.set(`task::${taskId}`, event);
      }
    }
    
    // For non-task events, use the regular key
    if (!seen.has(key)) {
      seen.set(key, event);
    } else {
      // If duplicate, prefer the one with more data
      const existing = seen.get(key)!;
      if (getEventCompleteness(event) > getEventCompleteness(existing)) {
        seen.set(key, event);
      }
    }
  });
  
  return Array.from(seen.values());
}

// Calculate event completeness score (for choosing between duplicates)
function getEventCompleteness(event: CalendarEvent): number {
  let score = 0;
  if (event.title) score += 2;
  if (event.description) score += 1;
  if (event.location) score += 1;
  if (event.attendees?.length) score += 2;
  if (event.category) score += 1;
  if (event.google_event_id) score += 3; // Prefer synced events
  if (event.metadata) score += 1;
  return score;
}

// Filter events by date range
export function filterEventsByDateRange(
  events: CalendarEvent[],
  startDate: Date,
  endDate: Date
): CalendarEvent[] {
  return events.filter(event => {
    const eventStart = new Date(event.start_time);
    const eventEnd = event.end_time ? new Date(event.end_time) : eventStart;
    
    // Event overlaps with the date range
    return eventStart <= endDate && eventEnd >= startDate;
  });
}

// Group events by date
export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const grouped = new Map<string, CalendarEvent[]>();
  
  events.forEach(event => {
    const date = new Date(event.start_time);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey)!.push(event);
  });
  
  // Sort events within each day
  grouped.forEach((dayEvents, key) => {
    dayEvents.sort((a, b) => 
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
  });
  
  return grouped;
}

// Check for event conflicts
export function findEventConflicts(events: CalendarEvent[]): Array<[CalendarEvent, CalendarEvent]> {
  const conflicts: Array<[CalendarEvent, CalendarEvent]> = [];
  
  for (let i = 0; i < events.length - 1; i++) {
    for (let j = i + 1; j < events.length; j++) {
      if (eventsOverlap(events[i], events[j])) {
        conflicts.push([events[i], events[j]]);
      }
    }
  }
  
  return conflicts;
}

// Check if two events overlap
export function eventsOverlap(event1: CalendarEvent, event2: CalendarEvent): boolean {
  const start1 = new Date(event1.start_time);
  const end1 = event1.end_time ? new Date(event1.end_time) : new Date(start1.getTime() + 60 * 60 * 1000); // Default 1 hour
  const start2 = new Date(event2.start_time);
  const end2 = event2.end_time ? new Date(event2.end_time) : new Date(start2.getTime() + 60 * 60 * 1000);
  
  return start1 < end2 && start2 < end1;
}

// Get event color based on category and source
export function getEventColor(event: CalendarEvent): string {
  // Priority: custom color > category color > source color > default
  if (event.color) return event.color;
  
  if (isTaskEvent(event)) {
    return '#8C7348'; // Task color
  }
  
  if (isHealthEvent(event)) {
    return '#5B7CA3'; // Medical color
  }
  
  // Category colors
  const categoryColors: Record<string, string> = {
    medical: '#5B7CA3',
    personal: '#7A6A8A',
    work: '#8C7348',
    family: '#6B8A6B',
    travel: '#6B8A6B',
    school: '#8C7348',
    other: '#7A6A8A',
  };
  
  return categoryColors[event.category || 'other'] || '#7A6A8A';
}

// Format event time for display
export function formatEventTime(event: CalendarEvent): string {
  const start = new Date(event.start_time);
  const end = event.end_time ? new Date(event.end_time) : null;
  
  const timeFormat: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  };
  
  if (event.all_day) {
    return 'All day';
  }
  
  if (end && !isSameDay(start, end)) {
    // Multi-day event
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }
  
  if (end) {
    // Same day with end time
    return `${start.toLocaleTimeString([], timeFormat)} - ${end.toLocaleTimeString([], timeFormat)}`;
  }
  
  // Single time
  return start.toLocaleTimeString([], timeFormat);
}

// Cache for Google Calendar metadata
const googleCalendarCache = new Map<string, any>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export function getCachedGoogleCalendar(calendarId: string): any | null {
  const cached = googleCalendarCache.get(calendarId);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

export function setCachedGoogleCalendar(calendarId: string, data: any): void {
  googleCalendarCache.set(calendarId, {
    data,
    timestamp: Date.now(),
  });
}

export function clearGoogleCalendarCache(): void {
  googleCalendarCache.clear();
}
