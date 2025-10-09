/**
 * Utility functions for consistent date handling across the calendar
 */

/**
 * Parse a date string and ensure it's treated as local time
 * This prevents timezone shift issues when displaying calendar events
 */
export function parseLocalDate(dateString: string): Date {
  if (!dateString) return new Date(NaN);
  let s = dateString.trim();
  // Legacy behavior: treat input as local wall-clock by stripping trailing timezone
  s = s.replace(/(Z|[+-]\d{2}:?\d{2})$/, '');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00';
  return new Date(s);
}

/**
 * Parse a datetime string preserving timezone when present.
 * - If input ends with Z or an explicit offset, return Date parsed as-is (UTC-aware).
 * - If no timezone is present, treat as local wall-clock.
 */
export function parseDateFlexible(dateString: string): Date {
  if (!dateString) return new Date(NaN);
  const trimmed = dateString.trim();

  // If the input contains an explicit timezone or Z suffix, respect it so the
  // resulting Date represents the real instant in time (critical for Google
  // Calendar events which include offsets like -04:00).
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    return new Date(trimmed);
  }

  // Otherwise treat it as a local wall-clock value (the format we store in the
  // database). Ensure seconds are present for stable parsing across browsers.
  let normalized = trimmed;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    normalized += ':00';
  }
  return new Date(normalized);
}

/**
 * Compare if two dates are on the same day (ignoring time)
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

/**
 * Get the start of day for a given date
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get the end of day for a given date
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Check if an event overlaps with a given date
 */
export function eventOverlapsDate(eventStart: Date, eventEnd: Date, date: Date): boolean {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  return eventStart <= dayEnd && eventEnd >= dayStart;
}

/**
 * Check if an event overlaps with a given hour on a specific date
 */
export function eventOverlapsHour(eventStart: Date, eventEnd: Date, date: Date, hour: number): boolean {
  const cellStart = new Date(date);
  cellStart.setHours(hour, 0, 0, 0);
  const cellEnd = new Date(date);
  cellEnd.setHours(hour + 1, 0, 0, 0);
  
  // Handle point-in-time events (where end <= start)
  let effectiveEnd = eventEnd;
  if (eventEnd <= eventStart) {
    effectiveEnd = new Date(eventStart.getTime() + 60000); // Add 1 minute for overlap calculation
  }
  
  return eventStart < cellEnd && effectiveEnd > cellStart;
}

/**
 * Format a date for consistent storage in the database
 */
export function formatDateForStorage(date: Date): string {
  // Store in ISO format but ensure it represents local time
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Parse an all-day date component into a local Date at start/end of day.
 * This avoids UTC shifts that can move an all-day event to the wrong day locally.
 */
export function parseAllDayDate(dateTimeString: string, options?: { endOfDay?: boolean; adjustExclusiveEnd?: boolean }): Date {
  const { endOfDay = false } = options || {};
  const [ymd, timePart] = dateTimeString.split('T');
  const [y, m, d] = ymd.split('-').map(n => parseInt(n, 10));
  if (endOfDay) {
    return new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
  }
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

/**
 * Get a normalized local range for an event. For all-day events, uses only the
 * date parts and treats the end as inclusive end-of-day. Handles Google-style
 * exclusive end at midnight by subtracting one day for all-day ranges.
 */
export function getEventRangeLocal(event: { start_time: string; end_time: string; all_day?: boolean }): { start: Date; end: Date } {
  if (event.all_day) {
    const [startYMD] = event.start_time.split('T');
    const [endYMD, endTime] = event.end_time.split('T');
    let start = parseAllDayDate(event.start_time, { endOfDay: false });
    let end = parseAllDayDate(event.end_time, { endOfDay: true });

    // If end is midnight and end date is after start date, treat Google exclusive end
    if (endTime && endTime.startsWith('00:00') && endYMD && startYMD && endYMD !== startYMD) {
      // Move to previous day 23:59:59.999
      end = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1, 23, 59, 59, 999);
    }
    return { start, end };
  }
  // Timed events: preserve timezone if present; otherwise local wall-clock
  return { start: parseDateFlexible(event.start_time), end: parseDateFlexible(event.end_time) };
}

/**
 * Determine the preferred timezone for displaying an event.
 * Priority: event.metadata.timezone -> calendar.time_zone -> browser timezone.
 */
export function getEventTimeZone(
  event: any,
  googleCalendars?: Array<any>,
  calMap?: Map<string, any>
): string {
  // 0) Explicit event column timezone if available
  const colTz = (event as any)?.timezone;
  if (typeof colTz === 'string' && colTz.length > 0) return colTz;
  // 1) Event metadata timezone if available
  const tz = event?.metadata?.timezone;
  if (typeof tz === 'string' && tz.length > 0) return tz;

  // 2) Google calendar timezone from map or list
  const calId = event?.google_calendar_id;
  let cal: any | undefined = undefined;
  if (calMap && calId) {
    cal = calMap.get(calId);
  }
  if (!cal && googleCalendars && calId) {
    cal = googleCalendars.find((c: any) => (c.google_calendar_id || c.id) === calId);
  }
  const calendarTz = cal?.time_zone || cal?.timeZone;
  if (typeof calendarTz === 'string' && calendarTz.length > 0) return calendarTz;

  // 3) Fallback to browser timezone
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Format a datetime string in a specific IANA timezone using Intl.
 */
export function formatInTimeZone(
  dateString: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
): string {
  const d = parseDateFlexible(dateString);
  return getCachedFormatter(timeZone, options).format(d);
}

/**
 * Convert a naive local datetime string (YYYY-MM-DDTHH:mm[:ss]) that represents
 * wall-clock time in a specific IANA timezone into a real instant (Date).
 */
export function toInstantFromNaive(naive: string, tz: string): Date {
  const cacheKey = `${naive}|${tz}`;
  const cached = _naiveInstantCache.get(cacheKey);
  if (cached) return cached;
  try {
    const [d, t = '00:00:00'] = naive.split('T');
    const [y, m, day] = d.split('-').map((n) => parseInt(n, 10));
    const timePart = t.replace(/([+-]\d{2}):?\d{2}$/i, '');
    const [hh, mm = '00', ss = '00'] = timePart.split(':');
    const desiredUtc = Date.UTC(y, (m || 1) - 1, day || 1, parseInt(hh, 10), parseInt(mm, 10), parseInt(ss, 10));
    const guess = new Date(desiredUtc);
    const parts = getCachedFormatter(tz, {
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(guess);
    const toMap = (arr: Intl.DateTimeFormatPart[]) => arr.reduce((acc: any, p) => { acc[p.type] = p.value; return acc; }, {} as any);
    const seen = toMap(parts);
    const seenUtc = Date.UTC(parseInt(seen.year, 10), parseInt(seen.month, 10) - 1, parseInt(seen.day, 10), parseInt(seen.hour, 10), parseInt(seen.minute, 10), parseInt(seen.second, 10));
    const corrected = new Date(guess.getTime() + (desiredUtc - seenUtc));
    _naiveInstantCache.set(cacheKey, corrected);
    return corrected;
  } catch {
    const d = new Date(naive);
    _naiveInstantCache.set(cacheKey, d);
    return d;
  }
}

// Formatter cache to avoid constructing Intl.DateTimeFormat repeatedly
const _fmtCache = new Map<string, Intl.DateTimeFormat>();
const _naiveInstantCache = new Map<string, Date>();
function optionsKey(opts: Intl.DateTimeFormatOptions): string {
  // Build a stable, small key from commonly used fields
  const {
    hour12, hourCycle, year, month, day, hour, minute, second, timeZoneName
  } = opts;
  return `${hour12 ?? ''}|${hourCycle ?? ''}|${year ?? ''}|${month ?? ''}|${day ?? ''}|${hour ?? ''}|${minute ?? ''}|${second ?? ''}|${timeZoneName ?? ''}`;
}
export function getCachedFormatter(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone}|${optionsKey(options)}`;
  let fmt = _fmtCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone, ...options });
    _fmtCache.set(key, fmt);
  }
  return fmt;
}

export function formatInstantInTimeZone(d: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return getCachedFormatter(timeZone, options).format(d);
}

/**
 * Determine if an event (stored as naive local strings in its own timezone)
 * overlaps a target day when viewed in viewerTz.
 */
const OFFSET_REGEX = /(Z|[+-]\d{2}:?\d{2})$/i;

export function toInstantFromEventString(value: string, tz: string): Date {
  if (!value) return new Date(NaN);
  if (OFFSET_REGEX.test(value.trim())) {
    return new Date(value);
  }
  return toInstantFromNaive(value, tz);
}

export function isEventOnDayInViewerTZ(startString: string, endString: string, eventTz: string, targetDate: Date, viewerTz: string): boolean {
  const startInstant = toInstantFromEventString(startString, eventTz);
  const endInstant = toInstantFromEventString(endString, eventTz);
  const start = getZonedParts(startInstant, viewerTz);
  const end = getZonedParts(endInstant, viewerTz);
  const target = getZonedParts(targetDate, viewerTz);
  return compareYmd(start, target) <= 0 && compareYmd(target, end) <= 0;
}

/**
 * Get start/end minutes within a target day in viewerTz from an event stored
 * as naive strings in eventTz.
 */
export function getStartEndMinutesOnDayInViewerTZ(startString: string, endString: string, eventTz: string, targetDate: Date, viewerTz: string): { startMin: number; endMin: number } {
  const startInstant = toInstantFromEventString(startString, eventTz);
  const endInstant = toInstantFromEventString(endString, eventTz);
  const start = getZonedParts(startInstant, viewerTz);
  const end = getZonedParts(endInstant, viewerTz);
  const target = getZonedParts(targetDate, viewerTz);

  // Start minutes
  let startMin: number;
  const cmpStart = compareYmd(start, target);
  if (cmpStart < 0) startMin = 0;
  else if (cmpStart > 0) startMin = 24 * 60;
  else startMin = start.hour * 60 + start.minute;

  // End minutes
  let endMin: number;
  const cmpEnd = compareYmd(end, target);
  if (cmpEnd > 0) endMin = 24 * 60;
  else if (cmpEnd < 0) endMin = 0;
  else endMin = end.hour * 60 + end.minute;
  // Ensure end > start by at least 1 minute for zero-duration events
  if (endMin <= startMin) endMin = Math.min(24 * 60, startMin + 1);
  return { startMin, endMin };
}

/**
 * Parse a date-only string (YYYY-MM-DD) as a local Date at midnight.
 * Avoids the default JS behavior where `new Date('YYYY-MM-DD')` is UTC.
 */
export function parseDateOnlyLocal(ymd: string): Date {
  if (!ymd) return new Date(NaN);
  const [y, m, d] = ymd.split('T')[0].split('-').map(n => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

/**
 * Extract zoned Y-M-D H:M parts for a given instant in a specific IANA timezone.
 */
export function getZonedParts(dateString: string | Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const d = typeof dateString === 'string' ? parseDateFlexible(dateString) : dateString;
  const cacheKey = `${d.getTime()}|${timeZone}`;
  const cached = _zonedPartsCache.get(cacheKey);
  if (cached) return cached;
  const parts = getCachedFormatter(timeZone, {
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
  const year = parseInt(get('year'), 10) || d.getUTCFullYear();
  const month = parseInt(get('month'), 10) || (d.getUTCMonth() + 1);
  const day = parseInt(get('day'), 10) || d.getUTCDate();
  const hour = parseInt(get('hour'), 10) || 0;
  const minute = parseInt(get('minute'), 10) || 0;
  const second = parseInt(get('second'), 10) || 0;
  const res = { year, month, day, hour, minute, second };
  _zonedPartsCache.set(cacheKey, res);
  return res;
}

// Cache for getZonedParts results
const _zonedPartsCache = new Map<string, { year: number; month: number; day: number; hour: number; minute: number; second: number }>();

function compareYmd(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/**
 * Determine if an event (by instants) overlaps a target day in a timezone.
 */
export function isEventOnDayInTZ(startString: string, endString: string, targetDate: Date, timeZone: string): boolean {
  const start = getZonedParts(startString, timeZone);
  const end = getZonedParts(endString, timeZone);
  const target = getZonedParts(targetDate, timeZone);
  return compareYmd(start, target) <= 0 && compareYmd(target, end) <= 0;
}

/**
 * Get start and end minutes on the target day in a timezone, clipped to [0, 1440].
 * Guarantees end > start by at least 1 minute for zero-duration events.
 */
export function getStartEndMinutesOnDayInTZ(startString: string, endString: string, targetDate: Date, timeZone: string): { startMin: number; endMin: number } {
  const start = getZonedParts(startString, timeZone);
  const end = getZonedParts(endString, timeZone);
  const target = getZonedParts(targetDate, timeZone);

  // Start minutes
  let startMin: number;
  const cmpStart = compareYmd(start, target);
  if (cmpStart < 0) startMin = 0; // started before this day
  else if (cmpStart > 0) startMin = 24 * 60; // starts after this day
  else startMin = start.hour * 60 + start.minute;

  // End minutes
  let endMin: number;
  const cmpEnd = compareYmd(end, target);
  if (cmpEnd > 0) endMin = 24 * 60; // ends after this day
  else if (cmpEnd < 0) endMin = 0; // ended before this day
  else endMin = end.hour * 60 + end.minute;

  // Ensure at least 1 minute for zero/negative durations
  if (endMin <= startMin) endMin = Math.min(startMin + 1, 24 * 60);

  // Clip bounds
  startMin = Math.max(0, Math.min(24 * 60, startMin));
  endMin = Math.max(0, Math.min(24 * 60, endMin));

  return { startMin, endMin };
}

/**
 * Check hour overlap in a timezone for a given target day.
 */
export function eventOverlapsHourInTZ(startString: string, endString: string, targetDate: Date, hour: number, timeZone: string): boolean {
  const { startMin, endMin } = getStartEndMinutesOnDayInTZ(startString, endString, targetDate, timeZone);
  const cellStart = hour * 60;
  const cellEnd = (hour + 1) * 60;
  return startMin < cellEnd && endMin > cellStart;
}
