import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CalendarEvent } from '@/lib/supabase/types';
import { resolvePersonReferences, expandPersonReferences } from '@/app/api/_helpers/person-resolver';
import { applyPersonFilter } from '@/app/api/_helpers/apply-person-filter';
import { logActivity } from '@/app/api/_helpers/log-activity';
import { resolveCSRFTokenFromRequest } from '@/lib/security/csrf';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[Calendar API] Auth error:', userError?.message || 'No user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get user role for admin check
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    // Get query parameters for filtering
    const searchParams = request.nextUrl.searchParams;
    const eventId = searchParams.get('id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const category = searchParams.get('category');
    const attendee = searchParams.get('attendee'); // Keep for backward compatibility
    const selectedPerson = searchParams.get('selected_person'); // New unified filter

    // If fetching a specific event by ID
    if (eventId) {
      const { data: event, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (error) {
        console.error('Error fetching calendar event by ID:', error);
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }

      return NextResponse.json({ events: [event] });
    }

    // Build query for multiple events
    let query = supabase
      .from('calendar_events')
      .select('*')
      .order('start_time', { ascending: true });

    // Apply filters
    if (startDate) {
      query = query.gte('start_time', startDate);
    }
    if (endDate) {
      query = query.lte('start_time', endDate);
    }
    if (category) {
      query = query.eq('category', category);
    }
    
    // Apply person filtering with new unified approach
    // Use selected_person if available, otherwise fall back to attendee for backward compatibility
    const personFilter = (selectedPerson ?? attendee ?? undefined) as string | undefined;
    
    query = await applyPersonFilter({
      query,
      selectedPerson: personFilter,
      userId: user.id,
      module: 'calendar',
      columnName: 'attendees',
      isAdmin: userData?.role === 'admin'
    });

    const { data: events, error } = await query;

    if (error) {
      console.error('Error fetching calendar events:', error);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    return NextResponse.json({ events: events || [] });
  } catch (error) {
    console.error('Error in GET /api/calendar-events:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  console.log('[Calendar API POST] === Starting request processing ===');
  
  try {
    console.log('[Calendar API POST] Creating Supabase client...');
    let supabase;
    try {
      supabase = await createClient();
      console.log('[Calendar API POST] Supabase client created successfully');
    } catch (clientError) {
      console.error('[Calendar API POST] Error creating Supabase client:', clientError);
      return NextResponse.json({ 
        error: 'Unauthorized',
        details: 'Failed to initialize database connection'
      }, { status: 401 });
    }
    
    // Get user
    console.log('[Calendar API POST] Getting authenticated user...');
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[Calendar API POST] Auth error:', userError?.message || 'No user');
      return NextResponse.json({ error: 'Unauthorized', details: userError?.message }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    console.log('[Calendar API POST] Request body:', JSON.stringify(body, null, 2));
    const { event } = body;

    if (!event || !event.title || !event.start_time) {
      console.error('[Calendar API POST] Missing required fields:', { 
        hasEvent: !!event, 
        hasTitle: !!event?.title, 
        hasStartTime: !!event?.start_time
      });
      return NextResponse.json({ 
        error: 'Missing required fields', 
        details: {
          hasEvent: !!event, 
          hasTitle: !!event?.title, 
          hasStartTime: !!event?.start_time
        }
      }, { status: 400 });
    }

    // Normalize incoming times: strip trailing zone markers and ensure seconds
    const stripZone = (s: string) => s.replace(/(Z|[+-]\d{2}:?\d{2})$/, '');
    const ensureSeconds = (s: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? `${s}:00` : s);
    if (typeof event.start_time === 'string') {
      const before = event.start_time;
      event.start_time = ensureSeconds(stripZone(event.start_time));
      if (before !== event.start_time) console.log('[Calendar API POST] Normalized start_time', { before, after: event.start_time });
    }
    if (typeof event.end_time === 'string') {
      const before = event.end_time;
      event.end_time = ensureSeconds(stripZone(event.end_time));
      if (before !== event.end_time) console.log('[Calendar API POST] Normalized end_time', { before, after: event.end_time });
    }

    // Normalize end_time based on event type and category
    let finalEndTime = event.end_time;
    
    if (!event.all_day) {
      // For timed events
      if (!finalEndTime || new Date(finalEndTime) <= new Date(event.start_time)) {
        // For travel and other timed events, allow point-in-time by setting end = start
        finalEndTime = event.start_time;
        console.log('[Calendar API POST] Normalizing timed event with no/invalid end; setting end = start');
      }
    } else {
      // All-day events: ensure end_time is set
      if (!finalEndTime) {
        finalEndTime = event.start_time;
      }
      // End time will be adjusted to end of day later in the code
    }
    
    // Update event object with normalized end_time
    event.end_time = finalEndTime;

    // IMPORTANT: Do not pre-convert naive timestamps to UTC here.
    // We persist the wall-clock strings exactly as entered (no Z/offset),
    // and when pushing to Google we pass an explicit timeZone so Google
    // interprets them correctly as local times. Any UTC conversion here
    // would shift the event by the zone offset when later interpreted as local.

    // Handle attendees - prioritize attendee_ids if provided
    console.log('[Calendar API POST] Processing attendees...');
    console.log('[Calendar API POST] attendee_ids:', event.attendee_ids);
    console.log('[Calendar API POST] attendees:', event.attendees);
    
    let finalAttendeeIds = [];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    // If attendee_ids are provided (UUIDs), validate and use them
    if (event.attendee_ids && Array.isArray(event.attendee_ids)) {
      console.log('[Calendar API POST] Validating provided attendee_ids (UUIDs)');
      // Validate each UUID and filter out invalid ones
      const validatedIds = event.attendee_ids.filter((id: string) => {
        const isValid = typeof id === 'string' && uuidRegex.test(id);
        if (!isValid) {
          console.warn('[Calendar API POST] Invalid UUID filtered out:', id);
        }
        return isValid;
      });
      finalAttendeeIds = validatedIds;
      console.log('[Calendar API POST] Valid attendee_ids:', finalAttendeeIds.length, 'of', event.attendee_ids.length);
    } 
    // Otherwise, try to resolve attendees (names/emails) to UUIDs
    else if (event.attendees) {
      console.log('[Calendar API POST] Attempting to resolve attendees to UUIDs...');
      try {
        const resolvedAttendees = await resolvePersonReferences(event.attendees);
        console.log('[Calendar API POST] Resolved attendees:', resolvedAttendees);
        if (resolvedAttendees) {
          const resolved = Array.isArray(resolvedAttendees) ? resolvedAttendees : [resolvedAttendees];
          // Validate resolved IDs as well
          finalAttendeeIds = resolved.filter((id: string) => typeof id === 'string' && uuidRegex.test(id));
        }
      } catch (resolveError) {
        console.error('[Calendar API POST] Error resolving attendees:', resolveError);
        // Continue without attendees rather than failing
        finalAttendeeIds = [];
      }
    }
    
    // Deduplicate attendee IDs
    finalAttendeeIds = [...new Set(finalAttendeeIds)];
    
    // Process external email attendees from metadata, with robust fallbacks
    let externalEmails: string[] = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    // 1) Prefer explicit metadata.additional_attendees
    if (Array.isArray(event.metadata?.additional_attendees)) {
      externalEmails = (event.metadata!.additional_attendees as string[])
        .filter((e) => typeof e === 'string')
        .map((e) => e.trim())
        .filter((e) => emailRegex.test(e));
    } else if (typeof event.metadata?.additional_attendees === 'string') {
      // Support string format: "a@b.com, c@d.com"
      externalEmails = (event.metadata!.additional_attendees as string)
        .split(',')
        .map((e) => e.trim())
        .filter((e) => emailRegex.test(e));
    }

    // 2) Fallback: scan incoming attendees for raw email strings
    // Some clients may pass external emails via event.attendees
    if ((!externalEmails || externalEmails.length === 0) && event.attendees) {
      const raw = Array.isArray(event.attendees) ? event.attendees : [event.attendees];
      const fromAttendees = raw
        .filter((e: any) => typeof e === 'string')
        .map((e: string) => e.trim())
        .filter((e: string) => emailRegex.test(e));
      if (fromAttendees.length > 0) {
        externalEmails = fromAttendees;
      }
    }

    // 3) Deduplicate and normalize case
    externalEmails = Array.from(new Set((externalEmails || []).map((e) => e.toLowerCase())));
    
    console.log('[Calendar API POST] External email attendees (final):', externalEmails);
    console.log('[Calendar API POST] Final attendee IDs (deduped):', finalAttendeeIds.length, 'unique IDs');
    
    // Log incoming metadata
    console.log('[Calendar API POST] Incoming metadata:', event.metadata);
    
    // Determine timezone for this event (prefer explicit)
    const headerTz = request.headers.get('x-client-timezone') || undefined;
    let cookieTz: string | undefined = undefined;
    try {
      const cookieHeader = request.headers.get('cookie') || '';
      const match = cookieHeader.match(/(?:^|;\s*)client_tz=([^;]+)/);
      cookieTz = match ? decodeURIComponent(match[1]) : undefined;
    } catch {}
    let resolvedTimezone = (
      (event as any).timezone ||
      (event.metadata && (event.metadata.timezone || (event.metadata as any).departure_timezone)) ||
      headerTz ||
      cookieTz ||
      undefined
    );
    // If not provided but a Google calendar is chosen, try to pull its timezone
    if (!resolvedTimezone && (event as any).google_calendar_id) {
      try {
        const { data: cal } = await supabase
          .from('google_calendars')
          .select('time_zone')
          .eq('google_calendar_id', (event as any).google_calendar_id)
          .single();
        if (cal?.time_zone) resolvedTimezone = cal.time_zone;
      } catch (e) {
        console.warn('[Calendar API POST] Failed to resolve timezone from google_calendar_id');
      }
    }

    // Build sanitized insert payload (avoid non-column flags)
    // Note: calendar_events does NOT have a `send_invites` or `virtual_link` column.
    // Map `virtual_link` → `meeting_link` for storage.
    const allowedKeys = new Set([
      'title','description','start_time','end_time','all_day','location','is_virtual','meeting_link',
      'category','source','source_reference','google_calendar_id','google_sync_enabled','reminder_minutes','metadata','timezone'
    ]);
    const base: any = {};
    Object.keys(event || {}).forEach((k) => { if (allowedKeys.has(k)) base[k] = (event as any)[k]; });
    // Handle legacy client field mapping safely
    if ((event as any)?.virtual_link && !base.meeting_link) {
      base.meeting_link = (event as any).virtual_link;
    }
    const eventData = {
      ...base,
      created_by: user.id,
      all_day: base.all_day || false,
      category: base.category || 'other',
      attendees: finalAttendeeIds,
      google_sync_enabled: base.google_sync_enabled !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        ...(base.metadata || {}),
        additional_attendees: externalEmails
      },
      timezone: base.timezone || resolvedTimezone || null
    };

    // DST transition heuristic: if timezone present and timed event, flag possible boundary day
    try {
      if (!eventData.all_day && eventData.timezone && typeof event.start_time === 'string') {
        const tz = eventData.timezone as string;
        const toAbbrev = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).format(d).split(' ').pop() || '';
        // Build a UTC guess around now; we only need relative change in abbrev across +/-2h
        const [datePart, timePart] = (event.start_time as string).split('T');
        const [y, m, d] = datePart.split('-').map((v: string) => parseInt(v, 10));
        const [hh='12', mm='00', ss='00'] = (timePart || '12:00:00').split(':');
        const center = new Date(Date.UTC(y, (m as number)-1, d, parseInt(hh,10), parseInt(mm,10), parseInt(ss,10)));
        const before = new Date(center.getTime() - 2*60*60*1000);
        const after = new Date(center.getTime() + 2*60*60*1000);
        const a1 = toAbbrev(before);
        const a2 = toAbbrev(center);
        const a3 = toAbbrev(after);
        if (a1 !== a2 || a2 !== a3) {
          eventData.metadata = { ...(eventData.metadata || {}), flags: { ...(eventData.metadata?.flags||{}), dst_transition: true } };
          console.log('[Calendar API POST] DST transition window flagged for event');
        }
      }
    } catch {}

    // Log eventData before insert
    console.log('[Calendar API POST] Final metadata to save:', eventData.metadata);
    console.log('[Calendar API POST] Event data to insert:', JSON.stringify(eventData, null, 2));

    // Insert event
    const { data: newEvent, error } = await supabase
      .from('calendar_events')
      .insert([eventData])
      .select()
      .single();

    if (error) {
      console.error('[Calendar API POST] Database error creating event:', error);
      console.error('[Calendar API POST] Error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      return NextResponse.json({ 
        error: 'Failed to create event', 
        details: error.message,
        code: error.code 
      }, { status: 500 });
    }

    // Log the activity
    await logActivity({
      userId: user.id,
      action: 'created',
      entityType: 'calendar_event',
      entityId: newEvent.id,
      entityName: newEvent.title,
      page: 'calendar',
      details: { 
        title: newEvent.title,
        start_time: newEvent.start_time,
        end_time: newEvent.end_time,
        location: newEvent.location,
        category: newEvent.category,
        attendees_count: finalAttendeeIds.length
      },
      request
    });

    // Sync with Google Calendar if enabled
    console.log('[Calendar API POST] Checking Google sync:', {
      google_sync_enabled: newEvent.google_sync_enabled,
      google_calendar_id: newEvent.google_calendar_id,
      has_google_client_id: !!process.env.GOOGLE_CLIENT_ID,
      metadata: newEvent.metadata
    });
    
    if (newEvent.google_sync_enabled && newEvent.google_calendar_id && process.env.GOOGLE_CLIENT_ID) {
      console.log('[Calendar API POST] Triggering Google Calendar sync...');
      try {
        const csrfHeader = await resolveCSRFTokenFromRequest(request);
        const syncHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-internal-request': 'calendar-sync'
        };

        const authHeader = request.headers.get('Authorization');
        const cookieHeader = request.headers.get('Cookie');

        if (authHeader) {
          syncHeaders.Authorization = authHeader;
        }

        if (cookieHeader) {
          syncHeaders.Cookie = cookieHeader;
        }

        if (csrfHeader) {
          syncHeaders['x-csrf-token'] = csrfHeader;
        }

        const syncResponse = await fetch(`${request.nextUrl.origin}/api/calendar-events/sync/google`, {
          method: 'POST',
          headers: syncHeaders,
          body: JSON.stringify({ eventId: newEvent.id, action: 'create' })
        });
        
        if (!syncResponse.ok) {
          const errorData = await syncResponse.json();
          console.error('[Calendar API POST] Failed to sync with Google Calendar:', errorData);
        } else {
          const syncData = await syncResponse.json();
          console.log('[Calendar API POST] Google sync successful:', syncData);
        }
      } catch (syncError) {
        console.error('[Calendar API POST] Error syncing with Google Calendar:', syncError);
      }
    } else {
      console.log('[Calendar API POST] Skipping Google sync');
    }

    return NextResponse.json({ event: newEvent });
  } catch (error) {
    console.error('[Calendar API POST] === UNCAUGHT ERROR ===');
    console.error('[Calendar API POST] Error type:', typeof error);
    console.error('[Calendar API POST] Error:', error);
    if (error instanceof Error) {
      console.error('[Calendar API POST] Error message:', error.message);
      console.error('[Calendar API POST] Error stack:', error.stack);
      return NextResponse.json({ 
        error: 'Internal server error',
        details: error.message
      }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
