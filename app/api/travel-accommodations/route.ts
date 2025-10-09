import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { buildTravelVisibilityContext, shouldIncludeTravelRecord } from '@/lib/travel/visibility';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
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
      return jsonError('Failed to fetch accommodations', { status: 500 });
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

    return jsonSuccess({ accommodations: filtered }, {
      legacy: { accommodations: filtered },
    });
  } catch (error) {
    console.error('Error in GET /api/travel-accommodations:', error);
    return jsonError('Internal server error', { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const authResult = await requireUser(request, { enforceCsrf: false, role: 'admin' });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;

    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.trip_id) {
      return jsonError('Name and trip_id are required', { status: 400 });
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
      return jsonError('Failed to create accommodation', { status: 500 });
    }

    return jsonSuccess({ accommodation }, {
      status: 201,
      legacy: { accommodation },
    });
  } catch (error) {
    console.error('Error in POST /api/travel-accommodations:', error);
    return jsonError('Internal server error', { status: 500 });
  }
}
