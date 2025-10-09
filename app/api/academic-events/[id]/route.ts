import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildInternalApiHeaders } from '@/lib/utils/auth-helpers';
import { enforceCSRF } from '@/lib/security/csrf';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: event, error } = await supabase
      .from('j3_academics_events')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching academic event:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch attendees
    const { data: attendees } = await supabase
      .from('j3_academics_event_students')
      .select('student_id')
      .eq('event_id', id);

    return NextResponse.json({
      ...event,
      attendees: attendees?.map(a => a.student_id) || []
    });
  } catch (error) {
    console.error('Error in GET /api/academic-events/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { attendees, syncToCalendar, ...eventData } = body;

    // Update the event
    const { data: event, error: eventError } = await supabase
      .from('j3_academics_events')
      .update(eventData)
      .eq('id', id)
      .select()
      .single();

    if (eventError) {
      console.error('Error updating academic event:', eventError);
      return NextResponse.json({ error: eventError.message }, { status: 500 });
    }

    // Update attendees (delete existing and re-add)
    if (event) {
      // Delete existing attendees
      await supabase
        .from('j3_academics_event_students')
        .delete()
        .eq('event_id', id);

      // Add new attendees
      if (attendees && attendees.length > 0) {
        const attendeeRecords = attendees.map((studentId: string) => ({
          event_id: event.id,
          student_id: studentId
        }));

        await supabase
          .from('j3_academics_event_students')
          .insert(attendeeRecords);
      }

      // Route calendar updates/creates through centralized Calendar API
      if (syncToCalendar !== false) {
        // Check if event already has a calendar_event_id
        const { data: academicEventWithCalendar } = await supabase
          .from('j3_academics_events')
          .select('calendar_event_id')
          .eq('id', id)
          .single();

        // Calculate end time based on event type without timezone conversion
        let duration = 1; // default 1 hour
        if (eventData.event_type === 'Conference') {
          duration = 2;
        } else if (eventData.event_type === 'Field Trip') {
          duration = 4;
        }

        // Format start/end times (no TZ conversion here; Calendar API will normalize)
        const startDateTime = eventData.event_date.includes('T')
          ? eventData.event_date
          : `${eventData.event_date}T09:00:00`;
        const [datePart, timePart] = startDateTime.split('T');
        const [year, month, day] = datePart.split('-');
        const [hours, minutes] = timePart ? timePart.split(':') : ['09', '00'];
        const endDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
        endDate.setHours(endDate.getHours() + duration);
        const endDateTime = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}T${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}:00`;

        // Process external email attendees
        const externalEmails = body.additional_attendees
          ? body.additional_attendees
              .split(',')
              .map((email: string) => email.trim())
              .filter((email: string) => email && email.includes('@'))
          : [];

        const calendarEventPayload = {
          event: {
            title: eventData.event_title,
            description: eventData.notes || eventData.description || '',
            start_time: startDateTime,
            end_time: endDateTime,
            all_day: false,
            category: 'education',
            location: eventData.location || '',
            // Use attendee_ids to ensure IDs pass through unchanged
            attendee_ids: attendees || [],
            google_calendar_id: body.google_calendar_id || null,
            google_sync_enabled: body.google_sync_enabled || false,
            source: 'j3_academics',
            source_reference: id,
            metadata: {
              event_type: eventData.event_type,
              student_ids: attendees || [],
              additional_attendees: externalEmails
            }
          }
        };

        try {
          if (academicEventWithCalendar?.calendar_event_id) {
            // Update existing calendar event via API
            const calendarResponse = await fetch(`${request.nextUrl.origin}/api/calendar-events/${academicEventWithCalendar.calendar_event_id}`, {
              method: 'PUT',
              headers: await buildInternalApiHeaders(request, {
                'Content-Type': 'application/json',
              }),
              body: JSON.stringify(calendarEventPayload)
            });
            if (!calendarResponse.ok) {
              const err = await calendarResponse.json().catch(() => null);
              console.error('[Academic Events] Calendar API update failed:', err);
            }
          } else {
            // Create new calendar event via API
            const calendarResponse = await fetch(`${request.nextUrl.origin}/api/calendar-events`, {
              method: 'POST',
              headers: await buildInternalApiHeaders(request, {
                'Content-Type': 'application/json',
              }),
              body: JSON.stringify(calendarEventPayload)
            });
            if (!calendarResponse.ok) {
              const err = await calendarResponse.json().catch(() => null);
              console.error('[Academic Events] Calendar API create failed:', err);
            } else {
              const { event: created } = await calendarResponse.json();
              if (created?.id) {
                await supabase
                  .from('j3_academics_events')
                  .update({ calendar_event_id: created.id })
                  .eq('id', id);
              }
            }
          }
        } catch (apiErr) {
          console.error('[Academic Events] Error calling Calendar API:', apiErr);
        }
      }
    }

    return NextResponse.json({ ...event, attendees: attendees || [] });
  } catch (error) {
    console.error('Error in PUT /api/academic-events/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // First get the academic event to find associated calendar event
    const { data: academicEvent } = await supabase
      .from('j3_academics_events')
      .select('calendar_event_id')
      .eq('id', id)
      .single();

    // Delete associated calendar event using API if exists
    if (academicEvent?.calendar_event_id) {
      try {
        const calendarResponse = await fetch(
          `${request.nextUrl.origin}/api/calendar-events/${academicEvent.calendar_event_id}`,
          {
            method: 'DELETE',
            headers: await buildInternalApiHeaders(request),
          }
        );
        
        if (!calendarResponse.ok) {
          console.error('[Academic Events] Failed to delete calendar event via API');
        }
      } catch (error) {
        console.error('[Academic Events] Error calling calendar delete API:', error);
      }
    }

    // Delete attendee records
    await supabase
      .from('j3_academics_event_students')
      .delete()
      .eq('event_id', id);

    // Delete the event
    const { error } = await supabase
      .from('j3_academics_events')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting academic event:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/academic-events/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
