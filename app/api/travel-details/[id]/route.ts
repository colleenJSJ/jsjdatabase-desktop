import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { buildInternalApiHeaders } from '@/lib/utils/auth-helpers';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

const parseTimeToMinutes = (time?: string | null) => {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }
    const { supabase } = authResult;
    const { data: detail, error } = await supabase
      .from('travel_details')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      return jsonError('Not found', { status: 404 });
    }
    return jsonSuccess({ detail }, { legacy: { detail } });
  } catch (e) {
    return jsonError('Internal server error', { status: 500 });
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
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;
    const data = await request.json();
    
    // Extract travel_date from departure_time (required field)
    let travel_date = null;
    if (data.departure_time) {
      travel_date = data.departure_time.split('T')[0]; // Get date part only
    } else if (data.departure_date) {
      travel_date = data.departure_date;
    } else if (data.travel_date) {
      travel_date = data.travel_date;
    }
    
    // Build details JSON object (required field)
    const details = {
      provider: data.provider,
      confirmation_number: data.confirmation_number,
      departure_location: data.departure_location,
      arrival_location: data.arrival_location,
      airline: data.airline,
      flight_number: data.flight_number,
      departure_airport: data.departure_airport,
      arrival_airport: data.arrival_airport,
      vehicle_info: data.vehicle_info,
      notes: data.notes,
      departure_datetime: data.departure_time,
      arrival_datetime: data.arrival_time,
      // Include any additional fields that might be passed
      ...Object.keys(data).reduce((acc, key) => {
        if (!['type', 'travelers', 'traveler_names', 'trip_id', 'created_by', 
             'departure_time', 'arrival_time', 'travel_date'].includes(key)) {
          acc[key] = data[key];
        }
        return acc;
      }, {} as any)
    };

    // Extract time parts from datetime strings if provided
    let departure_time_only: string | null = null;
    let arrival_time_only: string | null = null;

    if (data.departure_time) {
      if (data.departure_time.includes('T')) {
        const [datePart, timePartRaw] = data.departure_time.split('T');
        const timePart = timePartRaw || '';
        departure_time_only = timePart ? timePart.split('.')[0].split('Z')[0] : null;
        if (!travel_date && datePart) {
          travel_date = datePart;
        }
      } else if (data.departure_time.includes(':')) {
        departure_time_only = data.departure_time.split('.')[0].split('Z')[0];
      }
    }

    if (data.arrival_time) {
      if (data.arrival_time.includes('T')) {
        const [arrivalDatePart, timePartRaw] = data.arrival_time.split('T');
        const timePart = timePartRaw || '';
        arrival_time_only = timePart ? timePart.split('.')[0].split('Z')[0] : null;
      } else if (data.arrival_time.includes(':')) {
        arrival_time_only = data.arrival_time.split('.')[0].split('Z')[0];
      }
    }

    const isDifferentDays = data.departure_time && data.arrival_time &&
      data.departure_time.includes('T') && data.arrival_time.includes('T') &&
      data.departure_time.split('T')[0] !== data.arrival_time.split('T')[0];

    const fallbackArrivalDate =
      data.arrival_date ||
      (data.arrival_time && data.arrival_time.includes('T')
        ? data.arrival_time.split('T')[0]
        : null) ||
      travel_date ||
      null;

    const shouldStoreTimes = Boolean(departure_time_only && arrival_time_only && !isDifferentDays);
    const updateData: any = {
      type: data.type,
      details: details, // Required field
      travelers: Array.isArray(data.travelers) ? data.travelers : [],
      traveler_names: Array.isArray(data.traveler_names) ? data.traveler_names : [],
      provider: data.provider || null,
      confirmation_number: data.confirmation_number || null,
      departure_location: data.departure_location || null,
      arrival_location: data.arrival_location || null,
      airline: data.airline || null,
      flight_number: data.flight_number || null,
      departure_airport: data.departure_airport || null,
      arrival_airport: data.arrival_airport || null,
      vehicle_info: data.vehicle_info || null,
      trip_id: data.trip_id || null,
      updated_at: new Date().toISOString(),
    };

    if (travel_date) {
      updateData.travel_date = travel_date;
    }

    let finalArrivalDate = fallbackArrivalDate || null;
    let finalDepartureTime = shouldStoreTimes ? departure_time_only : null;
    let finalArrivalTime = shouldStoreTimes ? arrival_time_only : null;

    if (
      finalArrivalTime &&
      finalDepartureTime &&
      (!travel_date || !finalArrivalDate || finalArrivalDate === travel_date)
    ) {
      const dep = parseTimeToMinutes(finalDepartureTime);
      const arr = parseTimeToMinutes(finalArrivalTime);
      if (dep !== null && arr !== null && arr <= dep) {
        finalArrivalTime = null;
      }
    }

    updateData.departure_time = finalDepartureTime;
    updateData.arrival_time = finalArrivalTime;
    
    const { data: detail, error } = await supabase
      .from('travel_details')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[Travel Details API] Failed to update travel detail:', error);
      return jsonError('Failed to update travel detail', {
        status: 500,
        meta: { details: error.message },
      });
    }

    // Handle calendar event updates for flights
    if (detail && data.type === 'flight' && data.departure_time && data.arrival_time) {
      try {
        // Normalize additional_attendees from string to array if needed
        let normalizedAdditionalAttendees: string[] = [];
        if (data.additional_attendees) {
          if (Array.isArray(data.additional_attendees)) {
            normalizedAdditionalAttendees = data.additional_attendees;
          } else if (typeof data.additional_attendees === 'string') {
            // Split comma-separated string, trim, and filter valid emails
            normalizedAdditionalAttendees = data.additional_attendees
              .split(',')
              .map((email: string) => email.trim())
              .filter((email: string) => email && email.includes('@'));
            console.log('[Travel Details API] Update: Normalized additional_attendees from string:', data.additional_attendees, '→', normalizedAdditionalAttendees);
          }
        }
        
        // Check if a calendar event already exists for this travel detail
        const { data: existingEvents } = await supabase
          .from('calendar_events')
          .select('id')
          .eq('source', 'travel')
          .eq('source_reference', id)
          .single();

        const calendarEventPayload = {
          event: {
            title: `Flight: ${data.departure_airport || data.departure_location} → ${data.arrival_airport || data.arrival_location}`,
            description: `${data.airline || data.provider || 'Flight'} ${data.flight_number || ''}${data.confirmation_number ? `\nConfirmation: ${data.confirmation_number}` : ''}`,
            start_time: data.departure_time,
            end_time: data.arrival_time,
            all_day: false,
            category: 'travel',
            location: data.departure_airport || data.departure_location,
            source: 'travel',
            source_reference: detail.id,
            attendees: data.travelers || [],
            google_sync_enabled: data.google_sync_enabled || false,
            google_calendar_id: data.google_calendar_id || null,
            metadata: {
              additional_attendees: normalizedAdditionalAttendees,
              trip_id: data.trip_id,
              confirmation_number: data.confirmation_number,
              airline: data.airline,
              flight_number: data.flight_number
            }
          }
        };

        if (existingEvents) {
          // Update existing calendar event via API
          const updateResponse = await fetch(`${request.nextUrl.origin}/api/calendar-events/${existingEvents.id}`, {
            method: 'PUT',
            headers: await buildInternalApiHeaders(request, {
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify(calendarEventPayload)
          });

          if (!updateResponse.ok) {
            const errorData = await updateResponse.json().catch(() => null);
            console.error('[Travel Details API] Failed to update calendar event:', errorData);
          }
        } else {
          // Create new calendar event via API
          const createResponse = await fetch(`${request.nextUrl.origin}/api/calendar-events`, {
            method: 'POST',
            headers: await buildInternalApiHeaders(request, {
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify(calendarEventPayload)
          });

          if (!createResponse.ok) {
            const errorData = await createResponse.json().catch(() => null);
            console.error('[Travel Details API] Failed to create calendar event:', errorData);
          }
        }
      } catch (calendarError) {
        console.error('[Travel Details API] Error handling calendar event:', calendarError);
      }
    } else if (detail && data.type !== 'flight') {
      // Remove calendar event if type changed from flight
      try {
        // First find the calendar event ID
        const { data: calendarEvent } = await supabase
          .from('calendar_events')
          .select('id')
          .eq('source', 'travel')
          .eq('source_reference', id)
          .single();

        if (calendarEvent) {
          console.log('[Travel Details API] Type changed from flight, deleting calendar event:', calendarEvent.id);
          // Use the calendar-events API to properly handle Google sync deletion
          const deleteResponse = await fetch(`${request.nextUrl.origin}/api/calendar-events/${calendarEvent.id}`, {
            method: 'DELETE',
            headers: await buildInternalApiHeaders(request),
          });

          if (!deleteResponse.ok) {
            const errorData = await deleteResponse.json().catch(() => null);
            console.error('[Travel Details API] Failed to delete calendar event:', errorData);
          } else {
            console.log('[Travel Details API] Calendar event deleted successfully');
          }
        }
      } catch (error) {
        console.error('[Travel Details API] Error deleting calendar event:', error);
      }
    }

    return jsonSuccess({ detail }, { legacy: { detail } });
  } catch (error) {
    console.error('[Travel Details API] Error updating travel detail:', error);
    return jsonError('Internal server error', { status: 500 });
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
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;

    const { error } = await supabase
      .from('travel_details')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Travel Details API] Failed to delete travel detail:', error);
      return jsonError('Failed to delete travel detail', { status: 500 });
    }

    // Delete associated calendar event using the proper API (handles Google sync)
    try {
      // First find the calendar event ID
      const { data: calendarEvent } = await supabase
        .from('calendar_events')
        .select('id')
        .eq('source', 'travel')
        .eq('source_reference', id)
        .single();

      if (calendarEvent) {
        console.log('[Travel Details API] Deleting associated calendar event:', calendarEvent.id);
        // Use the calendar-events API to properly handle Google sync deletion
        const deleteResponse = await fetch(`${request.nextUrl.origin}/api/calendar-events/${calendarEvent.id}`, {
          method: 'DELETE',
          headers: await buildInternalApiHeaders(request),
        });

        if (!deleteResponse.ok) {
          const errorData = await deleteResponse.json().catch(() => null);
          console.error('[Travel Details API] Failed to delete calendar event:', errorData);
          // Don't fail the travel detail deletion if calendar event deletion fails
        } else {
          console.log('[Travel Details API] Calendar event and Google sync handled successfully');
        }
      }
    } catch (error) {
      console.error('[Travel Details API] Error deleting calendar event:', error);
      // Don't fail the travel detail deletion if calendar event deletion fails
    }

    return jsonSuccess({ deleted: true }, {
      legacy: { success: true },
    });
  } catch (error) {
    console.error('[Travel Details API] Error deleting travel detail:', error);
    return jsonError('Internal server error', { status: 500 });
  }
}
