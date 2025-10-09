import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceCSRF } from '@/lib/security/csrf';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Fetch pets from family_members table (single source of truth)
    const { data: pets, error } = await supabase
      .from('family_members')
      .select('*')
      .eq('type', 'pet')
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ pets: pets || [] });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch pets' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const supabase = await createClient();
    const body = await request.json();

    // Ensure type and role are set for pets
    const petData = {
      ...body,
      type: 'pet',
      role: 'pet',
      member_type: 'pet', // Keep for backwards compatibility
      is_child: false
    };

    const { data: pet, error } = await supabase
      .from('family_members')
      .insert(petData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ pet });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create pet' },
      { status: 500 }
    );
  }
}