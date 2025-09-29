import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';
import { buildInternalApiHeaders } from '@/lib/utils/auth-helpers';
import { resolveCurrentUserToFamilyMember } from '@/app/api/_helpers/person-resolver';
import { buildTravelVisibilityContext, shouldIncludeTravelRecord } from '@/lib/travel/visibility';
import { normalizeTravelerIds } from '@/lib/travel/travelers';

export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get('trip_id');
    const selectedPerson = searchParams.get('selected_person') || undefined;
    const isAdmin = user.role === 'admin';

    const visibilityContext = await buildTravelVisibilityContext({
      supabase,
      userId: user.id,
      selectedPerson,
      isAdmin,
    });

    let query = supabase
      .from('travel_details')
      .select('*')
      .order('travel_date', { ascending: true })
      .order('departure_time', { ascending: true });

    if (tripId && tripId !== 'all') {
      query = query.eq('trip_id', tripId);
    }

    const { data: details, error } = await query;

    if (error) {
      console.error('[Travel Details API] Supabase query failed', error);
      return NextResponse.json(
        {
          error: 'Failed to fetch travel details',
          code: (error as any)?.code ?? null,
          message: (error as any)?.message ?? null,
          hint: (error as any)?.hint ?? null,
          details: (error as any)?.details ?? null,
        },
        { status: 500 }
      );
    }

    const filteredDetails = (details || []).filter((detail: Record<string, unknown>) =>
      shouldIncludeTravelRecord({
        record: detail,
        context: visibilityContext,
      })
    );

    const enhancedDetails = filteredDetails.map((detail: any) => ({
      ...detail,
      // Keep original fields
      // Add combined datetime fields for frontend use
      departure_datetime: detail.travel_date && detail.departure_time 
        ? `${detail.travel_date}T${detail.departure_time}`
        : null,
      arrival_datetime: detail.travel_date && detail.arrival_time
        ? `${detail.travel_date}T${detail.arrival_time}`
        : null
    }));

    return NextResponse.json({ details: enhancedDetails });
  } catch (error) {
    console.error('[Travel Details API] Unexpected error', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      },
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
    
    // Extract travel_date and ensure proper handling of datetime strings
    let travel_date = null;
    if (data.departure_time && data.departure_time.includes('T')) {
      // If departure_time is a full datetime string, extract the date part
      travel_date = data.departure_time.split('T')[0];
    } else if (data.travel_date) {
      // Use travel_date if provided directly
      travel_date = data.travel_date;
    } else if (data.departure_date) {
      // Fallback to departure_date
      travel_date = data.departure_date;
    } else {
      // If no date provided, use current date as fallback
      travel_date = new Date().toISOString().split('T')[0];
    }
    
    // Build details JSON object (required field)
    // Store full datetime strings here for multi-day events
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
      // Store the full datetime strings for proper display
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
    
    // Extract time parts from datetime strings or handle time-only strings
    let departure_time_only = null;
    let arrival_time_only = null;
    
    // For multi-day events (like flights), we should NOT store times in the time-only fields
    // The check_travel_times constraint expects arrival_time > departure_time which fails
    // when they're on different days but have the same time (00:00:00)
    
    // Only extract times if they're on the same day
    const isDifferentDays = data.departure_time && data.arrival_time && 
      data.departure_time.includes('T') && data.arrival_time.includes('T') &&
      data.departure_time.split('T')[0] !== data.arrival_time.split('T')[0];
    
    if (!isDifferentDays) {
      if (data.departure_time) {
        if (data.departure_time.includes('T')) {
          // It's a full datetime string, extract time part
          const timePart = data.departure_time.split('T')[1];
          departure_time_only = timePart ? timePart.split('.')[0].split('Z')[0] : null;
        } else if (data.departure_time.includes(':')) {
          // It's already a time-only string
          departure_time_only = data.departure_time.split('.')[0].split('Z')[0];
        }
      }
      
      if (data.arrival_time) {
        if (data.arrival_time.includes('T')) {
          // It's a full datetime string, extract time part
          const timePart = data.arrival_time.split('T')[1];
          arrival_time_only = timePart ? timePart.split('.')[0].split('Z')[0] : null;
        } else if (data.arrival_time.includes(':')) {
          // It's already a time-only string
          arrival_time_only = data.arrival_time.split('.')[0].split('Z')[0];
        }
      }
    }
    
    console.log('[Travel Details API] Attempting to insert with data:', {
      type: data.type,
      travel_date: travel_date,
      isDifferentDays,
      departure_time_only,
      arrival_time_only,
      departure_time_full: data.departure_time,
      arrival_time_full: data.arrival_time,
      departure_airport_length: data.departure_airport?.length,
      arrival_airport_length: data.arrival_airport?.length,
      departure_airport: data.departure_airport,
      arrival_airport: data.arrival_airport,
      details_departure_datetime: details.departure_datetime,
      details_arrival_datetime: details.arrival_datetime,
    });
    
    // Handle travelers - accept multiple formats
    let travelerUUIDs: string[] = [];
    let travelerNames = [];
    
    // If we have attendee_ids (from calendar), use those as UUIDs
    if (data.attendee_ids && Array.isArray(data.attendee_ids)) {
      travelerUUIDs = data.attendee_ids;
    } 
    // If we have travelers array (could be UUIDs or names)
    else if (data.travelers && Array.isArray(data.travelers)) {
      // Check if first element looks like a UUID
      if (data.travelers.length > 0 && data.travelers[0].match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        travelerUUIDs = data.travelers;
      } else {
        // These are names, not UUIDs
        travelerNames = data.travelers;
      }
    }
    
    // Also capture traveler_names if provided
    if (data.traveler_names && Array.isArray(data.traveler_names)) {
      travelerNames = data.traveler_names;
    }
    
    console.log('[Travel Details API] Travelers processing:', {
      attendee_ids: data.attendee_ids,
      travelers: data.travelers,
      traveler_names: data.traveler_names,
      travelerUUIDs,
      travelerNames
    });

    // Ensure the creating family member is always associated
    const creatorFamilyMemberId = await resolveCurrentUserToFamilyMember(user.id);
    const normalizedTravelerIds = normalizeTravelerIds(travelerUUIDs, creatorFamilyMemberId);
    
    const { data: detail, error } = await supabase
      .from('travel_details')
      .insert({
        type: data.type,
        travel_date: travel_date, // Required field
        details: details, // Required field
        travelers: normalizedTravelerIds.length > 0 ? normalizedTravelerIds : null, // Store UUIDs for filtering
        traveler_names: travelerNames.length > 0 ? travelerNames : null, // Store names for display
        provider: data.provider || null,
        confirmation_number: data.confirmation_number || null,
        departure_location: data.departure_location || null,
        arrival_location: data.arrival_location || null,
        // Only set time fields if both are available and valid
        // The check_travel_times constraint requires both to be NULL or both to be NOT NULL
        departure_time: (departure_time_only && arrival_time_only) ? departure_time_only : null,
        arrival_time: (departure_time_only && arrival_time_only) ? arrival_time_only : null,
        airline: data.airline || null,
        flight_number: data.flight_number || null,
        departure_airport: data.departure_airport || null,
        arrival_airport: data.arrival_airport || null,
        vehicle_info: data.vehicle_info || null,
        trip_id: data.trip_id || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[Travel Details API] Failed to create travel detail:', error);
      console.error('[Travel Details API] Full error object:', JSON.stringify(error, null, 2));
      console.error('[Travel Details API] Data that failed:', JSON.stringify(data, null, 2));
      return NextResponse.json(
        { error: 'Failed to create travel detail', details: error.message, code: error.code },
        { status: 500 }
      );
    }

    let calendarEvent = null;
    
    // Create calendar event for transportation (even if arrival_time is missing)
    if (detail && data.departure_time) {
      try {
        let title = '';
        let location = '';
        
        if (data.type === 'flight') {
          title = `Flight: ${data.departure_airport || data.departure_location} → ${data.arrival_airport || data.arrival_location}`;
          location = data.departure_airport || data.departure_location;
        } else if (data.type === 'train') {
          title = `Train: ${data.departure_location} → ${data.arrival_location}`;
          location = data.departure_location;
        } else if (data.type === 'car_rental') {
          title = `Car Rental: ${data.provider || 'Pickup'}`;
          location = data.departure_location;
        } else {
          title = `${data.type}: ${data.departure_location} → ${data.arrival_location}`;
          location = data.departure_location;
        }
        
        // Ensure we have proper datetime strings for calendar events
        let calendarStartTime = data.departure_time;
        let calendarEndTime = data.arrival_time || data.departure_time; // Default to departure if no arrival
        
        // If the times are just time strings (HH:MM:SS), combine with travel_date
        if (data.departure_time && !data.departure_time.includes('T') && travel_date) {
          calendarStartTime = `${travel_date}T${departure_time_only || data.departure_time}`;
        }
        if (data.arrival_time && !data.arrival_time.includes('T') && travel_date) {
          calendarEndTime = `${travel_date}T${arrival_time_only || data.arrival_time}`;
        } else if (!data.arrival_time && data.departure_time && !data.departure_time.includes('T') && travel_date) {
          // If no arrival time, use departure time for end (moment event)
          calendarEndTime = `${travel_date}T${departure_time_only || data.departure_time}`;
        }
        
        // Log if creating a moment event
        if (!data.arrival_time) {
          console.log('[Travel Details API] Creating moment event (no arrival time) with start/end:', calendarStartTime);
        }
        
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
            console.log('[Travel Details API] Normalized additional_attendees from string:', data.additional_attendees, '→', normalizedAdditionalAttendees);
          } else {
            console.log('[Travel Details API] Unexpected additional_attendees type:', typeof data.additional_attendees);
          }
        }

        // Infer timezones from airports if not provided
        const airportToTz = (code?: string | null): string | undefined => {
          if (!code) return undefined;
          const c = code.toUpperCase();
          const map: Record<string, string> = {
            JFK: 'America/New_York', LGA: 'America/New_York', EWR: 'America/New_York',
            BOS: 'America/New_York', BWI: 'America/New_York', DCA: 'America/New_York',
            MIA: 'America/New_York', FLL: 'America/New_York', ATL: 'America/New_York',
            ORD: 'America/Chicago', DFW: 'America/Chicago', IAH: 'America/Chicago', AUS: 'America/Chicago',
            DEN: 'America/Denver', PHX: 'America/Phoenix',
            LAX: 'America/Los_Angeles', SFO: 'America/Los_Angeles', SAN: 'America/Los_Angeles', SEA: 'America/Los_Angeles',
            HNL: 'Pacific/Honolulu', ANC: 'America/Anchorage',
            LHR: 'Europe/London', LGW: 'Europe/London', MAN: 'Europe/London',
            CDG: 'Europe/Paris', AMS: 'Europe/Amsterdam', FRA: 'Europe/Berlin', MUC: 'Europe/Berlin',
            MAD: 'Europe/Madrid', BCN: 'Europe/Madrid', FCO: 'Europe/Rome',
            NRT: 'Asia/Tokyo', HND: 'Asia/Tokyo', ICN: 'Asia/Seoul', HKG: 'Asia/Hong_Kong', SIN: 'Asia/Singapore',
          };
          return map[c];
        };
        const departureTz = data.departure_timezone || airportToTz(data.departure_airport);
        const arrivalTz = data.arrival_timezone || airportToTz(data.arrival_airport);

        console.log('[Travel Details API] Creating calendar event via API with times:', {
          start_time: calendarStartTime,
          end_time: calendarEndTime,
          google_sync_enabled: data.google_sync_enabled,
          google_calendar_id: data.google_calendar_id,
          travelers: normalizedTravelerIds,
          additional_attendees: normalizedAdditionalAttendees,
          departure_timezone_inferred: departureTz,
          arrival_timezone_inferred: arrivalTz
        });
        
        // Use the centralized calendar-events API for consistent handling
        try {
          const calendarEventPayload = {
            event: {
              title,
              description: `${data.airline || data.provider || data.type}${data.flight_number ? ' ' + data.flight_number : ''}${data.confirmation_number ? `\nConfirmation: ${data.confirmation_number}` : ''}`,
              start_time: calendarStartTime,
              end_time: calendarEndTime,
              all_day: false,
              category: 'travel',
              location,
              source: 'travel',
              source_reference: detail.id,
              // Use attendee_ids for internal travelers (UUIDs)
              attendee_ids: normalizedTravelerIds,
              google_sync_enabled: data.google_sync_enabled || false,
              google_calendar_id: data.google_calendar_id || null,
              send_invites: data.send_invites === true,
              metadata: {
                // Include normalized additional attendees (external emails)
                additional_attendees: normalizedAdditionalAttendees,
                notify_attendees: data.notify_attendees !== false,
                trip_id: data.trip_id,
                confirmation_number: data.confirmation_number,
                airline: data.airline,
                flight_number: data.flight_number,
                // Timezone hints for Google sync: prefer explicit, else infer from airports
                timezone: data.departure_timezone || departureTz || undefined,
                start_timezone: data.departure_timezone || departureTz || undefined,
                end_timezone: data.arrival_timezone || arrivalTz || undefined
              }
            }
          };

          const calendarResponse = await fetch(`${request.nextUrl.origin}/api/calendar-events`, {
            method: 'POST',
            headers: await buildInternalApiHeaders(request, {
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify(calendarEventPayload)
          });

          if (!calendarResponse.ok) {
            const errorData = await calendarResponse.json().catch(() => null);
            console.error('[Travel Details API] Failed to create calendar event:', errorData);
            // Don't fail the travel detail creation if calendar event fails
          } else {
            const calendarData = await calendarResponse.json();
            calendarEvent = calendarData.event;
            console.log('[Travel Details API] Calendar event created successfully:', calendarEvent?.id);
            
            // Google sync is now handled automatically by the calendar-events API
            if (data.google_sync_enabled && data.google_calendar_id) {
              console.log('[Travel Details API] Google sync will be triggered automatically by calendar-events API');
            }
          }
        } catch (calendarError) {
          console.error('[Travel Details API] Error creating calendar event:', calendarError);
          // Don't fail the travel detail creation if calendar event fails
        }
      } catch (calendarError) {
        console.error('[Travel Details API] Error creating calendar event:', calendarError);
      }
    }

    return NextResponse.json({
      success: true,
      travelDetailId: detail.id,
      calendarEventId: calendarEvent?.id,
      detail,
      calendarEvent
    });
  } catch (error) {
    console.error('[Travel Details API] Error creating travel detail:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
