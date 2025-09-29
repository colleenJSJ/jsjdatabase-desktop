import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';

export async function GET() {
  try {
    const authResult = await getAuthenticatedUser();
    
    if ('error' in authResult) {
      return authResult.error;
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

      return NextResponse.json(
        { error: 'Failed to fetch trips' },
        { status: 500 }
      );
    }

    // Transform the data to include participants
    const tripsWithParticipants = trips.map(trip => ({
      ...trip,
      participants: trip.trip_participants?.map((participant: any) => participant.users) || [],
    }));

    return NextResponse.json({ trips: tripsWithParticipants });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}