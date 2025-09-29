/**
 * Unified event color system for Google Calendar integration
 * Events get their color from Google Calendar or default neutral gray
 * Categories are for organization only, not visual styling
 */

export interface GoogleCalendar {
  id: string;
  google_calendar_id: string;
  name: string;
  background_color: string | null;
  foreground_color: string | null;
  color_id: string | null;
  is_primary: boolean;
  can_write: boolean;
}

export interface CalendarEvent {
  id: string;
  google_calendar_id?: string | null;
  color?: string | null;
  category?: string | null;
  [key: string]: any;
}

// Default neutral gray for non-Google calendar events
const DEFAULT_EVENT_COLOR = '#6B7280';

// Custom overrides to exactly match the family's Google Calendar palette.
// Keyed by case-insensitive calendar name.
const NAME_COLOR_OVERRIDES: Record<string, string> = {
  'n/a': '#039be5',
  'house guests': '#f6bf25',
  'j3': '#c1ca33',
  'jjss': '#039be5',
  'john': '#3f50b5',
  'susan': '#b39ddb',
  'team members fyi': '#8e24aa',
  'travel': '#d81b60',
  'work deadlines': '#a79b8e',
  'attention': '#009688',
  'holidays in costa rica': '#009688',
  'summer planning': '#ef6c00',
  'visitors in town': '#ef6c00',
};

function normalizeName(name?: string | null): string | null {
  if (!name) return null;
  return name.trim().toLowerCase();
}

/**
 * Get the color for a calendar event
 * Priority:
 * 1. Google Calendar's background color (if event is from Google)
 * 2. Default neutral gray
 */
export function getEventColor(
  event: CalendarEvent,
  googleCalendars: GoogleCalendar[] = [],
  calMap?: Map<string, any>
): string {
  // If event has a google_calendar_id, use that calendar's color
  if (event.google_calendar_id) {
    let calendar: any | undefined = undefined;
    if (calMap) {
      calendar = calMap.get(event.google_calendar_id);
    }
    if (!calendar) {
      calendar = googleCalendars.find(
        (cal: any) => (cal.google_calendar_id || (cal as any).id) === event.google_calendar_id
      );
    }
    const calName = normalizeName(calendar?.name);
    if (calName && NAME_COLOR_OVERRIDES[calName]) {
      return NAME_COLOR_OVERRIDES[calName];
    }
    // Accept both snake_case and camelCase from different API layers
    const bg = calendar?.background_color || calendar?.backgroundColor;
    if (bg) return bg;
    // Fallback to colorId mapping if present
    const mapped = getGoogleColorFromId(calendar?.color_id || calendar?.colorId || null);
    if (mapped) return mapped.background;
  }
  
  // Default to neutral gray for all other events
  return DEFAULT_EVENT_COLOR;
}

/**
 * Get text color for an event based on its background color
 * Uses simple luminance calculation to determine if text should be white or black
 */
export function getEventTextColor(backgroundColor: string): string {
  // Convert hex to RGB
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return white for dark backgrounds, black for light
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

/**
 * Google Calendar default color palette
 * Maps Google's colorId to hex colors
 */
export const GOOGLE_CALENDAR_COLORS: Record<string, { background: string; foreground: string }> = {
  '1': { background: '#7986CB', foreground: '#FFFFFF' }, // Lavender
  '2': { background: '#33B679', foreground: '#FFFFFF' }, // Sage
  '3': { background: '#8E24AA', foreground: '#FFFFFF' }, // Grape
  '4': { background: '#E67C73', foreground: '#FFFFFF' }, // Flamingo
  '5': { background: '#F6BF26', foreground: '#000000' }, // Banana
  '6': { background: '#F4511E', foreground: '#FFFFFF' }, // Tangerine
  '7': { background: '#039BE5', foreground: '#FFFFFF' }, // Peacock
  '8': { background: '#616161', foreground: '#FFFFFF' }, // Graphite
  '9': { background: '#3F51B5', foreground: '#FFFFFF' }, // Blueberry
  '10': { background: '#0B8043', foreground: '#FFFFFF' }, // Basil
  '11': { background: '#D50000', foreground: '#FFFFFF' }, // Tomato
};

/**
 * Get Google color from colorId
 */
export function getGoogleColorFromId(colorId: string | null): { background: string; foreground: string } | null {
  if (!colorId) return null;
  return GOOGLE_CALENDAR_COLORS[colorId] || null;
}
