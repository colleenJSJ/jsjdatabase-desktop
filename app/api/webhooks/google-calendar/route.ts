import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { googleAuth } from '@/lib/google/auth';
import { google } from 'googleapis';

// Google Calendar webhook endpoint
export async function POST(request: NextRequest) {
  try {
    // Verify the webhook is from Google
    const channelId = request.headers.get('X-Goog-Channel-ID');
    const resourceId = request.headers.get('X-Goog-Resource-ID');
    const resourceState = request.headers.get('X-Goog-Resource-State');
    const resourceUri = request.headers.get('X-Goog-Resource-URI');

    if (!channelId || !resourceId) {
      return NextResponse.json({ error: 'Invalid webhook headers' }, { status: 400 });
    }

    console.log('Google Calendar webhook received:', {
      channelId,
      resourceId,
      resourceState,
      resourceUri
    });

    // Resource states: sync, exists, not_exists
    if (resourceState === 'sync') {
      // Initial sync notification when watch is created
      return NextResponse.json({ message: 'Sync acknowledged' });
    }

    const supabase = await createClient();

    // Get the calendar ID from the resource URI
    // Format: https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
    const calendarIdMatch = resourceUri?.match(/calendars\/([^\/]+)\/events/);
    const calendarId = calendarIdMatch ? decodeURIComponent(calendarIdMatch[1]) : null;

    if (!calendarId) {
      console.error('Could not extract calendar ID from resource URI:', resourceUri);
      return NextResponse.json({ error: 'Invalid resource URI' }, { status: 400 });
    }

    // Find which user this webhook belongs to based on the channel ID
    // We'll store channel IDs in a webhook_subscriptions table
    const { data: subscription } = await supabase
      .from('webhook_subscriptions')
      .select('user_id')
      .eq('channel_id', channelId)
      .eq('calendar_id', calendarId)
      .single();

    if (!subscription) {
      console.error('No subscription found for channel:', channelId);
      return NextResponse.json({ error: 'Unknown subscription' }, { status: 404 });
    }

    // Trigger a sync for this calendar
    await syncCalendarEvents(subscription.user_id, calendarId);

    return NextResponse.json({ message: 'Webhook processed' });
  } catch (error) {
    console.error('Google Calendar webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Handle the sync request validation from Google
export async function GET(request: NextRequest) {
  // Google sends a validation request when setting up the webhook
  const challenge = request.nextUrl.searchParams.get('hub.challenge');
  
  if (challenge) {
    // Respond with the challenge to verify the webhook
    return new Response(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}

async function syncCalendarEvents(userId: string, calendarId: string) {
  try {
    const supabase = await createClient();

    // Get the user's Google Calendar service
    const calendar = await googleAuth.getCalendarService(userId);

    // Get the sync token for incremental sync
    const { data: syncData } = await supabase
      .from('google_calendar_sync_tokens')
      .select('sync_token')
      .eq('user_id', userId)
      .eq('calendar_id', calendarId)
      .single();

    let pageToken: string | undefined = undefined;
    let syncToken = syncData?.sync_token;
    const allEvents: any[] = [];

    // Fetch events with incremental sync
    do {
      const params: any = {
        calendarId,
        pageToken,
        maxResults: 100,
        showDeleted: true,
        singleEvents: true
      };

      if (syncToken) {
        params.syncToken = syncToken;
      } else {
        // First sync - get events from the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        params.timeMin = thirtyDaysAgo.toISOString();
      }

      try {
        const response = await calendar.events.list(params);
        
        if (response.data.items) {
          allEvents.push(...response.data.items);
        }

        pageToken = response.data.nextPageToken || undefined;
        
        // Update sync token for next sync
        if (response.data.nextSyncToken && !pageToken) {
          syncToken = response.data.nextSyncToken;
        }
      } catch (error: any) {
        if (error.code === 410) {
          // Sync token expired, reset and try again
          console.log('Sync token expired, resetting...');
          syncToken = undefined;
          continue;
        }
        throw error;
      }
    } while (pageToken);

    // Process each event
    for (const googleEvent of allEvents) {
      await processGoogleEvent(userId, calendarId, googleEvent, supabase);
    }

    // Save the new sync token
    if (syncToken) {
      await supabase
        .from('google_calendar_sync_tokens')
        .upsert({
          user_id: userId,
          calendar_id: calendarId,
          sync_token: syncToken,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,calendar_id'
        });
    }

    console.log(`Synced ${allEvents.length} events for calendar ${calendarId}`);
  } catch (error) {
    console.error('Error syncing calendar events:', error);
    throw error;
  }
}

async function processGoogleEvent(userId: string, calendarId: string, googleEvent: any, supabase: any) {
  try {
    // Check if event already exists
    const { data: existingEvent } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('google_event_id', googleEvent.id)
      .eq('google_calendar_id', calendarId)
      .single();

    // Convert Google event to our format
    const eventData = {
      title: googleEvent.summary || 'Untitled Event',
      description: googleEvent.description || '',
      google_event_id: googleEvent.id,
      google_calendar_id: calendarId,
      google_etag: googleEvent.etag,
      start_time: googleEvent.start?.dateTime || googleEvent.start?.date,
      end_time: googleEvent.end?.dateTime || googleEvent.end?.date,
      all_day: !googleEvent.start?.dateTime,
      location: googleEvent.location || '',
      google_sync_enabled: true,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      created_by: userId,
      // Map Google status to our schema
      source: 'google_calendar',
      // Try to determine category from event
      category: determineCategory(googleEvent),
      // Extract virtual meeting info
      is_virtual: !!googleEvent.hangoutLink || !!googleEvent.conferenceData,
      zoom_link: googleEvent.hangoutLink || googleEvent.conferenceData?.entryPoints?.[0]?.uri,
      // Reminders
      reminder_minutes: googleEvent.reminders?.overrides?.[0]?.minutes || 
                       (googleEvent.reminders?.useDefault ? 15 : null),
      // Recurring events
      recurring_pattern: googleEvent.recurrence ? 'custom' : null,
      // Attendees - extract email addresses
      attendees: googleEvent.attendees?.map((a: any) => a.email) || []
    };

    if (googleEvent.status === 'cancelled') {
      // Event was deleted in Google
      if (existingEvent) {
        await supabase
          .from('calendar_events')
          .delete()
          .eq('id', existingEvent.id);

        // Log the sync
        await supabase.from('calendar_sync_log').insert({
          event_id: existingEvent.id,
          google_event_id: googleEvent.id,
          google_calendar_id: calendarId,
          sync_direction: 'from_google',
          sync_status: 'success',
          synced_data: { action: 'delete', event_title: existingEvent.title }
        });
      }
    } else if (existingEvent) {
      // Update existing event
      const { error } = await supabase
        .from('calendar_events')
        .update({
          ...eventData,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingEvent.id);

      if (!error) {
        // Log the sync
        await supabase.from('calendar_sync_log').insert({
          event_id: existingEvent.id,
          google_event_id: googleEvent.id,
          google_calendar_id: calendarId,
          sync_direction: 'from_google',
          sync_status: 'success',
          synced_data: { action: 'update', event_title: eventData.title }
        });
      }
    } else {
      // Create new event
      const { data: newEvent, error } = await supabase
        .from('calendar_events')
        .insert({
          ...eventData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (!error && newEvent) {
        // Log the sync
        await supabase.from('calendar_sync_log').insert({
          event_id: newEvent.id,
          google_event_id: googleEvent.id,
          google_calendar_id: calendarId,
          sync_direction: 'from_google',
          sync_status: 'success',
          synced_data: { action: 'create', event_title: eventData.title }
        });
      }
    }
  } catch (error) {
    console.error('Error processing Google event:', error);
    // Log failed sync
    await supabase.from('calendar_sync_log').insert({
      google_event_id: googleEvent.id,
      google_calendar_id: calendarId,
      sync_direction: 'from_google',
      sync_status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      synced_data: { googleEvent }
    });
  }
}

function determineCategory(googleEvent: any): string {
  const title = (googleEvent.summary || '').toLowerCase();
  const description = (googleEvent.description || '').toLowerCase();
  const combined = `${title} ${description}`;

  if (combined.includes('doctor') || combined.includes('medical') || 
      combined.includes('appointment') || combined.includes('health')) {
    return 'medical';
  }
  if (combined.includes('work') || combined.includes('meeting') || 
      combined.includes('conference')) {
    return 'work';
  }
  if (combined.includes('travel') || combined.includes('flight') || 
      combined.includes('trip')) {
    return 'travel';
  }
  if (combined.includes('school') || combined.includes('class') || 
      combined.includes('education')) {
    return 'school';
  }
  if (combined.includes('family')) {
    return 'family';
  }
  
  return 'personal';
}
