import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { google } from 'googleapis';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if Google Calendar API credentials are configured
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ 
        error: 'Google Calendar API not configured',
        details: 'Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables'
      }, { status: 503 });
    }

    // Get user's stored Google tokens
    const { data: userTokens, error: tokenError } = await supabase
      .from('user_google_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (tokenError || !userTokens) {
      return NextResponse.json({ 
        error: 'Google account not connected',
        details: 'Please connect your Google account in settings'
      }, { status: 401 });
    }

    // Create OAuth2 client with stored tokens
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    oauth2Client.setCredentials({
      access_token: userTokens.access_token,
      refresh_token: userTokens.refresh_token,
      expiry_date: new Date(userTokens.expires_at).getTime()
    });

    // Handle token refresh if needed
    if (userTokens.expires_at && new Date(userTokens.expires_at) < new Date()) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        
        // Update stored tokens
        await supabase
          .from('user_google_tokens')
          .update({
            access_token: credentials.access_token,
            expires_at: new Date(credentials.expiry_date!).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);

        oauth2Client.setCredentials(credentials);
      } catch (refreshError) {
        console.error('Failed to refresh Google token:', refreshError);
        return NextResponse.json({ 
          error: 'Failed to refresh Google authentication',
          details: 'Please reconnect your Google account'
        }, { status: 401 });
      }
    }

    // Fetch calendar list from Google
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    try {
      const response = await calendar.calendarList.list({
        minAccessRole: 'writer', // Only get calendars we can write to
        showDeleted: false,
        showHidden: false
      });

      const calendars = response.data.items || [];
      
      console.log(`Found ${calendars.length} Google calendars for user ${user.id}`);

      // Store/update calendars in database
      const upsertPromises = calendars.map(async (cal) => {
        const calendarData = {
          user_id: user.id,
          google_calendar_id: cal.id!,
          name: cal.summary || 'Unnamed Calendar',
          description: cal.description || null,
          background_color: cal.backgroundColor || '#4285F4',
          foreground_color: cal.foregroundColor || '#FFFFFF',
          color_id: cal.colorId || null,
          is_primary: cal.primary || false,
          can_write: true, // We filtered by minAccessRole: 'writer'
          is_visible: !cal.hidden,
          access_role: cal.accessRole || 'writer',
          time_zone: cal.timeZone || null,
          updated_at: new Date().toISOString(),
          last_synced_at: new Date().toISOString()
        };

        return supabase
          .from('google_calendars')
          .upsert(calendarData, {
            onConflict: 'user_id,google_calendar_id'
          });
      });

      const results = await Promise.all(upsertPromises);
      
      // Check for errors
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        console.error('Errors storing calendars:', errors);
        return NextResponse.json({ 
          error: 'Failed to store some calendars',
          details: errors.map(e => e.error?.message).join(', '),
          successCount: calendars.length - errors.length
        }, { status: 207 }); // Partial success
      }

      // Mark calendars no longer in Google as not visible
      const currentCalendarIds = calendars.map(c => c.id);
      if (currentCalendarIds.length > 0) {
        await supabase
          .from('google_calendars')
          .update({ is_visible: false })
          .eq('user_id', user.id)
          .not('google_calendar_id', 'in', `(${currentCalendarIds.join(',')})`);
      }

      return NextResponse.json({
        success: true,
        count: calendars.length,
        calendars: calendars.map(c => ({
          id: c.id,
          name: c.summary,
          color: c.backgroundColor,
          is_primary: c.primary
        }))
      });

    } catch (googleError: any) {
      console.error('Google Calendar API error:', googleError);
      
      // Handle specific Google API errors
      if (googleError.code === 401) {
        return NextResponse.json({ 
          error: 'Google authentication expired',
          details: 'Please reconnect your Google account'
        }, { status: 401 });
      }
      
      return NextResponse.json({ 
        error: 'Failed to fetch calendars from Google',
        details: googleError.message || 'Unknown error'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in /api/google/calendars/sync:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET endpoint to check sync status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has Google tokens
    const { data: userTokens } = await supabase
      .from('user_google_tokens')
      .select('id, expires_at')
      .eq('user_id', user.id)
      .single();

    // Get count of synced calendars
    const { count } = await supabase
      .from('google_calendars')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_visible', true);

    return NextResponse.json({
      connected: !!userTokens,
      expired: userTokens?.expires_at ? new Date(userTokens.expires_at) < new Date() : false,
      calendar_count: count || 0
    });

  } catch (error) {
    console.error('Error checking sync status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
