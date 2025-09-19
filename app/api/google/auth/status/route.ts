import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has stored Google tokens
    const { data: tokens, error } = await supabase
      .from('user_google_tokens')
      .select('expires_at, created_at')
      .eq('user_id', user.id)
      .single();

    if (error || !tokens) {
      return NextResponse.json({ 
        connected: false,
        message: 'Google account not connected'
      });
    }

    // Check if token is expired
    const isExpired = new Date(tokens.expires_at) < new Date();

    // Get connected calendars count
    const { count } = await supabase
      .from('google_calendars')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    return NextResponse.json({
      connected: true,
      expired: isExpired,
      calendarsCount: count || 0,
      connectedAt: tokens.created_at,
      message: isExpired ? 'Token expired - please reconnect' : 'Google account connected'
    });
  } catch (error) {
    console.error('Error checking Google auth status:', error);
    return NextResponse.json(
      { error: 'Failed to check authentication status' },
      { status: 500 }
    );
  }
}