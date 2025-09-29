import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SyncService, CompositeOperation, getRequestId } from '@/lib/services/sync-service';
import { buildInternalApiHeaders } from '@/lib/utils/auth-helpers';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  
  try {
    console.log(`[${requestId}] POST /api/health/appointments - Starting`);
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
      provider_id,
      provider_name,
      appointment_type,
      patient_ids,
      attendee_ids,
      title,
      description,
      appointment_date,
      end_time,
      duration,
      location,
      is_virtual,
      virtual_link,
      sync_to_calendar,
      google_calendar_id
    } = body;
    
    // Validate required fields
    if (!title || !appointment_date) {
      return NextResponse.json({ error: 'Title and appointment date are required' }, { status: 400 });
    }
    
    // Get provider details if ID provided
    let providerDetails = { name: provider_name };
    if (provider_id) {
      const { data: provider } = await supabase
        .from('doctors')
        .select('name, specialty, phone, address')
        .eq('id', provider_id)
        .single();
      
      if (provider) {
        providerDetails = provider;
      }
    }
    
    // Get patient names from family_members (single source of truth)
    let patientNames = '';
    if (patient_ids && patient_ids.length > 0) {
      const { data: patients } = await supabase
        .from('family_members')
        .select('name')
        .eq('type', 'human')
        .in('id', patient_ids);
      
      patientNames = patients?.map(p => p.name).join(', ') || '';
    }
    
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

    // Calculate end time if not provided (keep as local wall-clock, no Z)
    const endDateTime = end_time || addMinutesLocal(appointment_date, (duration || 60));
    
    // Create a task for the appointment
    const taskData = {
      title: title || `Medical appointment${providerDetails.name ? ` with ${providerDetails.name}` : ''}`,
      description: description || `${appointment_type || 'Appointment'}${patientNames ? ` for ${patientNames}` : ''}${providerDetails.name ? ` with Dr. ${providerDetails.name}` : ''}`,
      category: 'medical',
      priority: 'high',
      due_date: appointment_date,
      status: 'active',
      assigned_to: patient_ids || [user.id],
      created_by: user.id,
      document_ids: [],
      links: is_virtual && virtual_link ? [virtual_link] : [],
      metadata: {
        provider_id,
        provider_name: providerDetails.name,
        appointment_type,
        duration,
        is_virtual,
        virtual_link
      }
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
    
    let calendarEvent = null;
    let googleSync = { attempted: false, ok: false };
    
    // Create calendar event
    const calendarData = {
      title: title || `Medical: ${providerDetails.name || 'Appointment'}`,
      description: `${appointment_type || 'Medical appointment'}${patientNames ? ` for ${patientNames}` : ''}${providerDetails.name ? `\n\nProvider: Dr. ${providerDetails.name}` : ''}${(providerDetails as any).specialty ? `\nSpecialty: ${(providerDetails as any).specialty}` : ''}${description ? `\n\n${description}` : ''}`,
      start_time: appointment_date,
      end_time: endDateTime,
      all_day: false,
      location: is_virtual ? 'Virtual' : (location || (providerDetails as any).address),
      is_virtual,
      meeting_link: virtual_link,
      category: 'medical',
      source: 'health',
      source_reference: task.id,
      google_calendar_id,
      google_sync_enabled: !!google_calendar_id,
      attendees: [ ...(patient_ids || []), ...((attendee_ids as string[] | undefined) || []) ],
      reminder_minutes: 60, // Default 1 hour reminder for medical appointments
      metadata: {
        provider_id,
        provider_name: providerDetails.name,
        appointment_type,
        patient_ids,
        notify_attendees: body.notify_attendees !== false
      }
    };
    
    // Sanitize calendar insert to only allowed columns
    const allowedKeys = new Set([
      'title','description','start_time','end_time','all_day','location','is_virtual','meeting_link',
      'category','source','source_reference','google_calendar_id','google_sync_enabled','reminder_minutes','metadata'
    ]);
    const base: any = {};
    Object.keys(calendarData).forEach((k) => { if (allowedKeys.has(k)) base[k] = (calendarData as any)[k]; });
    // Resolve timezone: prefer metadata.timezone (none here), then selected Google calendar tz, then client cookie
    let timezone: string | null = null;
    try {
      if (google_calendar_id) {
        const { data: cal } = await supabase
          .from('google_calendars')
          .select('time_zone')
          .eq('google_calendar_id', google_calendar_id)
          .single();
        if (cal?.time_zone) timezone = cal.time_zone;
      }
      if (!timezone) {
        const cookieHeader = request.headers.get('cookie') || '';
        const match = cookieHeader.match(/(?:^|;\s*)client_tz=([^;]+)/);
        timezone = match ? decodeURIComponent(match[1]) : null;
      }
    } catch {}

    const eventInsert = {
      ...base,
      created_by: user.id,
      all_day: base.all_day || false,
      attendees: calendarData.attendees || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      timezone
    };

    const { data: eventData, error: eventError } = await supabase
      .from('calendar_events')
      .insert(eventInsert)
      .select()
      .single();
    
    if (eventError) {
      console.error('Error creating calendar event:', eventError);
      // Don't fail the whole operation if calendar sync fails
    } else {
      calendarEvent = eventData;
      
      // Update task with calendar event reference
      await supabase
        .from('tasks')
        .update({ 
          metadata: {
            ...taskData.metadata,
            calendar_event_id: eventData.id
          }
        })
        .eq('id', task.id);

      // If Google calendar selected, trigger Google sync for the new event
      if (google_calendar_id) {
        try {
          googleSync.attempted = true;
          const syncResponse = await fetch(`${request.nextUrl.origin}/api/calendar-events/sync/google`, {
            method: 'POST',
            headers: await buildInternalApiHeaders(request, {
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify({ eventId: eventData.id, action: 'create' })
          });
          if (!syncResponse.ok) {
            const err = await syncResponse.json().catch(() => ({}));
            console.error('[Health] Google Calendar sync failed:', err);
          } else {
            googleSync.ok = true;
          }
        } catch (syncError) {
          console.error('[Health] Error syncing to Google Calendar:', syncError);
        }
      }
    }
    
    // Optionally send ICS invites (external emails only) if requested
    try {
      if (body.send_invites === true) {
        const { sendIcsInvite } = await import('@/lib/google/gmail-invite');
        const { buildIcs, buildInviteHtml } = await import('@/lib/utils/ics-builder');
        const recipients: string[] = [];
        const extraEmails: string[] = (body.additional_attendees_emails || []).filter((e: string) => e && e.includes('@'));
        recipients.push(...extraEmails);
        if (attendee_ids && attendee_ids.length > 0) {
          const { data: fm } = await supabase
            .from('family_members')
            .select('email')
            .in('id', attendee_ids);
          (fm || []).forEach((r: any) => { if (r?.email) recipients.push(r.email); });
        }
        if (recipients.length > 0) {
          const organizerEmail = user.email || 'no-reply@example.com';
          const organizerName = (user as any).user_metadata?.name || organizerEmail.split('@')[0] || 'Organizer';
          const ics = buildIcs({
            uid: (eventData?.id || task.id),
            title: calendarData.title,
            description: calendarData.description,
            location: calendarData.location,
            start: calendarData.start_time,
            end: calendarData.end_time,
            organizerEmail,
            organizerName,
            attendees: recipients.map(email => ({ email }))
          });
          const html = buildInviteHtml({
            title: calendarData.title,
            start: calendarData.start_time,
            end: calendarData.end_time,
            location: calendarData.location,
            description: description || undefined,
            mapUrl: calendarData.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(calendarData.location)}` : undefined
          });
          await sendIcsInvite({
            userId: user.id,
            fromEmail: organizerEmail,
            fromName: organizerName,
            to: recipients,
            subject: calendarData.title,
            textBody: description || 'Medical appointment',
            htmlBody: html,
            icsContent: ics,
            method: 'REQUEST'
          });
        }
      }
    } catch (icsError) {
      console.error('[Health ICS] Failed to send invites:', icsError);
    }

    // Optionally create a health record entry (if you have a health_appointments table)
    // This could store more detailed medical information
    /*
    const { data: healthRecord } = await supabase
      .from('health_appointments')
      .insert({
        task_id: task.id,
        calendar_event_id: calendarEvent?.id,
        provider_id,
        provider_name: providerDetails.name,
        appointment_type,
        appointment_date,
        duration,
        patient_ids,
        notes: description,
        is_virtual,
        virtual_link,
        created_by: user.id
      })
      .select()
      .single();
    */
    
    return NextResponse.json({
      success: true,
      taskId: task.id,
      appointmentId: task.id, // Can be separate if using health_appointments table
      calendarEventId: calendarEvent?.id,
      task,
      calendarEvent,
      googleSync
    });
    
  } catch (error) {
    console.error('Error in POST /api/health/appointments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
