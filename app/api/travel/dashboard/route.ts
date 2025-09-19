import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withCache, invalidateRelatedCache } from '@/lib/utils/cache';
import { logErrorAndReturn, extractUserId } from '@/lib/utils/error-logger';

/**
 * Consolidated Travel Dashboard Endpoint
 * Returns all travel-related data in a single call to eliminate N+1 queries
 * Maintains the exact same response structure the frontend expects
 */
export async function GET(request: NextRequest) {
  const context = {
    endpoint: '/api/travel/dashboard',
    method: 'GET',
    userId: await extractUserId(request),
  };

  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use caching for this expensive operation
    const data = await withCache(
      '/api/travel/dashboard',
      async () => {
        // Fetch all data in parallel with proper joins
        const [
          tripsResult,
          accommodationsResult,
          detailsResult,
          documentsResult,
          preferencesResult,
          contactsResult,
          familyMembersResult,
        ] = await Promise.all([
          // Fetch trips with calendar events and travelers in one query
          supabase
            .from('trips')
            .select(`
              *,
              calendar_event:calendar_events(
                id,
                title,
                start_time,
                end_time,
                location
              ),
              trip_travelers(
                id,
                family_member_id,
                family_member:family_members(
                  id,
                  name,
                  email,
                  phone
                )
              )
            `)
            .order('start_date', { ascending: true }),
          
          // Fetch accommodations
          supabase
            .from('travel_accommodations')
            .select('*')
            .order('check_in_date', { ascending: true }),
          
          // Fetch travel details (order by date/time columns that exist)
          supabase
            .from('travel_details')
            .select('*')
            .order('travel_date', { ascending: true })
            .order('departure_time', { ascending: true }),
          
          // Fetch travel documents
          supabase
            .from('travel_documents')
            .select('*')
            .order('expiry_date', { ascending: true }),
          
          // Fetch travel preferences
          supabase
            .from('travel_preferences')
            .select('*'),
          
          // Fetch travel contacts
          supabase
            .from('travel_contacts')
            .select('*')
            .order('name', { ascending: true }),
          
          // Fetch all family members for selection
          supabase
            .from('family_members')
            .select('*')
            .order('name', { ascending: true }),
        ]);

        // Check for errors
        if (tripsResult.error) throw tripsResult.error;
        if (accommodationsResult.error) throw accommodationsResult.error;
        if (detailsResult.error) throw detailsResult.error;
        if (documentsResult.error) throw documentsResult.error;
        if (preferencesResult.error) throw preferencesResult.error;
        if (contactsResult.error) throw contactsResult.error;
        if (familyMembersResult.error) throw familyMembersResult.error;

        // Process trips to match expected format
        const processedTrips = tripsResult.data?.map(trip => {
          // Extract travelers from the nested structure
          const travelers = trip.trip_travelers?.map((tt: any) => ({
            id: tt.id,
            family_member_id: tt.family_member_id,
            family_member: tt.family_member,
          })) || [];

          return {
            ...trip,
            travelers, // Frontend expects this format
            trip_travelers: undefined, // Remove the raw join data
          };
        }) || [];

        // Build response in the exact format the frontend expects
        return {
          trips: processedTrips,
          accommodations: accommodationsResult.data || [],
          travel_details: detailsResult.data || [],
          documents: documentsResult.data || [],
          preferences: preferencesResult.data?.[0] || null, // Single preference object
          contacts: contactsResult.data || [],
          family_members: familyMembersResult.data || [],
        };
      },
      { userId: user.id }
    );

    // Return successful response maintaining frontend-expected format
    return NextResponse.json({
      success: true,
      data,
    });

  } catch (error: any) {
    return logErrorAndReturn(error, context, 'Failed to fetch travel dashboard data');
  }
}

/**
 * POST endpoint to trigger cache invalidation after travel updates
 * Call this after any travel-related data changes
 */
export async function POST(request: NextRequest) {
  const context = {
    endpoint: '/api/travel/dashboard',
    method: 'POST',
    userId: await extractUserId(request),
  };

  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Invalidate travel-related caches
    await invalidateRelatedCache('travel', 'update');
    await invalidateRelatedCache('trips', 'update');

    return NextResponse.json({
      success: true,
      message: 'Travel dashboard cache invalidated',
    });

  } catch (error: any) {
    return logErrorAndReturn(error, context, 'Failed to invalidate travel cache');
  }
}
