import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { google } from 'googleapis';
import { googleAuth } from '@/lib/google/auth';
import { enforceCSRF } from '@/lib/security/csrf';

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const supabase = await createClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { calendarId, timeMin, timeMax, syncToken } = body;

    if (!calendarId) {
      return NextResponse.json({ 
        error: 'Missing required parameter',
        details: 'calendarId is required'
      }, { status: 400 });
    }

    // Ensure Google credentials exist in the hosted environment
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'Google Calendar API not configured' },
        { status: 503 }
      );
    }

    const oauth2Client = await googleAuth.getAuthenticatedClient(user.id, { supabase });

    // Fetch events from Google Calendar
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    try {
      const params: any = {
        calendarId: calendarId,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250
      };

      // Add time range if provided
      if (timeMin) params.timeMin = timeMin;
      if (timeMax) params.timeMax = timeMax;
      
      // Use sync token for incremental sync if provided
      if (syncToken) {
        params.syncToken = syncToken;
        // Remove time parameters when using syncToken
        delete params.timeMin;
        delete params.timeMax;
      } else if (!timeMin) {
        // Default to events from last month to next year if no time range specified
        params.timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        params.timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      }

      const response = await calendar.events.list(params);
      const events = response.data.items || [];
      const nextSyncToken = response.data.nextSyncToken;

      console.log(`Fetched ${events.length} events from Google Calendar ${calendarId}`);

      // Get existing Google event IDs in our database
      const googleEventIds = events.map(e => e.id).filter(Boolean);
      const { data: existingEvents } = await supabase
        .from('calendar_events')
        .select('id, google_event_id, updated_at')
        .in('google_event_id', googleEventIds);

      const existingEventMap = new Map(
        (existingEvents || []).map(e => [e.google_event_id, e])
      );

      // Process each Google event
      const results = {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: []
      };

      for (const googleEvent of events) {
        try {
          // Skip cancelled events
          if (googleEvent.status === 'cancelled') {
            // If we have this event, mark it as deleted
            const existingEvent = existingEventMap.get(googleEvent.id!);
            if (existingEvent) {
              await supabase
                .from('calendar_events')
                .delete()
                .eq('id', existingEvent.id);
              results.updated++;
            }
            continue;
          }

          // Skip events without required fields
          if (!googleEvent.summary || !googleEvent.start || !googleEvent.end) {
            results.skipped++;
            continue;
          }

          // Determine if this is an all-day event
          const isAllDay = !!(googleEvent.start.date && !googleEvent.start.dateTime);
          
          // Get start and end times
          const startTime = isAllDay 
            ? new Date(googleEvent.start.date!).toISOString()
            : new Date(googleEvent.start.dateTime!).toISOString();
            
          const endTime = isAllDay
            ? new Date(googleEvent.end.date!).toISOString()
            : new Date(googleEvent.end.dateTime!).toISOString();

          // Build event data
          const eventData = {
            title: googleEvent.summary,
            description: googleEvent.description || null,
            location: googleEvent.location || null,
            start_time: startTime,
            end_time: endTime,
            all_day: isAllDay,
            google_event_id: googleEvent.id!,
            google_calendar_id: calendarId,
            google_sync_enabled: true,
            category: 'other', // Default category, can be updated based on metadata
            metadata: {
              google_color_id: googleEvent.colorId,
              google_organizer: googleEvent.organizer?.email,
              google_attendees: googleEvent.attendees?.map(a => ({
                email: a.email,
                displayName: a.displayName,
                responseStatus: a.responseStatus,
                optional: a.optional
              })),
              google_created: googleEvent.created,
              google_updated: googleEvent.updated,
              google_status: googleEvent.status,
              google_html_link: googleEvent.htmlLink
            },
            updated_at: new Date().toISOString()
          };

          const existingEvent = existingEventMap.get(googleEvent.id!);
          
          if (existingEvent) {
            // Update existing event if Google event is newer
            const googleUpdated = new Date(googleEvent.updated || 0);
            const localUpdated = new Date(existingEvent.updated_at);
            
            if (googleUpdated > localUpdated) {
              const { error } = await supabase
                .from('calendar_events')
                .update(eventData)
                .eq('id', existingEvent.id);
                
              if (error) {
                (results.errors as any[]).push(`Failed to update event ${googleEvent.summary}: ${error.message}`);
              } else {
                results.updated++;
              }
            } else {
              results.skipped++;
            }
          } else {
            // Create new event
            const { error } = await supabase
              .from('calendar_events')
              .insert({
                ...eventData,
                created_by: user.id,
                created_at: new Date().toISOString()
              });
              
            if (error) {
              (results.errors as any[]).push(`Failed to create event ${googleEvent.summary}: ${error.message}`);
            } else {
              results.created++;
            }
          }
        } catch (eventError) {
          console.error(`Error processing Google event ${googleEvent.id}:`, eventError);
          (results.errors as any[]).push(`Error processing event ${googleEvent.summary}`);
        }
      }

      // Store sync token for next incremental sync
      if (nextSyncToken) {
        await supabase
          .from('google_calendars')
          .update({
            sync_token: nextSyncToken,
            last_synced_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('google_calendar_id', calendarId);
      }

      return NextResponse.json({
        success: true,
        results,
        nextSyncToken,
        totalEvents: events.length
      });

    } catch (googleError: any) {
      console.error('Google Calendar API error:', googleError);
      
      if (googleError.code === 401) {
        return NextResponse.json({ 
          error: 'Google authentication expired',
          details: 'Please reconnect your Google account'
        }, { status: 401 });
      }

      if (googleError.code === 410 && syncToken) {
        // Sync token expired, client should retry without token
        return NextResponse.json({ 
          error: 'Sync token expired',
          details: 'Please perform a full sync',
          requireFullSync: true
        }, { status: 410 });
      }
      
      return NextResponse.json({ 
        error: 'Failed to fetch events from Google',
        details: googleError.message || 'Unknown error'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in /api/google/events/pull:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
