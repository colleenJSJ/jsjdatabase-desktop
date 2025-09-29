import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Debug OAuth credentials
console.log('[OAuth Debug] Initializing OAuth2 client:');
console.log('[OAuth Debug] Client ID:', process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...');
console.log('[OAuth Debug] Has Client Secret:', !!process.env.GOOGLE_CLIENT_SECRET);
console.log('[OAuth Debug] Client Secret length:', process.env.GOOGLE_CLIENT_SECRET?.length);
console.log('[OAuth Debug] Redirect URI:', process.env.GOOGLE_REDIRECT_URI);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(new URL('/calendar?error=google_auth_denied', request.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL('/calendar?error=no_auth_code', request.url));
    }

    // Exchange authorization code for tokens
    console.log('[OAuth Debug] Attempting to exchange code for tokens');
    console.log('[OAuth Debug] Code length:', code.length);
    
    let tokens;
    try {
      const { tokens: exchangedTokens } = await oauth2Client.getToken(code);
      tokens = exchangedTokens;
      console.log('[OAuth Debug] Token exchange successful');
      console.log('[OAuth Debug] Tokens received:', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        hasExpiry: !!tokens.expiry_date
      });
    } catch (tokenError: any) {
      console.error('[OAuth Debug] Token exchange failed:', tokenError);
      console.error('[OAuth Debug] Error details:', {
        message: tokenError.message,
        code: tokenError.code,
        response: tokenError.response?.data
      });
      
      // Return more specific error message
      const errorMessage = tokenError.response?.data?.error || tokenError.message || 'token_exchange_failed';
      return NextResponse.redirect(new URL(`/calendar?error=${errorMessage}`, request.url));
    }
    
    // Ensure tokens are valid before setting
    if (!tokens || !tokens.access_token) {
      console.error('[OAuth Debug] Invalid tokens received:', tokens);
      return NextResponse.redirect(new URL('/calendar?error=invalid_tokens', request.url));
    }
    
    oauth2Client.setCredentials(tokens);
    console.log('[OAuth Debug] Credentials set on OAuth client');

    // Skip user info - we just need to store the tokens
    console.log('[OAuth Debug] Skipping user info fetch - not needed for calendar sync');

    // Create Supabase client
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

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.redirect(new URL('/login?error=not_authenticated', request.url));
    }

    // Check if user is admin
    const { data: userData, error: userDataError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userDataError || userData?.role !== 'admin') {
      return NextResponse.redirect(new URL('/calendar?error=admin_only', request.url));
    }

    // Store or update OAuth tokens in the correct table
    console.log('[OAuth Debug] Storing tokens in user_google_tokens table');
    const { error: tokenError } = await supabase
      .from('user_google_tokens')
      .upsert({
        user_id: user.id,
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token || null,
        expires_at: new Date(tokens.expiry_date!).toISOString(),
        scope: tokens.scope || null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (tokenError) {
      console.error('Error storing OAuth tokens:', tokenError);
      return NextResponse.redirect(new URL('/calendar?error=token_storage_failed', request.url));
    }

    // Fetch and store calendars
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const { data: calendarList } = await calendar.calendarList.list();

    if (calendarList.items) {
      // Store calendars in database
      for (const cal of calendarList.items) {
        const { error: calError } = await supabase
          .from('google_calendars')
          .upsert({
            google_calendar_id: cal.id!,
            name: cal.summary!,
            description: cal.description || null,
            color_id: cal.colorId || null,
            background_color: cal.backgroundColor || null,
            foreground_color: cal.foregroundColor || null,
            is_primary: cal.primary || false,
            time_zone: cal.timeZone || null,
            access_role: cal.accessRole || null,
            updated_at: new Date().toISOString(),
            last_synced_at: new Date().toISOString()
          }, {
            onConflict: 'google_calendar_id'
          });

        if (calError) {
          console.error('Error storing calendar:', calError);
        }
      }
    }

    // Redirect to admin settings with success message
    return NextResponse.redirect(new URL('/admin/settings?tab=calendar&success=google_connected', request.url));
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return NextResponse.redirect(new URL('/calendar?error=oauth_failed', request.url));
  }
}