import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { googleAuth } from '@/lib/google/auth';
import { google } from 'googleapis';

// This endpoint should be called by a cron job every 5-10 minutes
export async function POST(request: NextRequest) {
  try {
    // Verify this is an internal request (you might want to add a secret key check)
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get all users with Google Calendar permissions
    const { data: permissions, error: permError } = await supabase
      .from('calendar_permissions')
      .select('user_id, google_calendar_id')
      .eq('can_read', true);

    if (permError || !permissions) {
      console.error('Error fetching permissions:', permError);
      return NextResponse.json({ error: 'Failed to fetch permissions' }, { status: 500 });
    }

    // Group calendars by user
    const userCalendars = permissions.reduce((acc: any, perm) => {
      if (!acc[perm.user_id]) {
        acc[perm.user_id] = [];
      }
      acc[perm.user_id].push(perm.google_calendar_id);
      return acc;
    }, {});

    const syncResults = [];

    // Sync calendars for each user
    for (const [userId, calendarIds] of Object.entries(userCalendars)) {
      try {
        // Check if user has valid tokens
        const hasValidTokens = await googleAuth.hasValidTokens(userId);
        if (!hasValidTokens) {
          console.log(`Skipping sync for user ${userId} - no valid tokens`);
          continue;
        }

        // Get calendar service
        const calendar = await googleAuth.getCalendarService(userId);

        // Sync each calendar
        for (const calendarId of calendarIds as string[]) {
          try {
            await syncCalendarEvents(userId, calendarId, calendar, supabase);
            syncResults.push({
              userId,
              calendarId,
              status: 'success'
            });
          } catch (error) {
            console.error(`Error syncing calendar ${calendarId} for user ${userId}:`, error);
            syncResults.push({
              userId,
              calendarId,
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      } catch (error) {
        console.error(`Error processing user ${userId}:`, error);
      }
    }

    // Clean up old sync logs (keep last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    await supabase
      .from('calendar_sync_log')
      .delete()
      .lt('synced_at', sevenDaysAgo.toISOString());

    return NextResponse.json({
      message: 'Sync completed',
      results: syncResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Calendar polling sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync calendars' },
      { status: 500 }
    );
  }
}

async function syncCalendarEvents(
  userId: string, 
  calendarId: string, 
  calendar: any,
  supabase: any
) {
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
      
      // And future events for the next 365 days
      const oneYearFromNow = new Date();
      oneYearFromNow.setDate(oneYearFromNow.getDate() + 365);
      params.timeMax = oneYearFromNow.toISOString();
    }

    try {
      const response = await calendar.events.list(params);
      
      if (response.data.items) {
        allEvents.push(...response.data.items);
      }

      pageToken = response.data.nextPageToken;
      
      // Update sync token for next sync
      if (response.data.nextSyncToken && !pageToken) {
        syncToken = response.data.nextSyncToken;
      }
    } catch (error: any) {
      if (error.code === 410) {
        // Sync token expired, reset and try again
        console.log('Sync token expired for calendar', calendarId, 'resetting...');
        syncToken = undefined;
        
        // Delete the expired token
        await supabase
          .from('google_calendar_sync_tokens')
          .delete()
          .eq('user_id', userId)
          .eq('calendar_id', calendarId);
        
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
}

async function processGoogleEvent(
  userId: string, 
  calendarId: string, 
  googleEvent: any, 
  supabase: any
) {
  try {
    // Check if event already exists
    const { data: existingEvent } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('google_event_id', googleEvent.id)
      .eq('google_calendar_id', calendarId)
      .single();

    // Skip if event hasn't changed (compare ETags)
    if (existingEvent && existingEvent.google_etag === googleEvent.etag) {
      return;
    }

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
      source: 'google_calendar',
      category: determineCategory(googleEvent),
      is_virtual: !!googleEvent.hangoutLink || !!googleEvent.conferenceData,
      zoom_link: googleEvent.hangoutLink || 
                 googleEvent.conferenceData?.entryPoints?.[0]?.uri || 
                 extractZoomLink(googleEvent.description),
      reminder_minutes: googleEvent.reminders?.overrides?.[0]?.minutes || 
                       (googleEvent.reminders?.useDefault ? 15 : null),
      recurring_pattern: googleEvent.recurrence ? 'custom' : null,
      attendees: extractAttendeeIds(googleEvent.attendees, supabase)
    };

    if (googleEvent.status === 'cancelled') {
      // Event was deleted in Google
      if (existingEvent) {
        await supabase
          .from('calendar_events')
          .delete()
          .eq('id', existingEvent.id);

        await logSync(supabase, {
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
        await logSync(supabase, {
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
        await logSync(supabase, {
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
    await logSync(supabase, {
      google_event_id: googleEvent.id,
      google_calendar_id: calendarId,
      sync_direction: 'from_google',
      sync_status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      synced_data: { googleEvent }
    });
  }
}

async function logSync(supabase: any, logData: any) {
  try {
    await supabase.from('calendar_sync_log').insert(logData);
  } catch (error) {
    console.error('Error logging sync:', error);
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

function extractZoomLink(description?: string): string | null {
  if (!description) return null;
  
  // Look for Zoom links in the description
  const zoomRegex = /https?:\/\/[^\s]*zoom\.us\/[^\s]*/i;
  const match = description.match(zoomRegex);
  return match ? match[0] : null;
}

async function extractAttendeeIds(attendees: any[], supabase: any): Promise<string[]> {
  if (!attendees || attendees.length === 0) return [];
  
  const emails = attendees
    .filter(a => a.email && !a.resource) // Exclude resource attendees (rooms, etc.)
    .map(a => a.email);
  
  if (emails.length === 0) return [];
  
  // Try to match emails to user IDs
  const { data: users } = await supabase
    .from('users')
    .select('id, email')
    .in('email', emails);
  
  return users?.map((u: any) => u.id) || [];
}