import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { google } from 'googleapis';
import { googleAuth } from '@/lib/google/auth';
import { getGoogleTokens } from '@/lib/google/token-service';
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

    const { data: tokenInfo, error: tokenError } = await getGoogleTokens({ supabase });
    if (tokenError || !tokenInfo?.tokens) {
      return NextResponse.json(
        {
          error: 'Google account not connected',
          details: 'Please connect your Google account first',
        },
        { status: 401 }
      );
    }

    const oauth2Client = await googleAuth.getAuthenticatedClient(user.id, { supabase });

    // Get user's synced calendars
    const { data: googleCalendars, error: calendarsError } = await supabase
      .from('google_calendars')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_visible', true);

    if (calendarsError || !googleCalendars || googleCalendars.length === 0) {
      return NextResponse.json({ 
        error: 'No calendars to sync',
        details: 'Please sync your Google calendars first'
      }, { status: 400 });
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Set time range for sync (last 30 days to next 90 days)
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 30);
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 90);

    let totalEventsSynced = 0;
    let totalEventsCreated = 0;
    let totalEventsUpdated = 0;
    const errors = [];

    // Sync events from each calendar
    for (const googleCal of googleCalendars) {
      try {
        console.log(`Syncing calendar: ${googleCal.name} (${googleCal.google_calendar_id})`);
        
        // Fetch events from Google
        const response = await calendar.events.list({
          calendarId: googleCal.google_calendar_id,
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 250 // Limit to prevent timeout
        });

        const events = response.data.items || [];
        console.log(`Found ${events.length} events in ${googleCal.name}`);

        // Process each event
        for (const googleEvent of events) {
          let eventData: any = null; // Declare outside try block
          try {
            // Skip cancelled events
            if (googleEvent.status === 'cancelled') {
              continue;
            }

            // Prepare event data for database
            eventData = {
              google_event_id: googleEvent.id,
              google_calendar_id: googleCal.google_calendar_id,
              title: googleEvent.summary || 'Untitled Event',
              description: googleEvent.description || null,
              location: googleEvent.location || null,
              start_time: googleEvent.start?.dateTime || googleEvent.start?.date,
              end_time: googleEvent.end?.dateTime || googleEvent.end?.date,
              all_day: !googleEvent.start?.dateTime,
              status: googleEvent.status === 'cancelled' ? 'cancelled' : 'scheduled',
              source: 'google',
              color: googleCal.background_color || '#4285F4',
              reminder_minutes: googleEvent.reminders?.useDefault 
                ? 10
                : googleEvent.reminders?.overrides?.[0]?.minutes || null,
              is_recurring: !!googleEvent.recurrence,
              recurrence_pattern: googleEvent.recurrence 
                ? { rules: googleEvent.recurrence }
                : null,
              attendees: null, // TODO: Map emails to user IDs when user mapping is available
              meeting_link: googleEvent.hangoutLink || 
                googleEvent.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri || null,
              zoom_link: googleEvent.conferenceData?.entryPoints?.find((e: any) => e.label?.includes('Zoom'))?.uri || null,
              metadata: googleEvent.extendedProperties || null,
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString()
            };

            // Check if event already exists
            const { data: existingEvent } = await supabase
              .from('calendar_events')
              .select('id, updated_at')
              .eq('google_event_id', googleEvent.id)
              .single();

            if (existingEvent) {
              // Update existing event
              const { error: updateError } = await supabase
                .from('calendar_events')
                .update(eventData)
                .eq('id', existingEvent.id);
              
              if (updateError) {
                console.error(`Error updating event ${googleEvent.id}:`, updateError);
                throw updateError;
              }
              totalEventsUpdated++;
            } else {
              // Create new event
              const { error: insertError } = await supabase
                .from('calendar_events')
                .insert(eventData);
              
              if (insertError) {
                console.error(`Error inserting event ${googleEvent.id}:`, insertError);
                console.error('Event data:', eventData);
                throw insertError;
              }
              totalEventsCreated++;
            }
            totalEventsSynced++;
          } catch (eventError: any) {
            console.error(`Error syncing event ${googleEvent.id}:`, eventError);
            console.error('Full error details:', {
              error: eventError,
              message: eventError?.message,
              code: eventError?.code,
              details: eventError?.details,
              eventData: eventData ? {
                title: eventData.title,
                start_time: eventData.start_time,
                end_time: eventData.end_time,
                google_calendar_id: eventData.google_calendar_id
              } : 'eventData was not created',
              googleEvent: {
                id: googleEvent.id,
                summary: googleEvent.summary,
                start: googleEvent.start,
                end: googleEvent.end
              }
            });
            errors.push({
              eventId: googleEvent.id,
              error: eventError instanceof Error ? eventError.message : 'Unknown error',
              details: eventError?.message || eventError?.code || 'No details'
            });
          }
        }

        // Update calendar's last_synced_at
        await supabase
          .from('google_calendars')
          .update({ 
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', googleCal.id);

      } catch (calError) {
        console.error(`Error syncing calendar ${googleCal.google_calendar_id}:`, calError);
        errors.push({
          calendarId: googleCal.google_calendar_id,
          error: calError instanceof Error ? calError.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      totalEventsSynced,
      totalEventsCreated,
      totalEventsUpdated,
      calendarsProcessed: googleCalendars.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error in sync-all:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
