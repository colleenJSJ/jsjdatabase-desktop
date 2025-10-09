import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { google } from 'googleapis';
import { upsertGoogleTokens } from '@/lib/google/token-service';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // User ID passed from auth endpoint
    const error = searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      // Redirect to calendar page with error
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/calendar?error=auth_denied`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/calendar?error=missing_params`
      );
    }

    const supabase = await createClient();

    // Exchange authorization code for tokens
    console.log('[OAuth Debug - /google/callback] Exchanging code for tokens');
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('[OAuth Debug - /google/callback] Tokens received:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      hasExpiry: !!tokens.expiry_date
    });
    
    if (!tokens.access_token || !tokens.expiry_date) {
      throw new Error('Invalid token response from Google');
    }
    
    oauth2Client.setCredentials(tokens);
    console.log('[OAuth Debug - /google/callback] Credentials set on OAuth client');

    // Store tokens in database
    const { error: tokenServiceError } = await upsertGoogleTokens({
      userId: state,
      payload: {
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token!,
        expires_at: new Date(tokens.expiry_date).toISOString(),
        scope: tokens.scope,
      },
    });

    if (tokenServiceError) {
      console.error('Error storing tokens via Edge Function:', tokenServiceError);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/calendar?error=token_storage_failed`
      );
    }

    // Sync Google calendars after successful auth
    try {
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const { data } = await calendar.calendarList.list();

      if (data.items) {
        // Store calendars in database
        const calendarsToInsert = data.items.map(cal => ({
          user_id: state,
          google_calendar_id: cal.id,
          name: cal.summary || 'Unnamed Calendar',
          description: cal.description,
          background_color: cal.backgroundColor || '#6366f1',
          foreground_color: cal.foregroundColor || '#ffffff',
          is_primary: cal.primary || false,
          can_write: cal.accessRole === 'owner' || cal.accessRole === 'writer',
          time_zone: cal.timeZone,
          access_role: cal.accessRole,
          updated_at: new Date().toISOString()
        }));

        await supabase
          .from('google_calendars')
          .upsert(calendarsToInsert, {
            onConflict: 'user_id,google_calendar_id'
          });
      }
    } catch (syncError) {
      console.error('Error syncing calendars after auth:', syncError);
      // Continue anyway - user is authenticated
    }

    // Redirect to calendar page with success
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/calendar?google_auth=success`
    );
  } catch (error) {
    console.error('Error in Google OAuth callback:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/calendar?error=auth_failed`
    );
  }
}
