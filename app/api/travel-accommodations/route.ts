import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';
import { buildTravelVisibilityContext, shouldIncludeTravelRecord } from '@/lib/travel/visibility';

export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;
    const isAdmin = user.role === 'admin';
    const searchParams = request.nextUrl.searchParams;
    const tripId = searchParams.get('trip_id');
    const selectedPerson = searchParams.get('selected_person') || undefined;

    const visibilityContext = await buildTravelVisibilityContext({
      supabase,
      userId: user.id,
      selectedPerson,
      isAdmin,
    });

    let query = supabase
      .from('travel_accommodations')
      .select(`
        *,
        trip:trips(id, destination, start_date, end_date, traveler_ids, created_by)
      `);

    if (tripId) {
      query = query.eq('trip_id', tripId);
    }

    if (!isAdmin) {
      const accessibleTripIds = Array.from(visibilityContext.accessibleTripIds);
      if (accessibleTripIds.length > 0) {
        const inClause = accessibleTripIds.map(id => `"${id}"`).join(',');
        query = query.or(`created_by.eq.${user.id},trip_id.in.(${inClause})`);
      } else {
        query = query.eq('created_by', user.id);
      }
    }

    const { data: accommodations, error } = await query.order('check_in', { ascending: true });

    if (error) {
      console.error('Error fetching accommodations:', error);
      return NextResponse.json({ error: 'Failed to fetch accommodations' }, { status: 500 });
    }

    const filtered = (accommodations || []).filter(accommodation => {
      const fallbackTravelerIds = Array.isArray((accommodation as any)?.trip?.traveler_ids)
        ? ((accommodation as any).trip.traveler_ids as string[])
        : [];
      return shouldIncludeTravelRecord({
        record: accommodation,
        context: visibilityContext,
        travelerKeys: ['traveler_ids', 'travelers'],
        fallbackTravelerIds,
      });
    });

    return NextResponse.json({ accommodations: filtered });
  } catch (error) {
    console.error('Error in GET /api/travel-accommodations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.trip_id) {
      return NextResponse.json({ error: 'Name and trip_id are required' }, { status: 400 });
    }

    // Create accommodation data
    const accommodationData = {
      trip_id: body.trip_id,
      name: body.name,
      type: body.type || 'hotel',
      confirmation_number: body.confirmation_number || null,
      address: body.address || null,
      check_in: body.check_in || null,
      check_out: body.check_out || null,
      cost: body.cost || null,
      currency: body.currency || 'USD',
      room_type: body.room_type || null,
      amenities: body.amenities || null,
      contact_info: body.contact_info || null,
      notes: body.notes || null,
      created_by: user.id
    };

    // Insert accommodation
    const { data: accommodation, error: insertError } = await supabase
      .from('travel_accommodations')
      .insert(accommodationData)
      .select(`
        *,
        trip:trips(id, destination, start_date, end_date)
      `)
      .single();

    if (insertError) {
      console.error('Error creating accommodation:', insertError);
      return NextResponse.json({ error: 'Failed to create accommodation' }, { status: 500 });
    }

    return NextResponse.json({ accommodation }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/travel-accommodations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
