import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { toInstantFromNaive } from '@/lib/utils/date-utils';
import { enforceCSRF } from '@/lib/security/csrf';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's role
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    // Get event
    const { data: event, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Check ownership/access: user must be creator, assigned, attendee, or admin
    const hasAccess = userData?.role === 'admin' ||
      event.created_by === user.id ||
      event.assigned_to?.includes(user.id) ||
      event.attendees?.includes(user.id);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ event });
  } catch (error) {
    console.error('Error in GET /api/calendar-events/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const { id } = await params;
    const supabase = await createClient();
    
    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's role
    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!currentUser || currentUser.role === 'guest') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get the existing event to check ownership
    const { data: existingEvent } = await supabase
      .from('calendar_events')
      .select('created_by, assigned_to, timezone')
      .eq('id', id)
      .single();

    if (!existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Check if user has permission to update (owner, assigned, or admin)
    const canUpdate = currentUser.role === 'admin' ||
      existingEvent.created_by === user.id ||
      existingEvent.assigned_to?.includes(user.id);

    if (!canUpdate) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get request body
    const body = await request.json();
    const { event } = body;

    if (!event) {
      return NextResponse.json({ error: 'Missing event data' }, { status: 400 });
    }
    
    console.log('[Calendar API PUT] Incoming metadata:', event.metadata);
    console.log('[Calendar API PUT] Additional attendees:', event.metadata?.additional_attendees);

    // Normalize incoming times: strip trailing zone markers and ensure seconds
    const ensureSeconds = (s: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? `${s}:00` : s);
    if (typeof event.start_time === 'string') {
      event.start_time = ensureSeconds(event.start_time.trim());
    }
    if (typeof event.end_time === 'string') {
      event.end_time = ensureSeconds(event.end_time.trim());
    }

    // Sanitize and map update payload to avoid non-columns (e.g., send_invites, virtual_link)
    const allowedUpdateKeys = new Set([
      'title','description','start_time','end_time','all_day','location','is_virtual','meeting_link',
      'category','status','is_archived','color','reminder_minutes','duration_minutes',
      'google_sync_enabled','google_calendar_id','google_event_id','google_calendar_etag',
      'attendees','assigned_to','document_ids','is_recurring','recurrence_pattern','recurring_end_date',
      'parent_event_id','source','source_reference','metadata','timezone'
    ]);
    const updateData: any = {};
    Object.keys(event || {}).forEach((k) => { if (allowedUpdateKeys.has(k)) updateData[k] = (event as any)[k]; });
    // Map legacy field
    if ((event as any)?.virtual_link && !updateData.meeting_link) {
      updateData.meeting_link = (event as any).virtual_link;
    }
    updateData.updated_at = new Date().toISOString();
    // Ensure metadata object stays an object
    updateData.metadata = updateData.metadata || {};

    // Respect explicit timezone if provided; otherwise, if metadata has timezone, set it
    if ((event as any).timezone) {
      updateData.timezone = (event as any).timezone;
    } else if (event?.metadata && (event.metadata.timezone || (event.metadata as any).departure_timezone)) {
      updateData.timezone = event.metadata.timezone || (event.metadata as any).departure_timezone;
    }

    const attachOffsetIfNeeded = (value: string | null | undefined, tz: string | undefined, isAllDay: boolean): string | null | undefined => {
      if (!value || isAllDay) return value;
      const trimmed = value.trim();
      if (/(Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) {
        return trimmed;
      }
      if (!tz) return value;
      try {
        return toInstantFromNaive(trimmed, tz).toISOString();
      } catch (err) {
        console.warn('[Calendar API PUT] Failed to attach timezone offset', { value, tz, err });
        return value;
      }
    };

    const updateTimezone = updateData.timezone
      || existingEvent?.timezone
      || event?.metadata?.timezone
      || (event?.metadata as any)?.departure_timezone
      || Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (typeof event.start_time === 'string') {
      updateData.start_time = attachOffsetIfNeeded(event.start_time, updateTimezone, !!event.all_day);
    }
    if (typeof event.end_time === 'string') {
      updateData.end_time = attachOffsetIfNeeded(event.end_time, updateTimezone, !!event.all_day);
    }

    console.log('[Calendar API PUT] Sanitized update keys:', Object.keys(updateData));
    console.log('[Calendar API PUT] Update data metadata:', updateData.metadata);

    // Soft DST transition flag when timezone provided and timed event is being updated
    try {
      const tz = updateData.timezone || (event?.metadata?.timezone || (event?.metadata as any)?.departure_timezone);
      const st = updateData.start_time;
      if (tz && st && !updateData.all_day) {
        const toAbbrev = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).format(d).split(' ').pop() || '';
        const [datePart, timePart] = String(st).split('T');
        const [y, m, d] = datePart.split('-').map((v: string) => parseInt(v, 10));
        const [hh='12', mm='00', ss='00'] = (timePart || '12:00:00').split(':');
        const center = new Date(Date.UTC(y, (m as number)-1, d, parseInt(hh,10), parseInt(mm,10), parseInt(ss,10)));
        const before = new Date(center.getTime() - 2*60*60*1000);
        const after = new Date(center.getTime() + 2*60*60*1000);
        const a1 = toAbbrev(before);
        const a2 = toAbbrev(center);
        const a3 = toAbbrev(after);
        if (a1 !== a2 || a2 !== a3) {
          updateData.metadata = { ...(updateData.metadata || {}), flags: { ...(updateData.metadata?.flags||{}), dst_transition: true } };
          console.log('[Calendar API PUT] DST transition window flagged for event');
        }
      }
    } catch {}

    const { data: updatedEvent, error } = await supabase
      .from('calendar_events')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating calendar event:', error);
      return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
    }

    // Log the action
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'update_calendar_event',
      entity_type: 'calendar_event',
      entity_id: id,
      details: { title: updatedEvent.title },
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      user_agent: request.headers.get('user-agent')
    });

    // Sync with Google Calendar if enabled
    console.log('[Calendar API PUT] Checking Google sync:', {
      google_sync_enabled: updatedEvent.google_sync_enabled,
      google_calendar_id: updatedEvent.google_calendar_id,
      has_google_client_id: !!process.env.GOOGLE_CLIENT_ID,
      metadata: updatedEvent.metadata
    });
    
    if (updatedEvent.google_sync_enabled && updatedEvent.google_calendar_id && process.env.GOOGLE_CLIENT_ID) {
      console.log('[Calendar API PUT] Triggering Google sync for updated event');
      try {
        const syncResponse = await fetch(`${request.nextUrl.origin}/api/calendar-events/sync/google`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            // Forward auth headers
            'Authorization': request.headers.get('Authorization') || '',
            'Cookie': request.headers.get('Cookie') || ''
          },
          body: JSON.stringify({ 
            eventId: updatedEvent.id, 
            action: updatedEvent.google_event_id ? 'update' : 'create' 
          })
        });
        
        if (!syncResponse.ok) {
          const errorData = await syncResponse.json();
          console.error('[Calendar API PUT] Failed to sync with Google Calendar:', errorData);
        } else {
          const syncData = await syncResponse.json();
          console.log('[Calendar API PUT] Google sync successful:', syncData);
        }
      } catch (syncError) {
        console.error('[Calendar API PUT] Error syncing with Google Calendar:', syncError);
      }
    } else {
      console.log('[Calendar API PUT] Skipping Google sync');
    }

    return NextResponse.json({ event: updatedEvent });
  } catch (error) {
    console.error('Error in PUT /api/calendar-events/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const { id } = await params;
    const supabase = await createClient();
    
    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's role
    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    // Get event details before deletion for logging and sync
    const { data: event } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('id', id)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Check if user has permission to delete (owner or admin)
    const canDelete = currentUser?.role === 'admin' || event.created_by === user.id;

    if (!canDelete) {
      return NextResponse.json({ error: 'Only the event owner or admins can delete events' }, { status: 403 });
    }

    // Send ICS cancellation to external attendees (fallback), then sync deletion with Google
    try {
      const fallback = (process.env.ICS_FALLBACK || 'externalOnly').toLowerCase();
      const additional = event.metadata?.additional_attendees || [];
      if (fallback !== 'off' && additional && additional.length > 0) {
        // Organizer info
        const { data: userRow } = await supabase
          .from('users')
          .select('full_name, email')
          .eq('id', event.created_by)
          .single();
        const organizerEmail = userRow?.email;
        if (organizerEmail) {
          let timeZone = 'America/New_York';
          const { data: cal } = await supabase
            .from('google_calendars')
            .select('time_zone')
            .eq('google_calendar_id', event.google_calendar_id)
            .single();
          if (cal?.time_zone) timeZone = cal.time_zone;

          let recipients: string[] = Array.isArray(additional) ? additional : [];
          if (fallback === 'externalonly') {
            const orgDomain = organizerEmail.split('@')[1];
            recipients = recipients.filter((e: string) => !e.toLowerCase().endsWith(`@${orgDomain.toLowerCase()}`));
          }
          if (recipients.length > 0) {
            const uidDomain = process.env.ICS_UID_DOMAIN || organizerEmail.split('@')[1] || 'app.local';
            const uid = `${event.id}@${uidDomain}`;
            const seq = (event.metadata?.ics_sequence || 0) + 1;
            const { generateIcs } = await import('@/lib/google/ics-generator');
            const ics = generateIcs({
              uid,
              sequence: seq,
              method: 'CANCEL',
              summary: event.title,
              description: event.description || undefined,
              location: event.location || undefined,
              start: event.start_time,
              end: event.end_time,
              timeZone,
              organizerEmail,
              organizerName: undefined,
              attendees: recipients,
              useUtc: true,
            });
            const { sendIcsInvite } = await import('@/lib/google/gmail-invite');
            await sendIcsInvite({
              userId: event.created_by,
              fromEmail: organizerEmail,
              to: recipients,
              subject: `Cancelled: ${event.title}`,
              icsContent: ics,
              method: 'CANCEL',
            });
            const nextMeta = { ...(event.metadata || {}), ics_sequence: seq, ics_uid: uid };
            await supabase
              .from('calendar_events')
              .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
              .eq('id', id);
          }
        }
      }
    } catch (icsErr) {
      console.warn('[ICS] Failed to send cancellation:', icsErr);
    }

    // Sync deletion with Google Calendar if enabled
    if (event.google_sync_enabled && event.google_event_id && event.google_calendar_id && process.env.GOOGLE_CLIENT_ID) {
      try {
        const syncResponse = await fetch(`${request.nextUrl.origin}/api/calendar-events/sync/google`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            // Forward auth headers
            'Authorization': request.headers.get('Authorization') || '',
            'Cookie': request.headers.get('Cookie') || ''
          },
          body: JSON.stringify({ eventId: event.id, action: 'delete' })
        });
        
        if (!syncResponse.ok) {
          const errorData = await syncResponse.json();
          console.error('Failed to sync deletion with Google Calendar:', errorData);
          // Continue with local deletion even if Google sync fails
        }
      } catch (syncError) {
        console.error('Error syncing deletion with Google Calendar:', syncError);
        // Continue with local deletion
      }
    }

    // Handle source cleanup before deleting the calendar event
    if (event.source) {
      console.log(`[Calendar API] Cleaning up source: ${event.source} with reference: ${event.source_reference}`);
      
      if (event.source === 'travel' && event.source_reference) {
        // Clear any backrefs on trips (legacy) and delete the travel detail itself
        const { error: tripError } = await supabase
          .from('trips')
          .update({ calendar_event_id: null })
          .eq('calendar_event_id', id);
        if (tripError) {
          console.error('[Calendar API] Failed to update trip:', tripError);
        }
        // Delete the associated travel detail row so Travel page stays in sync
        const { error: travelDeleteError } = await supabase
          .from('travel_details')
          .delete()
          .eq('id', event.source_reference);
        if (travelDeleteError) {
          console.error('[Calendar API] Failed to delete travel detail:', travelDeleteError);
        }
      } 
      else if ((event.source === 'health' || event.source === 'pets' || event.source === 'tasks') && event.source_reference) {
        // Delete the associated task
        const { error: taskError } = await supabase
          .from('tasks')
          .delete()
          .eq('id', event.source_reference);
        
        if (taskError) {
          console.error('[Calendar API] Failed to delete task:', taskError);
        }
      }
      else if (event.source === 'j3_academics' && event.source_reference) {
        // Delete the academic event
        const { error: academicError } = await supabase
          .from('j3_academics_events')
          .delete()
          .eq('id', event.source_reference);
        
        if (academicError) {
          console.error('[Calendar API] Failed to delete academic event:', academicError);
        }
      }
    }

    // Also check if any trips reference this calendar event (for backwards compatibility)
    if (!event.source || event.source !== 'travel') {
      const { error: tripUpdateError } = await supabase
        .from('trips')
        .update({ calendar_event_id: null })
        .eq('calendar_event_id', id);
      
      if (tripUpdateError) {
        console.error('[Calendar API] Failed to clear trip calendar reference:', tripUpdateError);
      }
    }

    // Delete event from database
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting calendar event:', error);
      return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
    }

    // Log the action
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'delete_calendar_event',
      entity_type: 'calendar_event',
      entity_id: id,
      details: { title: event?.title },
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      user_agent: request.headers.get('user-agent')
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/calendar-events/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
