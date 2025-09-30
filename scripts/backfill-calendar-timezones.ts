import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { toInstantFromNaive } from '../lib/utils/date-utils';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const NEEDS_FIX_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

function selectTimezone(ev: any): string {
  return (
    ev?.timezone ||
    ev?.metadata?.timezone ||
    ev?.metadata?.departure_timezone ||
    ev?.metadata?.event_timezone ||
    'America/New_York'
  );
}

function formatWithOffset(instant: Date, tz: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = formatter.formatToParts(instant).reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  const hour = parts.hour;
  const minute = parts.minute;
  const second = parts.second || '00';

  const localUtcTimestamp = Date.UTC(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10),
    parseInt(second, 10)
  );
  const offsetMinutes = Math.round((instant.getTime() - localUtcTimestamp) / 60000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(abs / 60)).padStart(2, '0');
  const offsetMins = String(abs % 60).padStart(2, '0');

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHours}:${offsetMins}`;
}

function needsFix(value?: string | null) {
  if (!value) return false;
  return NEEDS_FIX_REGEX.test(value) && !/(Z|[+-]\d{2}:\d{2})$/i.test(value);
}

async function run() {
  const pageSize = 500;
  let from = 0;
  let totalUpdated = 0;
  let totalExamined = 0;

  while (true) {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('id,start_time,end_time,all_day,timezone,metadata')
      .order('start_time', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Error querying calendar_events:', error);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    const updates: { id: string; start_time?: string; end_time?: string; timezone?: string }[] = [];

    for (const ev of data) {
      totalExamined++;
      if (ev.all_day) continue; // all-day events remain naive local dates

      const tz = selectTimezone(ev);
      let needsUpdate = false;
      let newStart = ev.start_time;
      let newEnd = ev.end_time;

      if (needsFix(ev.start_time)) {
        const instant = toInstantFromNaive(ev.start_time, tz);
        newStart = formatWithOffset(instant, tz);
        needsUpdate = true;
      }

      if (needsFix(ev.end_time)) {
        const instant = toInstantFromNaive(ev.end_time, tz);
        newEnd = formatWithOffset(instant, tz);
        needsUpdate = true;
      }

      if (needsUpdate) {
        updates.push({ id: ev.id, start_time: newStart, end_time: newEnd, timezone: tz });
      }
    }

    if (updates.length > 0) {
      for (const chunk of chunkArray(updates, 100)) {
        const { error: updateError } = await supabase
          .from('calendar_events')
          .upsert(chunk, { onConflict: 'id' });
        if (updateError) {
          console.error('Error updating calendar events:', updateError);
          process.exit(1);
        }
      }
      totalUpdated += updates.length;
      console.log(`Updated ${updates.length} events (processed ${totalExamined} so far).`);
    } else {
      console.log(`No updates needed for records ${from}-${from + data.length - 1}.`);
    }

    from += pageSize;
  }

  console.log(`Done. Examined ${totalExamined} events, updated ${totalUpdated}.`);
  process.exit(0);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
