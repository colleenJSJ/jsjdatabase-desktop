import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const supabase = await createServiceClient();
    const today = new Date().toISOString().split('T')[0];

    const { data: trips, error } = await supabase
      .from('trips')
      .select(`
        *,
        trip_participants(
          user_id,
          users(id, name, email)
        )
      `)
      .gte('start_date', today)
      .order('start_date', { ascending: true });

    if (error) {
      return jsonError('Failed to fetch trips', {
        status: 500,
        meta: { message: error.message },
      });
    }

    // Transform the data to include participants
    const tripsWithParticipants = trips.map(trip => ({
      ...trip,
      participants: trip.trip_participants?.map((participant: any) => participant.users) || [],
    }));

    return jsonSuccess({ trips: tripsWithParticipants }, {
      legacy: { trips: tripsWithParticipants },
    });
  } catch (error) {
    return jsonError('Internal server error', {
      status: 500,
      meta: {
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}
