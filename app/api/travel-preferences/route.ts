import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';

export async function GET() {
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;
    
    const { data: preferences, error } = await supabase
      .from('travel_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      return NextResponse.json(
        { error: 'Failed to fetch preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json({ preferences: preferences || null });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
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
    
    // Upsert - will insert if not exists, update if exists
    const { data: preferences, error } = await supabase
      .from('travel_preferences')
      .upsert({
        user_id: user.id,
        seat_preference: data.seat_preference || null,
        meal_preference: data.meal_preference || null,
        airline_preference: data.airline_preference || null,
        hotel_chain_preference: data.hotel_chain_preference || null,
        loyalty_programs: data.loyalty_programs || {},
        passport_number: data.passport_number || null,
        passport_expiry: data.passport_expiry || null,
        passport_country: data.passport_country || null,
        airline_programs: data.airline_programs || {},
        hotel_programs: data.hotel_programs || {},
        tsa_precheck: data.tsa_precheck || null,
        global_entry: data.global_entry || null,
        emergency_contact_name: data.emergency_contact_name || null,
        emergency_contact_phone: data.emergency_contact_phone || null,
        emergency_contact_relationship: data.emergency_contact_relationship || null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to save preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json({ preferences });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}