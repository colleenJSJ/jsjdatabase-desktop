import { format } from 'date-fns';

export type IcsMethod = 'REQUEST' | 'CANCEL';

interface IcsEventParams {
  uid: string;
  sequence: number;
  method: IcsMethod;
  summary: string;
  description?: string;
  location?: string;
  start: string; // ISO-like local string e.g. 2025-09-02T13:00:00
  end: string;   // same format
  timeZone: string; // e.g. America/New_York (ignored when useUtc=true)
  organizerEmail: string;
  organizerName?: string;
  attendees: string[]; // email addresses
  useUtc?: boolean; // when true, output DTSTART/DTEND in UTC with Z and no TZID
}

function toIcsDateTimeLocal(dt: string): string {
  // Convert YYYY-MM-DDTHH:mm[:ss] to YYYYMMDDTHHMMSS (no timezone suffix)
  let s = dt.trim();
  // Remove trailing Z or offset if present
  s = s.replace(/(Z|[+\-]\d{2}:?\d{2})$/, '');
  // Ensure seconds
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    s = s + ':00';
  }
  return s.replace(/[-:]/g, '');
}

function toIcsDateTimeUtc(dt: string): string {
  // Parse input as Date (respecting any provided offset). If no offset, treat as local time.
  const d = new Date(dt);
  const yyyy = d.getUTCFullYear();
  const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
  const DD = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${MM}${DD}T${hh}${mm}${ss}Z`;
}

export function generateIcs({
  uid,
  sequence,
  method,
  summary,
  description,
  location,
  start,
  end,
  timeZone,
  organizerEmail,
  organizerName,
  attendees,
  useUtc,
}: IcsEventParams): string {
  const stamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");
  const dtStartLocal = toIcsDateTimeLocal(start);
  const dtEndLocal = toIcsDateTimeLocal(end);
  const dtStartUtc = toIcsDateTimeUtc(start);
  const dtEndUtc = toIcsDateTimeUtc(end);

  const orgCn = organizerName ? `CN=${escapeText(organizerName)}:` : '';

  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('PRODID:-//Johnson Office//Calendar//EN');
  lines.push('VERSION:2.0');
  lines.push('CALSCALE:GREGORIAN');
  lines.push(`METHOD:${method}`);
  lines.push('BEGIN:VEVENT');
  lines.push(`UID:${uid}`);
  lines.push(`SEQUENCE:${sequence}`);
  lines.push(`DTSTAMP:${stamp}`);
  if (useUtc) {
    lines.push(`DTSTART:${dtStartUtc}`);
    lines.push(`DTEND:${dtEndUtc}`);
  } else {
    lines.push(`DTSTART;TZID=${timeZone}:${dtStartLocal}`);
    lines.push(`DTEND;TZID=${timeZone}:${dtEndLocal}`);
  }
  if (summary) lines.push(`SUMMARY:${escapeText(summary)}`);
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  // Use MAILTO in uppercase for compatibility with some parsers
  lines.push(`ORGANIZER;${orgCn}MAILTO:${organizerEmail}`);
  attendees.forEach((email) => {
    lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:MAILTO:${email}`);
  });
  lines.push('STATUS:CONFIRMED');
  lines.push('TRANSP:OPAQUE');
  if (method === 'CANCEL') {
    lines.push('STATUS:CANCELLED');
  }
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return foldIcs(lines.join('\r\n')) + '\r\n';
}

function escapeText(input: string): string {
  // Replace common unicode arrows with ASCII to maximize client compatibility
  const normalized = (input || '')
    .replace(/[\u2192\u27F6\u2794]/g, '->') // arrows to ASCII
    .replace(/[\u2013\u2014]/g, '-') // en/em dash to hyphen
    .normalize('NFKC');
  return normalized
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

// Fold lines to 75 octets per RFC 5545 (we approximate to 74 chars)
function foldIcs(ics: string): string {
  const lines = ics.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (line.length <= 74) {
      out.push(line);
      continue;
    }
    let i = 0;
    let first = true;
    while (i < line.length) {
      const chunk = line.slice(i, i + 74);
      out.push(first ? chunk : ' ' + chunk);
      first = false;
      i += 74;
    }
  }
  return out.join('\r\n');
}
