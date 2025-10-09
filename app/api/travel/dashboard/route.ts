import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { withCache, invalidateRelatedCache } from '@/lib/utils/cache';
import { extractUserId } from '@/lib/utils/error-logger';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

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
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;

    const data = await withCache(
      '/api/travel/dashboard',
      async () => {
        const [
          tripsResult,
          accommodationsResult,
          detailsResult,
          documentsResult,
          preferencesResult,
          contactsResult,
          familyMembersResult,
        ] = await Promise.all([
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
              trip_travelers:trip_travelers(
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

          supabase
            .from('travel_accommodations')
            .select('*')
            .order('check_in', { ascending: true }),

          supabase
            .from('travel_details')
            .select('*')
            .order('travel_date', { ascending: true })
            .order('departure_time', { ascending: true }),

          supabase
            .from('documents')
            .select('*')
            .eq('category', 'travel')
            .eq('uploaded_by', user.id)
            .order('created_at', { ascending: false }),

          supabase
            .from('travel_preferences')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle(),

          supabase
            .from('contacts_unified')
            .select('*')
            .eq('contact_type', 'travel')
            .order('name', { ascending: true }),

          supabase
            .from('family_members')
            .select('*')
            .order('name', { ascending: true }),
        ]);

        if (tripsResult.error) throw tripsResult.error;
        if (accommodationsResult.error) throw accommodationsResult.error;
        if (detailsResult.error) throw detailsResult.error;
        if (documentsResult.error) throw documentsResult.error;
        if (contactsResult.error) throw contactsResult.error;
        if (familyMembersResult.error) throw familyMembersResult.error;
        if (preferencesResult.error && preferencesResult.error.code !== 'PGRST116') {
          throw preferencesResult.error;
        }

        const processedTrips = (tripsResult.data ?? []).map((trip: any) => {
          const travelers = Array.isArray(trip.trip_travelers)
            ? trip.trip_travelers.map((tt: any) => ({
                id: tt.id,
                family_member_id: tt.family_member_id,
                family_member: tt.family_member,
              }))
            : [];

          const { trip_travelers, ...rest } = trip;
          return {
            ...rest,
            travelers,
          };
        });

        return {
          trips: processedTrips,
          accommodations: accommodationsResult.data ?? [],
          travel_details: detailsResult.data ?? [],
          documents: documentsResult.data ?? [],
          preferences: preferencesResult.data ?? null,
          contacts: contactsResult.data ?? [],
          family_members: familyMembersResult.data ?? [],
        };
      },
      { userId: user.id }
    );

    return jsonSuccess(data);
  } catch (error: any) {
    console.error('[Travel Dashboard] Failed to build payload', error);
    return jsonError('Failed to fetch travel dashboard data', { status: 500 });
  }
}

/**
 * POST endpoint to trigger cache invalidation after travel updates
 * Call this after any travel-related data changes
 */
export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const context = {
    endpoint: '/api/travel/dashboard',
    method: 'POST',
    userId: await extractUserId(request),
  };

  try {
    const authResult = await requireUser(request);
    if (authResult instanceof Response) {
      return authResult;
    }

    // Invalidate travel-related caches
    await invalidateRelatedCache('travel', 'update');
    await invalidateRelatedCache('trips', 'update');

    return jsonSuccess({ message: 'Travel dashboard cache invalidated' }, {
      legacy: { success: true, message: 'Travel dashboard cache invalidated' },
    });

  } catch (error: any) {
    console.error('[Travel Dashboard] Failed to invalidate cache', error);
    return jsonError('Failed to invalidate travel cache', { status: 500 });
  }
}
