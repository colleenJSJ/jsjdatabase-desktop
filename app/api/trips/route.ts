import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';
import { applyPersonFilter } from '@/app/api/_helpers/apply-person-filter';
import { resolvePersonReferences, resolveCurrentUserToFamilyMember } from '@/app/api/_helpers/person-resolver';
import { personService } from '@/lib/services/person.service';
import { logActivity } from '@/app/api/_helpers/log-activity';
import { buildTravelVisibilityContext, shouldIncludeTravelRecord } from '@/lib/travel/visibility';
import { normalizeTravelerIds } from '@/lib/travel/travelers';

export async function GET(request: NextRequest) {
  try {
    console.log('[Trips API] Starting GET request');
    
    const authResult = await getAuthenticatedUser();
    console.log('[Trips API] Auth result:', authResult);
    
    if ('error' in authResult) {
      console.log('[Trips API] Authentication failed');
      return authResult.error;
    }

    const { user, supabase } = authResult;
    console.log('[Trips API] Authenticated user:', user.id, user.email);

    const { searchParams } = new URL(request.url);
    const selectedPerson = searchParams.get('selected_person') || undefined;

    const shouldFilterByPerson = Boolean(selectedPerson && selectedPerson !== 'all');
    const selectedParam = shouldFilterByPerson ? undefined : selectedPerson;

    const visibilityContext = await buildTravelVisibilityContext({
      supabase,
      userId: user.id,
      selectedPerson,
      isAdmin: user.role === 'admin',
    });

    let query = supabase
      .from('trips')
      .select('*')
      .eq('is_archived', false)
      .order('start_date', { ascending: true });

    query = await applyPersonFilter({
      query,
      selectedPerson: selectedParam,
      userId: user.id,
      module: 'trips',
      columnName: 'traveler_ids',
      isAdmin: user.role === 'admin',
    });

    const { data: trips, error } = await query;

    console.log('[Trips API] Query result:', { tripsCount: trips?.length, error });

    if (error) {
      console.error('[Trips API] Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch trips', details: error.message },
        { status: 500 }
      );
    }

    const filteredTrips = (trips || []).filter(trip =>
      shouldIncludeTravelRecord({
        record: trip,
        context: visibilityContext,
        travelerKeys: ['traveler_ids', 'travelers'],
      })
    );

    console.log('[Trips API] Returning trips:', filteredTrips.length);
    return NextResponse.json({ trips: filteredTrips });
  } catch (error) {
    console.error('[Trips API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;
    const data = await request.json();
    
    // Resolve travelers to UUIDs first (accept both names and IDs)
    const travelerInput = data.travelers || data.traveler_names || data.traveler_ids || [];
    const resolvedTravelerIds = await resolvePersonReferences(travelerInput);
    const resolvedTravelerList = resolvedTravelerIds
      ? (Array.isArray(resolvedTravelerIds) ? resolvedTravelerIds : [resolvedTravelerIds])
      : [];
    const creatorFamilyMemberId = await resolveCurrentUserToFamilyMember(user.id);
    const travelerIds = normalizeTravelerIds(resolvedTravelerList, creatorFamilyMemberId);
    
    // Create calendar event if requested
    let calendarEventId = null;
    if (data.create_calendar_event) {
      try {
        const calendarResponse = await fetch(
          `${request.nextUrl.origin}/api/calendar-events`,
          {
            method: 'POST',
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
                // Use attendee_ids for internal travelers (already resolved to UUIDs)
                attendee_ids: travelerIds,
                metadata: {
                  additional_attendees: data.additional_attendees ? 
                    data.additional_attendees.split(',').map((email: string) => email.trim()).filter((email: string) => email && email.includes('@')) 
                    : []
                },
                google_calendar_id: data.google_calendar_id, // Add Google calendar ID for syncing
                google_sync_enabled: !!data.google_calendar_id // Enable sync if calendar selected
              }
            }),
          }
        );
        if (calendarResponse.ok) {
          const calendarData = await calendarResponse.json();
          calendarEventId = calendarData.event?.id;
          console.log('[Trips API] Calendar event created:', calendarEventId);
        } else {
          const errorText = await calendarResponse.text();
          console.error('[Trips API] Calendar creation failed:', calendarResponse.status, errorText);
        }
      } catch (calError) {
        console.error('[Trips API] Failed to create calendar event:', calError);
        // Continue without calendar event
      }
    }
    
    // Get traveler names for backwards compatibility
    console.log('[Trips API] Converting traveler IDs to names:', travelerIds);
    
    // Instead of using personService which might not be initialized properly,
    // let's keep the original names since we already have them
    let travelerNames: string[] = [];
    if (data.traveler_names && Array.isArray(data.traveler_names)) {
      // If we already have names, use them directly
      travelerNames = data.traveler_names;
    } else if (travelerIds.length > 0) {
      // Only try to convert if we don't have names but have IDs
      await personService.initialize();
      travelerNames = await personService.convertIdsToNames(travelerIds);
    }
    
    console.log('[Trips API] Final traveler names:', travelerNames);
    
    // First create the trip (without hotel fields)
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert({
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
        calendar_event_id: calendarEventId,
        google_calendar_id: data.google_calendar_id || null, // Store the selected Google calendar
        traveler_ids: travelerIds, // Store UUIDs
        traveler_names: travelerNames, // Keep for backwards compatibility
        is_archived: false,
        created_by: user.id,
      })
      .select()
      .single();

    if (tripError) {
      console.error('Trip creation error:', tripError);
      return NextResponse.json(
        { error: 'Failed to create trip' },
        { status: 500 }
      );
    }

    // Skip trip_travelers for now since we're storing names directly in the trips table
    // This avoids issues with family member ID mismatches
    console.log('[Trips API] Trip created with traveler names:', trip.traveler_names);

    // Log the activity
    await logActivity({
      userId: user.id,
      action: 'created',
      entityType: 'trip',
      entityId: trip.id,
      entityName: trip.name || trip.destination,
      page: 'travel',
      details: {
        destination: trip.destination,
        start_date: trip.start_date,
        end_date: trip.end_date,
        travelers: travelerNames,
        status: trip.status
      },
      request
    });

    // Create flight details if provided (from Smart Import)
    if (data.flights && data.flights.length > 0) {
      const flightEntries = data.flights.map((flight: any) => ({
        trip_id: trip.id,
        type: 'flight',
        airline: flight.airline,
        flight_number: flight.flight_number,
        departure_airport: flight.departure_airport,
        arrival_airport: flight.arrival_airport,
        departure_time: flight.departure_time,
        arrival_time: flight.arrival_time,
        confirmation_number: flight.confirmation_number,
        traveler_names: data.travelers ? 
          data.travelers.map((id: string) => {
            const member = data.familyMembers?.find((m: any) => m.id === id);
            return member?.name || '';
          }).filter(Boolean) : [],
      }));

      const { error: flightsError } = await supabase
        .from('travel_details')
        .insert(flightEntries);

      if (flightsError) {
        console.error('Flight details error:', flightsError);
      }
    }

    return NextResponse.json({ trip });
  } catch (error) {
    console.error('[Trips API] Error creating trip:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
