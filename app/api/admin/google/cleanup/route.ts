import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { google } from 'googleapis';

/**
 * Admin endpoint to clean up Google Calendar test events without affecting real data.
 * - Auth: admin only
 * - Strategy: delete events matching a query (e.g., title contains "Test") and/or in a time window
 *   This avoids deleting user’s personal events unintentionally.
 *
 * Query params:
 *   calendarId?: string            // specific Google calendar id; otherwise all writable calendars of user
 *   since?: string                 // ISO date, default 2025-08-01
 *   q?: string                     // free text query, default 'Test'
 *   dryRun?: 'true' | 'false'      // if true, return items that would be deleted without deleting
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Require admin
    const { data: me } = await supabase
      .from('users')
      .select('role, email')
      .eq('id', user.id)
      .single();
    if (!me || me.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const url = new URL(request.url);
    const calendarIdParam = url.searchParams.get('calendarId') || undefined;
    const sinceParam = url.searchParams.get('since') || '2025-08-01T00:00:00Z';
    const q = url.searchParams.get('q') || 'Test';
    const dryRun = (url.searchParams.get('dryRun') || 'false').toLowerCase() === 'true';

    // Get OAuth tokens for this user
    const { data: tokenRow, error: tokenError } = await supabase
      .from('user_google_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single();
    if (tokenError || !tokenRow) {
      return NextResponse.json({ error: 'Google account not connected' }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({
      access_token: tokenRow.access_token,
      refresh_token: tokenRow.refresh_token,
      expiry_date: tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : undefined,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Determine calendars to operate on
    let calendars: { google_calendar_id: string }[] = [];
    if (calendarIdParam) {
      calendars = [{ google_calendar_id: calendarIdParam }];
    } else {
      const { data: myCals } = await supabase
        .from('google_calendars')
        .select('google_calendar_id, can_write')
        .eq('user_id', user.id);
      calendars = (myCals || []).filter((c) => c.can_write !== false).map((c) => ({ google_calendar_id: c.google_calendar_id }));
    }

    const timeMin = new Date(sinceParam).toISOString();
    const deleted: any[] = [];
    const found: any[] = [];

    for (const cal of calendars) {
      let pageToken: string | undefined = undefined;
      do {
        const res: any = await calendar.events.list({
          calendarId: cal.google_calendar_id,
          timeMin,
          q,              // match by query text (e.g., "Test")
          maxResults: 2500,
          singleEvents: true,
          pageToken
        });
        const items = res.data.items || [];
        for (const ev of items) {
          found.push({ calendarId: cal.google_calendar_id, id: ev.id, summary: ev.summary, created: ev.created });
          if (!dryRun && ev.id) {
            try {
              await calendar.events.delete({ calendarId: cal.google_calendar_id, eventId: ev.id });
              deleted.push({ calendarId: cal.google_calendar_id, id: ev.id, summary: ev.summary });
            } catch (e: any) {
              // continue on error for individual events
              deleted.push({ calendarId: cal.google_calendar_id, id: ev.id, summary: ev.summary, error: e?.message || 'delete failed' });
            }
          }
        }
        pageToken = res.data.nextPageToken || undefined;
      } while (pageToken);
    }

    return NextResponse.json({
      success: true,
      mode: dryRun ? 'dryRun' : 'deleted',
      query: { calendarCount: calendars.length, since: timeMin, q },
      counts: { found: found.length, deleted: dryRun ? 0 : deleted.length },
      sample: (dryRun ? found : deleted).slice(0, 20)
    });
  } catch (error) {
    console.error('[Admin Google Cleanup] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
