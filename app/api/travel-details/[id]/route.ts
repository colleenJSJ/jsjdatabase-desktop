import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, requireAdmin } from '@/app/api/_helpers/auth';
import { buildInternalApiHeaders } from '@/lib/utils/auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }
    const { supabase } = authResult;
    const { data: detail, error } = await supabase
      .from('travel_details')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ detail });
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
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
    let departure_time_only = null;
    let arrival_time_only = null;
    
    if (data.departure_time) {
      const timePart = data.departure_time.split('T')[1];
      departure_time_only = timePart ? timePart.split('.')[0] : null;
    }
    
    if (data.arrival_time) {
      const timePart = data.arrival_time.split('T')[1];
      arrival_time_only = timePart ? timePart.split('.')[0] : null;
    }
    
    const updateData: any = {
      type: data.type,
      details: details, // Required field
      travelers: data.travelers || [],
      traveler_names: data.traveler_names || [],
      provider: data.provider || null,
      confirmation_number: data.confirmation_number || null,
      departure_location: data.departure_location || null,
      arrival_location: data.arrival_location || null,
      departure_time: departure_time_only,
      arrival_time: arrival_time_only,
      airline: data.airline || null,
      flight_number: data.flight_number || null,
      departure_airport: data.departure_airport || null,
      arrival_airport: data.arrival_airport || null,
      vehicle_info: data.vehicle_info || null,
      trip_id: data.trip_id || null,
      updated_at: new Date().toISOString(),
    };
    
    // Only update travel_date if provided
    if (travel_date) {
      updateData.travel_date = travel_date;
    }
    
    const { data: detail, error } = await supabase
      .from('travel_details')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[Travel Details API] Failed to update travel detail:', error);
      return NextResponse.json(
        { error: 'Failed to update travel detail', details: error.message },
        { status: 500 }
      );
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

    return NextResponse.json({ detail });
  } catch (error) {
    console.error('[Travel Details API] Error updating travel detail:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;

    const { error } = await supabase
      .from('travel_details')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Travel Details API] Failed to delete travel detail:', error);
      return NextResponse.json(
        { error: 'Failed to delete travel detail' },
        { status: 500 }
      );
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Travel Details API] Error deleting travel detail:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
