import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, requireAdmin } from '@/app/api/_helpers/auth';

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
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const data = await request.json();
    
    // First get the existing trip to check for calendar event
    const { data: existingTrip } = await supabase
      .from('trips')
      .select('calendar_event_id, google_calendar_id')
      .eq('id', id)
      .single();
    
    // Update or create calendar event if needed
    if (existingTrip?.calendar_event_id || data.google_calendar_id) {
      try {
        const calendarResponse = await fetch(
          existingTrip?.calendar_event_id 
            ? `${request.nextUrl.origin}/api/calendar-events/${existingTrip.calendar_event_id}`
            : `${request.nextUrl.origin}/api/calendar-events`,
          {
            method: existingTrip?.calendar_event_id ? 'PUT' : 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': request.headers.get('Authorization') || '',
              'Cookie': request.headers.get('Cookie') || ''
            },
            body: JSON.stringify({
              event: {
                title: data.title || data.name || `Trip to ${data.destination}`,
                start_time: data.start_date,
                end_time: data.end_date,
                category: 'travel',
                all_day: true,
                description: data.description || data.notes || `Trip to ${data.destination}`,
                location: data.destination,
                attendees: data.traveler_names || [],
                metadata: {
                  additional_attendees: data.additional_attendees ? 
                    data.additional_attendees.split(',').map((email: string) => email.trim()).filter((email: string) => email && email.includes('@')) 
                    : []
                },
                google_calendar_id: data.google_calendar_id,
                google_sync_enabled: !!data.google_calendar_id
              }
            }),
          }
        );
        
        if (!existingTrip?.calendar_event_id && calendarResponse.ok) {
          const calendarData = await calendarResponse.json();
          data.calendar_event_id = calendarData.event?.id;
        }
      } catch (calError) {
        console.error('[Trips API] Failed to update calendar event:', calError);
      }
    }
    
    const { data: trip, error } = await supabase
      .from('trips')
      .update({
        name: data.name || data.destination || 'Unnamed Trip',
        destination: data.destination,
        start_date: data.start_date,
        end_date: data.end_date,
        status: data.status || 'planning',
        total_cost: data.total_cost || null,
        currency: data.currency || 'USD',
        purpose: data.purpose || null,
        trip_type: data.trip_type || null,
        notes: data.notes || null,
        description: data.description || null,
        color: data.color || '#3B82F6',
        traveler_names: data.traveler_names || [], // Update traveler_names field
        google_calendar_id: data.google_calendar_id || null,
        calendar_event_id: data.calendar_event_id || existingTrip?.calendar_event_id || null,
        is_archived: data.is_archived || false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[Trips API] Failed to update trip:', error);
      return NextResponse.json(
        { error: 'Failed to update trip' },
        { status: 500 }
      );
    }

    // Skip trip_travelers updates - we're using traveler_names field directly now

    return NextResponse.json({ trip });
  } catch (error) {
    console.error('[Trips API] Error updating trip:', error);
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
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    // First, get the trip to check for associated calendar event
    const { data: trip, error: fetchError } = await supabase
      .from('trips')
      .select('calendar_event_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[Trips API] Failed to fetch trip:', fetchError);
      return NextResponse.json(
        { error: 'Trip not found' },
        { status: 404 }
      );
    }

    // Delete associated calendar event if exists
    if (trip?.calendar_event_id) {
      console.log('[Trips API] Deleting associated calendar event:', trip.calendar_event_id);
      
      // Use the calendar-events API endpoint to ensure Google Calendar sync
      try {
        const calendarResponse = await fetch(
          `${request.nextUrl.origin}/api/calendar-events/${trip.calendar_event_id}`,
          {
            method: 'DELETE',
            headers: { 
              'Authorization': request.headers.get('Authorization') || '',
              'Cookie': request.headers.get('Cookie') || ''
            }
          }
        );
        
        if (!calendarResponse.ok) {
          console.error('[Trips API] Failed to delete calendar event via API');
        }
      } catch (error) {
        console.error('[Trips API] Error calling calendar delete API:', error);
      }
    }
    
    // Now delete the trip
    const { error } = await supabase
      .from('trips')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Trips API] Failed to delete trip:', error);
      return NextResponse.json(
        { error: 'Failed to delete trip' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Trips API] Error deleting trip:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}