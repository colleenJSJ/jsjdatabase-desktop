import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;
    
    const { data: preferences, error } = await supabase
      .from('travel_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      return jsonError('Failed to fetch preferences', { status: 500 });
    }

    const payload = preferences ?? null;
    return jsonSuccess({ preferences: payload }, { legacy: { preferences: payload } });
  } catch (error) {
    return jsonError('Internal server error', { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;
    const data = await request.json();

    const loyaltyPrograms = (() => {
      const base = data?.loyalty_programs && typeof data.loyalty_programs === 'object'
        ? data.loyalty_programs
        : {};

      const extra: Record<string, unknown> = {};
      if (Array.isArray(data?.airline_programs)) extra.airline_programs = data.airline_programs;
      if (Array.isArray(data?.hotel_programs)) extra.hotel_programs = data.hotel_programs;
      if (data?.airline_preference) extra.airline_preference = data.airline_preference;
      if (data?.hotel_chain_preference) extra.hotel_chain_preference = data.hotel_chain_preference;
      if (data?.global_entry) extra.global_entry = data.global_entry;

      if (data?.emergency_contact_name || data?.emergency_contact_phone || data?.emergency_contact_relationship) {
        extra.emergency_contact = {
          name: data.emergency_contact_name ?? null,
          phone: data.emergency_contact_phone ?? null,
          relationship: data.emergency_contact_relationship ?? null,
        };
      }

      const merged = { ...base, ...extra } as Record<string, unknown>;
      return Object.keys(merged).length > 0 ? merged : {};
    })();

    const payload = {
      user_id: user.id,
      seat_preference: data?.seat_preference ?? null,
      meal_preference: data?.meal_preference ?? null,
      tsa_precheck: data?.tsa_precheck ?? null,
      passport_number: data?.passport_number ?? null,
      passport_expiry: data?.passport_expiry || null,
      loyalty_programs: loyaltyPrograms,
      updated_at: new Date().toISOString(),
    };

    const { data: preferences, error } = await supabase
      .from('travel_preferences')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      console.error('[Travel Preferences] Failed to upsert', error);
      return jsonError('Failed to save preferences', { status: 500 });
    }

    return jsonSuccess({ preferences }, { legacy: { preferences } });
  } catch (error) {
    console.error('[Travel Preferences] Unexpected error', error);
    return jsonError('Internal server error', { status: 500 });
  }
}
