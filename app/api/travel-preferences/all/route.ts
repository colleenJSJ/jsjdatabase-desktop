import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/app/api/_helpers/auth';

export async function GET() {
  try {
    const authResult = await requireAdmin();
    
    if ('error' in authResult) {
      return authResult.error;
    }

    const supabase = await createServiceClient();
    
    const { data: preferences, error } = await supabase
      .from('travel_preferences')
      .select(`
        *,
        users!inner(id, name, email)
      `)
      .order('users(name)', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch all preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json({ preferences: preferences || [] });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}