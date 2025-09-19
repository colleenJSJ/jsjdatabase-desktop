export interface IcsEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  start: string; // ISO local
  end: string;   // ISO local
  organizerName?: string;
  organizerEmail?: string;
  attendees?: { name?: string; email: string }[];
  timezone?: string; // e.g., America/New_York
  sequence?: number;
}

function formatDateTime(dt: string): string {
  // Keep local time without Z to avoid unwanted conversions
  // Convert "YYYY-MM-DDTHH:mm[:ss]" to "YYYYMMDDTHHmmss"
  const [date, time] = dt.split('T');
  const d = date.replace(/-/g, '');
  const t = (time || '00:00:00').replace(/:/g, '').slice(0, 6);
  return `${d}T${t}`;
}

export function buildIcs(event: IcsEvent): string {
  const lines: string[] = [];
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const seq = event.sequence ?? 0;

  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Johnson Family Office//Calendar//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:REQUEST');
  if (event.timezone) {
    // Minimal VTIMEZONE wrapper (client will map TZID)
    lines.push('BEGIN:VTIMEZONE');
    lines.push(`TZID:${escapeText(event.timezone)}`);
    lines.push('END:VTIMEZONE');
  }
  lines.push('BEGIN:VEVENT');
  lines.push(`UID:${event.uid}`);
  lines.push(`DTSTAMP:${now}Z`);
  if (event.timezone) {
    lines.push(`DTSTART;TZID=${escapeText(event.timezone)}:${formatDateTime(event.start)}`);
    lines.push(`DTEND;TZID=${escapeText(event.timezone)}:${formatDateTime(event.end)}`);
  } else {
    lines.push(`DTSTART:${formatDateTime(event.start)}`);
    lines.push(`DTEND:${formatDateTime(event.end)}`);
  }
  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.url) lines.push(`URL:${escapeText(event.url)}`);
  if (event.organizerEmail) {
    const cn = event.organizerName ? `;CN=${escapeParam(event.organizerName)}` : '';
    lines.push(`ORGANIZER${cn}:mailto:${event.organizerEmail}`);
  }
  (event.attendees || []).forEach(a => {
    const cn = a.name ? `;CN=${escapeParam(a.name)}` : '';
    lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE${cn}:mailto:${a.email}`);
  });
  lines.push(`SEQUENCE:${seq}`);
  lines.push('STATUS:CONFIRMED');
  lines.push('TRANSP:OPAQUE');
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

export function buildInviteHtml(params: {
  title: string;
  start: string;
  end: string;
  timezone?: string;
  location?: string;
  description?: string;
  detailsUrl?: string;
  mapUrl?: string;
}): string {
  const { title, start, end, timezone, location, description, detailsUrl, mapUrl } = params;
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + (timezone ? ` (${timezone})` : '');
  return `
  <div style="font-family: Inter, Arial, sans-serif; color: #e5e7eb; background:#1f2937; padding:16px;">
    <div style="max-width:640px;margin:0 auto;background:#111827;border:1px solid #374151;border-radius:8px;">
      <div style="padding:20px 24px;">
        <h2 style="margin:0 0 8px 0;color:#fff;font-size:18px;">${escapeHtml(title)}</h2>
        <div style="color:#9ca3af;font-size:14px;margin-bottom:12px;">${fmt(start)} – ${fmt(end)}</div>
        ${description ? `<div style="font-size:14px;white-space:pre-wrap;margin-bottom:12px;">${escapeHtml(description)}</div>` : ''}
        ${location ? `<div style="margin-bottom:12px;">
            <div style="color:#9ca3af;font-size:12px;">Location</div>
            <div style="color:#e5e7eb;font-size:14px;">${escapeHtml(location)}</div>
            ${mapUrl ? `<a href="${mapUrl}" style="color:#60a5fa;font-size:12px;">View map</a>` : ''}
          </div>` : ''}
        ${detailsUrl ? `<a href="${detailsUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:8px 12px;border-radius:6px;font-size:12px;text-decoration:none;">View all event details</a>` : ''}
      </div>
    </div>
  </div>`;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
function escapeParam(s: string): string {
  return s.replace(/[,;]/g, '');
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
