import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SyncService, getRequestId } from '@/lib/services/sync-service';
import { buildInternalApiHeaders } from '@/lib/utils/auth-helpers';

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const normalizeAdditionalAttendees = (input: unknown): string[] => {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map(value => (typeof value === 'string' ? value : String(value ?? '')).trim())
      .filter(email => EMAIL_REGEX.test(email));
  }
  if (typeof input === 'string') {
    return input
      .split(',')
      .map(email => email.trim())
      .filter(email => EMAIL_REGEX.test(email));
  }
  return [];
};

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const includePast = url.searchParams.get('includePast') === 'true';
    const filterPetId = url.searchParams.get('petId');

    let query = supabase
      .from('calendar_events')
      .select('id,title,description,start_time,end_time,location,metadata,attendees,google_calendar_id,google_sync_enabled')
      .eq('category', 'pets')
      .order('start_time', { ascending: true });

    if (!includePast) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.gte('start_time', today.toISOString());
    }

    const { data: events, error } = await query;
    if (error) {
      console.error(`[${requestId}] Failed to load pet appointments`, error);
      return NextResponse.json({ error: 'Failed to load appointments' }, { status: 500 });
    }

    const mapped = (events || []).map((event: any) => {
      const metadata = (event?.metadata as Record<string, any>) || {};
      const petIds: string[] = Array.isArray(metadata.pet_ids)
        ? metadata.pet_ids
        : metadata.pet_id
          ? [metadata.pet_id]
          : [];
      const additionalAttendees = normalizeAdditionalAttendees(metadata.additional_attendees);

      return {
        id: event.id,
        title: event.title,
        description: event.description,
        start_time: event.start_time,
        end_time: event.end_time,
        location: event.location,
        petIds,
        pet_id: petIds.length === 1 ? petIds[0] : null,
        pets: petIds,
        vet_id: metadata.vet_id ?? null,
        vet_name: metadata.vet_name ?? null,
        vet_phone: metadata.vet_phone ?? null,
        appointment_type: metadata.appointment_type ?? null,
        additional_attendees: additionalAttendees,
        notify_attendees: metadata.notify_attendees !== false,
        google_calendar_id: event.google_calendar_id,
        google_sync_enabled: event.google_sync_enabled,
        attendees: event.attendees || [],
      };
    });

    const appointments = mapped.filter(appointment => {
      if (!filterPetId || filterPetId === 'all') return true;
      return Array.isArray(appointment.petIds) && appointment.petIds.includes(filterPetId);
    });

    return NextResponse.json({ appointments });
  } catch (error) {
    console.error(`[${requestId}] Error in GET /api/pets/appointments:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  
  try {
    console.log(`[${requestId}] POST /api/pets/appointments - Starting`);
    const supabase = await createClient();
    const syncService = new SyncService(requestId);
    const body = await request.json();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Extract data
    const {
      pet_ids,
      appointment_type,
      vet_id,
      vet_name,
      vet_phone,
      title,
      description,
      appointment_date,
      end_time,
      location,
      sync_to_calendar,
      google_calendar_id,
      attendee_ids
    } = body;
    
    // Validate required fields
    if (!pet_ids || pet_ids.length === 0) {
      return NextResponse.json({ error: 'At least one pet is required' }, { status: 400 });
    }
    
    if (!title || !appointment_date) {
      return NextResponse.json({ error: 'Title and appointment date are required' }, { status: 400 });
    }
    
    // Get pet names from family_members (single source of truth)
    const { data: pets } = await supabase
      .from('family_members')
      .select('name')
      .eq('type', 'pet')
      .in('id', pet_ids);
    
    const petNames = pets?.map(p => p.name).join(', ') || 'Pet';
    
    // Create a task for the appointment
    const appointmentSummary = description || `${appointment_type || 'Checkup'} at ${vet_name || location || 'Vet clinic'}`;
    const taskData = {
      title: title || `Vet appointment for ${petNames}`,
      description: vet_phone ? `${appointmentSummary} (Phone: ${vet_phone})` : appointmentSummary,
      category: 'pets',
      priority: 'medium',
      due_date: appointment_date,
      status: 'active',
      assigned_to: [user.id],
      created_by: user.id,
      document_ids: [],
      links: [],
    };
    
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert(taskData)
      .select()
      .single();
    
    if (taskError) {
      console.error('Error creating task:', taskError);
      return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
    }
    
    let calendarEvent: { id: string } | null = null;
    const googleSync = { attempted: false, ok: false };
    const additionalAttendees = normalizeAdditionalAttendees(body.additional_attendees ?? body.additional_attendees_emails);
    const notifyAttendees = body.notify_attendees !== false;
    const sendInvites = body.send_invites === true || (notifyAttendees && additionalAttendees.length > 0);

    
    // Helper: add minutes to a naive local datetime string (YYYY-MM-DDTHH:mm[:ss])
    const addMinutesLocal = (naive: string, minutes: number): string => {
      if (!naive) return naive;
      const [d, t] = naive.split('T');
      const [y, m, day] = d.split('-').map((v: string) => parseInt(v, 10));
      const [hh = '00', mm = '00', ss = '00'] = (t || '00:00:00').split(':');
      const dt = new Date(y, (m as number) - 1, day, parseInt(hh, 10), parseInt(mm, 10), parseInt(ss, 10));
      dt.setMinutes(dt.getMinutes() + minutes);
      const yy = dt.getFullYear();
      const mo = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      const H = String(dt.getHours()).padStart(2, '0');
      const M = String(dt.getMinutes()).padStart(2, '0');
      const S = String(dt.getSeconds()).padStart(2, '0');
      return `${yy}-${mo}-${dd}T${H}:${M}:${S}`;
    };

    const calendarTitle = title || `Vet: ${petNames}`;
    const calendarDescription = `${appointment_type || 'Appointment'} for ${petNames}${vet_name ? ` with ${vet_name}` : ''}${vet_phone ? ` (Phone: ${vet_phone})` : ''}${description ? `\n\n${description}` : ''}`;
    const calendarStart = appointment_date;
    const calendarEnd = end_time || addMinutesLocal(appointment_date, 60);

    // Create calendar event if requested
    if (sync_to_calendar) {
      const calendarResult = await syncService.ensureCalendarEvent({
        title: calendarTitle,
        description: calendarDescription,
        start_time: calendarStart,
        end_time: calendarEnd,
        all_day: false,
        location,
        category: 'pets',
        source: 'pets',
        source_reference: task.id,
        google_calendar_id,
        // Include both owner attendee IDs and pet IDs so person filter works for pets selection
        attendees: Array.from(new Set([...
          ((attendee_ids as string[] | undefined) || []),
          ...pet_ids
        ])),
        metadata: {
          pet_ids,
          vet_id,
          vet_name,
          vet_phone,
          appointment_type,
          additional_attendees: additionalAttendees,
          notify_attendees: notifyAttendees
        }
      });
      
      if (!calendarResult.ok) {
        console.error(`[${requestId}] Error creating calendar event:`, calendarResult.error);
        // Don't fail the whole operation if calendar sync fails
      } else {
        if (calendarResult.id) {
          calendarEvent = { id: calendarResult.id };
        }

        // If a Google calendar was selected, enable sync and push to Google
        if (google_calendar_id) {
          try {
            googleSync.attempted = true;
            // Ensure flag is set for the event
            await supabase
              .from('calendar_events')
              .update({ google_sync_enabled: true })
              .eq('id', calendarResult.id);

            const syncResponse = await fetch(`${request.nextUrl.origin}/api/calendar-events/sync/google`, {
              method: 'POST',
              headers: await buildInternalApiHeaders(request, {
                'Content-Type': 'application/json',
              }),
              body: JSON.stringify({ eventId: calendarResult.id, action: 'create' })
            });
            if (!syncResponse.ok) {
              const err = await syncResponse.json().catch(() => ({}));
              console.error(`[${requestId}] Google Calendar sync failed for pet appointment:`, err);
            } else {
              googleSync.ok = true;
            }
          } catch (syncError) {
            console.error(`[${requestId}] Error syncing pet appointment to Google:`, syncError);
          }
        }
      }
    }

    if (sendInvites && additionalAttendees.length > 0) {
      try {
        const [{ sendIcsInvite }, { buildIcs, buildInviteHtml }] = await Promise.all([
          import('@/lib/google/gmail-invite'),
          import('@/lib/utils/ics-builder')
        ]);

        const organizerEmail = user.email || 'no-reply@example.com';
        const organizerName = (user as any)?.user_metadata?.name || organizerEmail.split('@')[0] || 'Organizer';
        const ics = buildIcs({
          uid: calendarEvent?.id || task.id,
          title: calendarTitle,
          description: calendarDescription,
          location: location || '',
          start: calendarStart,
          end: calendarEnd,
          organizerEmail,
          organizerName,
          attendees: additionalAttendees.map(email => ({ email }))
        });

        const html = buildInviteHtml({
          title: calendarTitle,
          start: calendarStart,
          end: calendarEnd,
          location: location || '',
          description: calendarDescription,
          mapUrl: location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : undefined
        });

        await sendIcsInvite({
          userId: user.id,
          fromEmail: organizerEmail,
          fromName: organizerName,
          to: additionalAttendees,
          subject: calendarTitle,
          textBody: calendarDescription,
          htmlBody: html,
          icsContent: ics,
          method: 'REQUEST'
        });
      } catch (icsError) {
        console.error(`[${requestId}] Failed to send pet appointment invites:`, icsError);
      }
    }

    return NextResponse.json({
      success: true,
      taskId: task.id,
      calendarEventId: calendarEvent?.id,
      task,
      calendarEvent,
      googleSync
    });
    
  } catch (error) {
    console.error('Error in POST /api/pets/appointments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
