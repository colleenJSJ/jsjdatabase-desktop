const extractTimeParts = (raw: string): { hour: number; minute: number; second: number } | null => {
  if (!raw) return null;
  const directMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);

  if (!directMatch) {
    if (/^\d{3,4}$/.test(raw)) {
      const padded = raw.padStart(4, '0');
      const hour = parseInt(padded.slice(0, 2), 10);
      const minute = parseInt(padded.slice(2), 10);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return { hour, minute, second: 0 };
      }
    }
    return null;
  }

  let hour = parseInt(directMatch[1], 10);
  const minute = parseInt(directMatch[2], 10);
  const second = directMatch[3] ? parseInt(directMatch[3], 10) : 0;

  if ([hour, minute, second].some(v => Number.isNaN(v))) return null;
  if (minute > 59 || second > 59) return null;

  const meridiemMatch = raw.toLowerCase().match(/\b(am|pm)\b/);
  if (meridiemMatch) {
    const meridiem = meridiemMatch[1];
    hour = hour % 12;
    if (meridiem === 'pm') {
      hour += 12;
    }
  }

  if (hour >= 24) {
    if (hour === 24 && minute === 0 && second === 0) {
      hour = 0;
    } else {
      return null;
    }
  }

  return { hour, minute, second };
};

export const toDateTime = (date?: string | null, time?: string | null): Date | null => {
  const hasDate = Boolean(date);
  const rawTime = time ? String(time).trim() : '';

  if (rawTime) {
    if (rawTime.includes('T')) {
      const isoCandidate = new Date(rawTime);
      if (!Number.isNaN(isoCandidate.getTime())) {
        return isoCandidate;
      }
    }

    const parts = extractTimeParts(rawTime);
    if (parts) {
      const base = hasDate ? new Date(`${date}T00:00:00`) : new Date('1970-01-01T00:00:00');
      if (!Number.isNaN(base.getTime())) {
        base.setHours(parts.hour, parts.minute, parts.second, 0);
        return base;
      }
    }

    const fallback = new Date(rawTime);
    if (!Number.isNaN(fallback.getTime())) {
      return fallback;
    }
  }

  if (hasDate) {
    const dateOnly = new Date(`${date}T00:00:00`);
    if (!Number.isNaN(dateOnly.getTime())) {
      return dateOnly;
    }
  }

  return null;
};

export const formatTimeOnly = (
  date?: string | null,
  time?: string | null,
  includeTimeZone = true,
  timeZone?: string
): string => {
  if (!time) return '';
  const dt = toDateTime(date, time);
  if (dt) {
    const opts: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
    if (timeZone) {
      opts.timeZone = timeZone;
    }
    if (includeTimeZone) {
      opts.timeZoneName = 'short';
    }
    const formatted = new Intl.DateTimeFormat('en-US', opts).format(dt);
    return formatted.replace(' AM', 'AM').replace(' PM', 'PM');
  }
  return String(time).trim();
};

export function formatDateTime(
  date?: string | null,
  time?: string | null,
  options?: { connector?: 'at' | '@'; includeTimeZone?: boolean; timeZone?: string }
): string {
  if (!date && !time) return '';

  const connector = options?.connector === '@' ? '@' : 'at';
  const includeTimeZone = options?.includeTimeZone !== false;
  const timeZone = options?.timeZone;

  if (date && time) {
    const dt = toDateTime(date, time);
    if (dt) {
      const datePartOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
      if (timeZone) {
        datePartOptions.timeZone = timeZone;
      }
      const datePart = new Intl.DateTimeFormat('en-US', datePartOptions).format(dt);
      const timePart = formatTimeOnly(date, time, includeTimeZone, timeZone);
      return `${datePart} ${connector} ${timePart}`;
    }
  }

  if (date) {
    const dt = toDateTime(date, null);
    if (dt) {
      const datePartOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
      if (timeZone) {
        datePartOptions.timeZone = timeZone;
      }
      return new Intl.DateTimeFormat('en-US', datePartOptions).format(dt);
    }
    return date;
  }

  return formatTimeOnly(undefined, time, includeTimeZone, timeZone);
}

const normalizeNullableString = (value?: string | null): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const extractDateFromDateTime = (value?: string | null): string | undefined => {
  const normalized = normalizeNullableString(value);
  if (!normalized || !normalized.includes('T')) return undefined;
  return normalized.split('T')[0];
};

const resolveDateSource = (
  explicit?: string | null,
  fallback?: string | null,
  datetime?: string | null
): string | undefined => {
  return normalizeNullableString(explicit)
    ?? extractDateFromDateTime(datetime)
    ?? normalizeNullableString(fallback);
};

const resolveTimeSource = (explicit?: string | null, datetime?: string | null): string | undefined => {
  return normalizeNullableString(explicit) ?? normalizeNullableString(datetime);
};

type TravelDetailInput = {
  travel_date?: string | null;
  departure_date?: string | null;
  departure_time?: string | null;
  departure_datetime?: string | null;
  arrival_date?: string | null;
  arrival_time?: string | null;
  arrival_datetime?: string | null;
  details?: unknown;
  [key: string]: unknown;
};

const readDetailValue = (obj: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return undefined;
};

export const resolveTravelDateTimes = (detail: TravelDetailInput) => {
  const travelDate = normalizeNullableString(detail?.travel_date);
  const departureDate = resolveDateSource(detail?.departure_date, travelDate, detail?.departure_datetime);
  const arrivalDate = resolveDateSource(detail?.arrival_date, travelDate, detail?.arrival_datetime) || departureDate || travelDate;
  const departureTime = resolveTimeSource(detail?.departure_time, detail?.departure_datetime);
  const arrivalTime = resolveTimeSource(detail?.arrival_time, detail?.arrival_datetime);

  const detailsRaw = detail?.details;
  const detailsJson: Record<string, unknown> = detailsRaw && typeof detailsRaw === 'object' ? (detailsRaw as Record<string, unknown>) : {};
  const nestedDepartureDateTime = normalizeNullableString(readDetailValue(detailsJson, ['departure_datetime', 'departureDateTime']));
  const nestedArrivalDateTime = normalizeNullableString(readDetailValue(detailsJson, ['arrival_datetime', 'arrivalDateTime']));
  const nestedDepartureDate = normalizeNullableString(readDetailValue(detailsJson, ['departure_date', 'departureDate']));
  const nestedArrivalDate = normalizeNullableString(readDetailValue(detailsJson, ['arrival_date', 'arrivalDate']));
  const nestedDepartureTime = normalizeNullableString(readDetailValue(detailsJson, ['departure_time', 'departureTime']));
  const nestedArrivalTime = normalizeNullableString(readDetailValue(detailsJson, ['arrival_time', 'arrivalTime']));

  const resolvedDepartureDate = departureDate || resolveDateSource(nestedDepartureDate, travelDate, nestedDepartureDateTime);
  const resolvedArrivalDate = arrivalDate || resolveDateSource(nestedArrivalDate, resolvedDepartureDate || travelDate, nestedArrivalDateTime);
  const resolvedDepartureTime = departureTime || resolveTimeSource(nestedDepartureTime, nestedDepartureDateTime);
  const resolvedArrivalTime = arrivalTime || resolveTimeSource(nestedArrivalTime, nestedArrivalDateTime);

  return {
    departureDate: resolvedDepartureDate,
    departureTime: resolvedDepartureTime,
    arrivalDate: resolvedArrivalDate,
    arrivalTime: resolvedArrivalTime,
  } as {
    departureDate?: string;
    departureTime?: string;
    arrivalDate?: string;
    arrivalTime?: string;
  };
};
