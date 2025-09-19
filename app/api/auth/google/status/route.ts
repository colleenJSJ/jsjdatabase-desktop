import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { googleAuth } from '@/lib/google/auth';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options)
          },
          remove(name: string, options: any) {
            cookieStore.delete(name)
          },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user has any tokens and whether they are valid
    let hasValidTokens = false;
    let connected = false;
    let expired = false;

    // First, see if a token row exists (treat as connected regardless of expiry)
    const { data: tokenRow } = await supabase
      .from('user_google_tokens')
      .select('expires_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (tokenRow) {
      connected = true;
      // Check expiry and try a refresh path if needed
      const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at) : null;
      if (expiresAt && expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
        hasValidTokens = true;
      } else {
        expired = true;
        try {
          // Attempt to refresh; if it succeeds, tokens are valid again
          await googleAuth.getAuthenticatedClient(user.id);
          hasValidTokens = true;
          expired = false;
        } catch {
          // Still expired or invalid refresh token
          hasValidTokens = false;
        }
      }
    }

    // Get additional connection information if connected
    let connectionInfo: any = {
      hasValidTokens,
      connected,
      expired,
      userId: user.id
    };

    if (connected) {
      // Get user's email
      const { data: userData } = await supabase
        .from('users')
        .select('email')
        .eq('id', user.id)
        .single();

      // Get calendar count
      const { data: calendars } = await supabase
        .from('google_calendars')
        .select('id, updated_at')
        .eq('user_id', user.id);

      // Get last sync time from most recently updated calendar
      let lastSync: string | null = null;
      if (calendars && calendars.length > 0) {
        const sortedCalendars = calendars.sort((a, b) => 
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        lastSync = sortedCalendars[0].updated_at;
      }

      connectionInfo = {
        ...connectionInfo,
        userEmail: userData?.email,
        calendarsCount: calendars?.length || 0,
        lastSync
      };
    }

    return NextResponse.json(connectionInfo);

  } catch (error) {
    console.error('Error checking Google auth status:', error);
    return NextResponse.json(
      { error: 'Failed to check auth status' },
      { status: 500 }
    );
  }
}
