import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildInternalApiHeaders } from '@/lib/utils/auth-helpers';
import { enforceCSRF } from '@/lib/security/csrf';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const childId = searchParams.get('childId');

    let query = supabase
      .from('j3_academics_events')
      .select('*')
      .order('event_date', { ascending: false });

    if (childId && childId !== 'all') {
      // For events, we need to check the j3_academics_event_students table
      const { data: eventIds } = await supabase
        .from('j3_academics_event_students')
        .select('event_id')
        .eq('student_id', childId);
      
      if (eventIds && eventIds.length > 0) {
        const ids = eventIds.map(e => e.event_id);
        query = query.in('id', ids);
      } else {
        // No events for this child
        return NextResponse.json({ events: [] });
      }
    }

    const { data: events, error } = await query;

    if (error) {
      console.error('Error fetching academic events:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch attendees for each event
    if (events && events.length > 0) {
      const eventsWithAttendees = await Promise.all(
        events.map(async (event) => {
          const { data: attendees } = await supabase
            .from('j3_academics_event_students')
            .select('student_id')
            .eq('event_id', event.id);
          
          return {
            ...event,
            attendees: attendees?.map(a => a.student_id) || []
          };
        })
      );
      return NextResponse.json({ events: eventsWithAttendees });
    }

    return NextResponse.json({ events: events || [] });
  } catch (error) {
    console.error('Error in GET /api/academic-events:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    // Map description to notes field for database compatibility
    if (body.description) {
      body.notes = body.description;
      delete body.description;
    }
    const { attendees, syncToCalendar, parent_ids, ...eventData } = body;

    // Sanitize payload for j3_academics_events insert (avoid non-existent columns)
    // Allow only known columns; everything else (e.g., additional_attendees, google flags)
    // will be used for calendar and ICS handling below.
    const academicEventInsert: any = {
      event_title: eventData.event_title,
      event_date: eventData.event_date,
      event_type: eventData.event_type,
      location: eventData.location,
      notes: eventData.notes,
      created_at: new Date().toISOString()
    };

    // Insert the event
    const { data: event, error: eventError } = await supabase
      .from('j3_academics_events')
      .insert(academicEventInsert)
      .select()
      .single();

    if (eventError) {
      console.error('Error creating academic event:', eventError);
      return NextResponse.json({ error: eventError.message }, { status: 500 });
    }

    // Add attendees
    if (event && attendees && attendees.length > 0) {
      const attendeeRecords = attendees.map((studentId: string) => ({
        event_id: event.id,
        student_id: studentId
      }));

      const { error: attendeeError } = await supabase
        .from('j3_academics_event_students')
        .insert(attendeeRecords);

      if (attendeeError) {
        console.error('Error adding event attendees:', attendeeError);
      }
    }

    // Always create calendar event for academic events via centralized API
    if (event && body.syncToCalendar !== false) {
      // Determine end time by adding a default duration (in wall time)
      let duration = 1; // hours
      if (eventData.event_type === 'Conference') duration = 2;
      else if (eventData.event_type === 'Field Trip') duration = 4;

      const startDateTime = eventData.event_date.includes('T')
        ? eventData.event_date
        : `${eventData.event_date}T09:00:00`;
      const [datePart, timePart] = startDateTime.split('T');
      const [yy, mm, dd] = datePart.split('-').map((v: string) => parseInt(v));
      const [hh = '09', mi = '00'] = (timePart || '09:00:00').split(':');
      const endLocal = new Date(yy, (mm as number) - 1, dd, parseInt(hh), parseInt(mi));
      endLocal.setHours(endLocal.getHours() + duration);
      const endDateTime = `${endLocal.getFullYear()}-${String(endLocal.getMonth() + 1).padStart(2, '0')}-${String(endLocal.getDate()).padStart(2, '0')}T${String(endLocal.getHours()).padStart(2, '0')}:${String(endLocal.getMinutes()).padStart(2, '0')}:00`;

      const externalEmails = (body.additional_attendees || '')
        .split(',')
        .map((e: string) => e.trim())
        .filter((e: string) => e && e.includes('@'));

      const calendarEventPayload = {
        event: {
          title: eventData.event_title,
          description: eventData.notes || '',
          start_time: startDateTime,
          end_time: endDateTime,
          all_day: false,
          category: 'education',
          location: eventData.location || '',
          source: 'j3_academics',
          source_reference: event.id,
          attendee_ids: [...(attendees || []), ...(parent_ids || [])],
          google_calendar_id: body.google_calendar_id || null,
          google_sync_enabled: !!body.google_calendar_id && body.google_sync_enabled !== false,
          send_invites: body.notify_attendees === true,
          metadata: {
            event_type: eventData.event_type,
            student_ids: attendees || [],
            parent_ids: parent_ids || [],
            additional_attendees: externalEmails,
            notify_attendees: body.notify_attendees !== false
          }
        }
      };

      try {
        const resp = await fetch(`${request.nextUrl.origin}/api/calendar-events`, {
          method: 'POST',
          headers: await buildInternalApiHeaders(request, {
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(calendarEventPayload)
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          console.error('[Academic Events] Failed to create calendar event via API:', err);
        } else {
          const { event: calEvent } = await resp.json();
          if (calEvent?.id) {
            await supabase
              .from('j3_academics_events')
              .update({ calendar_event_id: calEvent.id })
              .eq('id', event.id);
          }
        }
      } catch (e) {
        console.error('[Academic Events] Error calling calendar-events API:', e);
      }
    }

    return NextResponse.json({ event: { ...event, attendees: attendees || [] } });
  } catch (error) {
    console.error('Error in POST /api/academic-events:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
