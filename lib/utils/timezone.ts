/**
 * Timezone utility functions for handling dates across different timezones
 */

// Get user's timezone
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Get timezone offset in minutes
export function getTimezoneOffset(date: Date = new Date()): number {
  return date.getTimezoneOffset();
}

// Convert UTC to local timezone
export function utcToLocal(dateString: string): Date {
  const date = new Date(dateString);
  return new Date(date.getTime() + date.getTimezoneOffset() * 60000);
}

// Convert local to UTC
export function localToUtc(date: Date): string {
  return date.toISOString();
}

// Format date with timezone
export function formatDateWithTimezone(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    timeZone: getUserTimezone(),
    ...options,
  });
}

// Check if two dates are on the same day (considering timezone)
export function isSameDay(date1: Date | string, date2: Date | string): boolean {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
  
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

// Get start of day in local timezone
export function getStartOfDay(date: Date = new Date()): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

// Get end of day in local timezone
export function getEndOfDay(date: Date = new Date()): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

// Check if date has passed (considering timezone)
export function hasDatePassed(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d < new Date();
}

// Get relative time string
export function getRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (Math.abs(diffDay) > 7) {
    return d.toLocaleDateString();
  } else if (diffDay === 0) {
    if (diffHour === 0) {
      if (diffMin === 0) {
        return 'now';
      }
      return diffMin > 0 ? `in ${diffMin} min` : `${Math.abs(diffMin)} min ago`;
    }
    return diffHour > 0 ? `in ${diffHour}h` : `${Math.abs(diffHour)}h ago`;
  } else if (diffDay === 1) {
    return 'tomorrow';
  } else if (diffDay === -1) {
    return 'yesterday';
  } else {
    return diffDay > 0 ? `in ${diffDay} days` : `${Math.abs(diffDay)} days ago`;
  }
}

// Parse ISO string to local date
export function parseISOToLocal(isoString: string): Date {
  return new Date(isoString);
}

// Store timezone preference
export function setTimezonePreference(timezone: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('user_timezone', timezone);
  }
}

// Get stored timezone preference
export function getTimezonePreference(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('user_timezone');
  }
  return null;
}

// Format date range with smart display
export function formatDateRange(start: Date | string, end: Date | string): string {
  const startDate = typeof start === 'string' ? new Date(start) : start;
  const endDate = typeof end === 'string' ? new Date(end) : end;

  if (isSameDay(startDate, endDate)) {
    // Same day - show date once with time range
    return `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })} - ${endDate.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })}`;
  } else {
    // Different days - show full range
    return `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })} - ${endDate.toLocaleDateString()} ${endDate.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })}`;
  }
}