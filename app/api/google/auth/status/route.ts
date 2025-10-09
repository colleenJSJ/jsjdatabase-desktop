import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { googleAuth } from '@/lib/google/auth';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ connected: false, reason: 'not_authenticated' }, { status: 401 });
    }

    let connected = false;
    let expired = false;

    try {
      await googleAuth.getAuthenticatedClient(user.id, { supabase });
      connected = true;
    } catch (error) {
      connected = false;
      expired = true;
    }

    const { count } = await supabase
      .from('google_calendars')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    return NextResponse.json({
      connected,
      expired,
      calendarsCount: count || 0,
      userId: user.id,
    });
  } catch (error) {
    console.error('Error checking Google auth status:', error);
    return NextResponse.json({ connected: false, reason: 'error' }, { status: 500 });
  }
}
