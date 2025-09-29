import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { google } from 'googleapis';
import { filterAttendeesForGoogleSync } from '@/lib/utils/google-sync-helpers';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { eventId, calendarId } = body;

    if (!eventId || !calendarId) {
      return NextResponse.json({ 
        error: 'Missing required parameters',
        details: 'eventId and calendarId are required'
      }, { status: 400 });
    }

    // Get the event from database
    const { data: event, error: eventError } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ 
        error: 'Event not found',
        details: eventError?.message
      }, { status: 404 });
    }

    // Check Google API credentials
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ 
        error: 'Google Calendar API not configured'
      }, { status: 503 });
    }

    // Get user's Google tokens
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

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    oauth2Client.setCredentials({
      access_token: userTokens.access_token,
      refresh_token: userTokens.refresh_token,
      expiry_date: userTokens.expiry_date
    });

    // Handle token refresh if needed
    if (userTokens.expiry_date && new Date(userTokens.expiry_date) < new Date()) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        
        await supabase
          .from('user_google_tokens')
          .update({
            access_token: credentials.access_token,
            expiry_date: credentials.expiry_date,
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

    // Get attendees and filter for Google sync
    let attendeesEmails: string[] = [];
    
    // Add family member attendees that have sync_to_google enabled
    if (event.attendees && event.attendees.length > 0) {
      const { googleAttendees, internalAttendees } = await filterAttendeesForGoogleSync(event.attendees);
      console.log('[Google Push] Family attendees for Google:', googleAttendees);
      console.log('[Google Push] Internal attendees (tracking only):', internalAttendees);
      attendeesEmails = googleAttendees;
    }
    
    // Add additional attendees from metadata
    if (event.metadata?.additional_attendees) {
      const additionalEmails = event.metadata.additional_attendees;
      console.log('[Google Push] Additional attendees from metadata:', additionalEmails);
      if (Array.isArray(additionalEmails)) {
        // Validate email format more thoroughly
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const validEmails = additionalEmails
          .filter((email: string) => email && typeof email === 'string')
          .map((email: string) => email.trim().toLowerCase())
          .filter((email: string) => emailRegex.test(email));
        console.log('[Google Push] Valid additional emails after validation:', validEmails);
        attendeesEmails = [...attendeesEmails, ...validEmails];
      } else if (typeof additionalEmails === 'string') {
        // Handle case where metadata contains a string instead of array
        console.log('[Google Push] Additional attendees is a string, normalizing...');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const validEmails = additionalEmails
          .split(',')
          .map((email: string) => email.trim().toLowerCase())
          .filter((email: string) => emailRegex.test(email));
        console.log('[Google Push] Valid additional emails from string:', validEmails);
        attendeesEmails = [...attendeesEmails, ...validEmails];
      }
    } else {
      console.log('[Google Push] No additional attendees in metadata');
    }
    
    // Deduplicate and validate final attendee list
    const uniqueAttendees = [...new Set(attendeesEmails.map(email => email.toLowerCase()))];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const finalAttendeesEmails = uniqueAttendees.filter(email => emailRegex.test(email));
    
    console.log('[Google Push] Final deduplicated attendees list for Google Calendar:', finalAttendeesEmails);
    console.log('[Google Push] Total attendees count:', finalAttendeesEmails.length);

    // Create Google Calendar event
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Format attendees properly for Google Calendar API
    const formattedAttendees = finalAttendeesEmails.map(email => ({
      email: email,
      responseStatus: 'needsAction'
    }));
    
    console.log('[Google Push] Formatted attendees for Google:', formattedAttendees);
    
    // Format datetime for Google - keep local wall-clock with explicit timeZone (no UTC conversion)
    // Ensure seconds and strip trailing zone markers only
    const formatDateTimeForGoogle = (dateTimeStr: string): string => {
      if (!dateTimeStr) return dateTimeStr;
      let dt = dateTimeStr.trim();
      // Add seconds if missing (YYYY-MM-DDTHH:mm -> +:ss)
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dt)) {
        dt = dt + ':00';
      }
      // Strip a trailing timezone designator (Z or +hh:mm or +hhmm or -hh:mm or -hhmm)
      dt = dt.replace(/(Z|[+-]\d{2}:?\d{2})$/, '');
      return dt;
    };
    // Extract YYYY-MM-DD directly from the stored string (treat as wall-clock date)
    const toYmd = (dateTimeStr: string): string => {
      if (!dateTimeStr) return '';
      const i = dateTimeStr.indexOf('T');
      return i > 0 ? dateTimeStr.slice(0, i) : dateTimeStr;
    };
    const addDays = (dateStr: string, days: number) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      // Do arithmetic in UTC to avoid DST/local timezone side effects
      const t = Date.UTC(y, (m || 1) - 1, d || 1);
      const t2 = t + days * 24 * 60 * 60 * 1000;
      const dt = new Date(t2);
      const yy = dt.getUTCFullYear();
      const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(dt.getUTCDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    };

    // Determine timezone - prioritize event.timezone column first, then
    // event-specific metadata (e.g., departure airport), then calendar timezone,
    // then default to Eastern
    let timeZone = 'America/New_York';
    
    // Prefer explicit timezone column when set
    if ((event as any).timezone) {
      timeZone = (event as any).timezone;
      console.log('[Google Push] Using event.timezone column:', timeZone);
    }
    // Otherwise, check metadata
    else if (event.metadata?.timezone) {
      timeZone = event.metadata.timezone;
      console.log('[Google Push] Using event-specific timezone from metadata:', timeZone);
    } else {
      // Otherwise, try to use the Google calendar's timezone
      try {
        const { data: cal } = await supabase
          .from('google_calendars')
          .select('time_zone')
          .eq('google_calendar_id', calendarId)
          .single();
        if (cal?.time_zone) {
          timeZone = cal.time_zone;
          console.log('[Google Push] Using Google calendar timezone:', timeZone);
        }
      } catch (tzErr) {
        console.warn('[Google Push] Failed to fetch calendar timezone, using default:', tzErr);
      }
    }
    
    console.log('[Google Push] Final timezone selected:', timeZone);
    console.log('[Google Push] Original start_time:', event.start_time);
    console.log('[Google Push] Original end_time:', event.end_time);
    
    // Build Google event, handling all-day vs timed
    // If we have a meeting link, include it prominently
    const meetingLink = (event as any).meeting_link || (event as any).virtual_link;
    const composedDescription = (() => {
      const parts: string[] = [];
      if (event.description) parts.push(event.description);
      if (meetingLink) parts.push(`Join: ${meetingLink}`);
      return parts.length ? parts.join('\n\n') : undefined;
    })();

    const googleEvent: any = {
      summary: event.title,
      description: composedDescription,
      location: meetingLink || event.location || undefined,
      attendees: formattedAttendees,
      reminders: {
        useDefault: false,
        overrides: event.reminders || [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 }
        ]
      },
      colorId: event.metadata?.google_color_id || undefined,
      guestsCanSeeOtherGuests: true,
      guestsCanModify: false,
      guestsCanInviteOthers: false,
      anyoneCanAddSelf: false,
      status: 'confirmed'
    };
    if (event.all_day) {
      // Use the original wall-clock dates entered by the user.
      // Our DB stores end_time for all-day as the exclusive end at 00:00 on the next day of the last date.
      const startDate = toYmd(event.start_time);
      const endDateExclusive = toYmd(event.end_time) || addDays(startDate, 1);
      googleEvent.start = { date: startDate };
      googleEvent.end = { date: endDateExclusive };
    } else {
      // Support per-side timezones for travel (e.g., flights)
      const startTz = (event.metadata?.start_timezone || event.metadata?.departure_timezone || (event as any).timezone || timeZone) as string;
      const endTz = (event.metadata?.end_timezone || event.metadata?.arrival_timezone || (event as any).timezone || timeZone) as string;
      googleEvent.start = { dateTime: formatDateTimeForGoogle(event.start_time), timeZone: startTz };
      googleEvent.end = { dateTime: formatDateTimeForGoogle(event.end_time), timeZone: endTz };
    }

    // Helper: exponential backoff for Google API rate limits / 5xx
    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
    async function withBackoff<T>(fn: () => Promise<T>, label: string): Promise<T> {
      const maxAttempts = 5;
      let attempt = 0;
      let lastErr: any;
      while (attempt < maxAttempts) {
        try {
          return await fn();
        } catch (err: any) {
          lastErr = err;
          const reason = err?.response?.data?.error?.errors?.[0]?.reason || err?.code || err?.message;
          const status = err?.response?.status;
          const retriable = (
            reason === 'rateLimitExceeded' ||
            reason === 'userRateLimitExceeded' ||
            reason === 'quotaExceeded' ||
            reason === 'backendError' ||
            status === 429 || status === 500 || status === 503
          );
          console.warn(`[Google Push] ${label} attempt ${attempt + 1} failed:`, reason || status || err);
          if (!retriable) throw err;
          const delay = Math.min(30000, 500 * Math.pow(2, attempt)) + Math.floor(Math.random() * 250);
          console.log(`[Google Push] Backing off ${delay}ms before retrying ${label}...`);
          await sleep(delay);
          attempt++;
        }
      }
      throw lastErr;
    }

    // Per-event override: allow the creator to suppress emails
    const userSuppressed = event.metadata?.notify_attendees === false;

    try {
      // Check if event already exists in Google
      if (event.google_event_id) {
        // Update existing event
        console.log('[Google Push] Updating event with attendees:', googleEvent.attendees);
        console.log('[Google Push] sendUpdates parameter:', 'all');
        
        // Default to 'all' unless this event explicitly disables notifications
        const sendUpdatesPolicy = (userSuppressed ? 'none' : (process.env.GOOGLE_SEND_UPDATES || 'all')) as 'all' | 'externalOnly' | 'none';
        const response = await withBackoff(() => calendar.events.update({
          calendarId: calendarId,
          eventId: event.google_event_id,
          requestBody: googleEvent,
          // Prefer notifying external guests only to improve deliverability on some calendars
          sendUpdates: sendUpdatesPolicy,
          sendNotifications: true,  // Explicitly send notifications
          quotaUser: user.id
        }), 'events.update');

        console.log('[Google Push] Google Calendar update response:', {
          eventId: response.data.id,
          attendees: response.data.attendees,
          status: response.status
        });

        console.log(`Updated Google event ${event.google_event_id} for event ${eventId}`);

        // Only send ICS fallback if Google will not notify attendees and user didn't suppress
        const googleWillNotify = formattedAttendees.length > 0 && sendUpdatesPolicy !== 'none';
        if (!googleWillNotify && !userSuppressed) {
          console.log('[Google Push] Sending ICS fallback (update) because Google will not notify attendees');
          await maybeSendIcsInvite({
            supabase,
            event,
            calendarId,
            attendeesEmails: finalAttendeesEmails,
            method: 'REQUEST'
          });
        } else {
          console.log('[Google Push] Skipping ICS fallback (update); Google sent native invites');
        }

        return NextResponse.json({
          success: true,
          action: 'updated',
          googleEventId: response.data.id,
          htmlLink: response.data.htmlLink
        });

      } else {
        // Create new event
        console.log('[Google Push] Creating event with attendees:', googleEvent.attendees);
        console.log('[Google Push] sendUpdates parameter:', 'all');
        
        // Default to 'all' unless this event explicitly disables notifications
        const sendUpdatesPolicyCreate = (userSuppressed ? 'none' : (process.env.GOOGLE_SEND_UPDATES || 'all')) as 'all' | 'externalOnly' | 'none';
        const response = await withBackoff(() => calendar.events.insert({
          calendarId: calendarId,
          requestBody: googleEvent,
          // Send invitations to external guests (Google recommends sendUpdates instead of sendNotifications)
          sendUpdates: sendUpdatesPolicyCreate,
          sendNotifications: true,  // Explicitly send notifications
          quotaUser: user.id
        }), 'events.insert');

        console.log('[Google Push] Google Calendar response:', {
          eventId: response.data.id,
          attendees: response.data.attendees,
          status: response.status,
          htmlLink: response.data.htmlLink
        });

        // Store Google event ID in our database
        await supabase
          .from('calendar_events')
          .update({
            google_event_id: response.data.id,
            google_calendar_id: calendarId,
            google_sync_enabled: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', eventId);

        console.log(`Created Google event ${response.data.id} for event ${eventId}`);
        // Optional nudge (disabled by default to reduce API usage)
        const nudgeEnabled = String(process.env.GOOGLE_NUDGE_AFTER_INSERT || 'false').toLowerCase() === 'true';
        if (nudgeEnabled && formattedAttendees.length > 0) {
          try {
            const nudge = await withBackoff(() => calendar.events.update({
              calendarId: calendarId as string,
              eventId: response.data.id as string,
              requestBody: googleEvent,
              sendUpdates: sendUpdatesPolicyCreate,
              quotaUser: user.id
            }), 'events.update(nudge)');
            console.log('[Google Push] Follow-up update to trigger emails status:', (nudge as any).status);
          } catch (nudgeErr: any) {
            console.warn('[Google Push] Follow-up update failed:', nudgeErr?.response?.data || nudgeErr?.message || nudgeErr);
          }
        }

        // Only send ICS fallback if Google will not notify attendees and user didn't suppress
        const googleWillNotifyCreate = formattedAttendees.length > 0 && sendUpdatesPolicyCreate !== 'none';
        if (!googleWillNotifyCreate && !userSuppressed) {
          console.log('[Google Push] Sending ICS fallback (create) because Google will not notify attendees');
          await maybeSendIcsInvite({
            supabase,
            event: { ...event, google_event_id: response.data.id },
            calendarId,
            attendeesEmails: finalAttendeesEmails,
            method: 'REQUEST'
          });
        } else {
          console.log('[Google Push] Skipping ICS fallback (create); Google sent native invites');
        }

        return NextResponse.json({
          success: true,
          action: 'created',
          googleEventId: response.data.id,
          htmlLink: response.data.htmlLink
        });
      }

    } catch (googleError: any) {
      console.error('Google Calendar API error:', googleError);
      if (googleError?.response?.data) {
        console.error('[Google Push] Google API response details:', googleError.response.data);
        const err = googleError.response.data.error;
        if (err?.errors && Array.isArray(err.errors) && err.errors.length > 0) {
          console.error('[Google Push] First error reason:', err.errors[0].reason);
          console.error('[Google Push] First error message:', err.errors[0].message);
        }
      }
      
      if (googleError.code === 401) {
        return NextResponse.json({ 
          error: 'Google authentication expired',
          details: 'Please reconnect your Google account'
        }, { status: 401 });
      }

      if (googleError.code === 404) {
        // Event not found in Google, clear the google_event_id
        await supabase
          .from('calendar_events')
          .update({
            google_event_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', eventId);

        return NextResponse.json({ 
          error: 'Event not found in Google Calendar',
          details: 'The Google event may have been deleted. Please try syncing again.'
        }, { status: 404 });
      }
      
      return NextResponse.json({ 
        error: 'Failed to sync event to Google',
        details: googleError?.response?.data?.error || googleError?.response?.data || googleError.message || 'Unknown error'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in /api/google/events/push:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Helper to decide and send ICS via Gmail API
async function maybeSendIcsInvite({
  supabase,
  event,
  calendarId,
  attendeesEmails,
  method,
}: any) {
  try {
    const fallback = (process.env.ICS_FALLBACK || 'externalOnly').toLowerCase();
    if (fallback === 'off') return;
    if (!event?.metadata) return;
    const additional = event.metadata.additional_attendees || [];
    if (!additional || additional.length === 0) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Organizer info
    const { data: userRow } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', user.id)
      .single();
    const organizerEmail = userRow?.email || user.email;
    const organizerName = userRow?.full_name || user.user_metadata?.name || undefined;

    // Calendar timezone
    let timeZone = 'America/New_York';
    const { data: cal } = await supabase
      .from('google_calendars')
      .select('time_zone')
      .eq('google_calendar_id', calendarId)
      .single();
    if (cal?.time_zone) timeZone = cal.time_zone;

    // Filter recipients per policy
    let recipients: string[] = Array.isArray(additional) ? additional : [];
    if (fallback === 'externalonly') {
      const orgDomain = organizerEmail.split('@')[1];
      recipients = recipients.filter((e: string) => !e.toLowerCase().endsWith(`@${orgDomain.toLowerCase()}`));
      if (recipients.length === 0) return;
    }

    const uidDomain = process.env.ICS_UID_DOMAIN || organizerEmail.split('@')[1] || 'app.local';
    const uid = `${event.id}@${uidDomain}`;
    const seq = (event.metadata?.ics_sequence || 0) + 1;
    const { generateIcs } = await import('@/lib/google/ics-generator');
    const ics = generateIcs({
      uid,
      sequence: seq,
      method,
      summary: event.title,
      description: event.description || undefined,
      location: event.location || undefined,
      start: event.start_time,
      end: event.end_time,
      timeZone,
      organizerEmail,
      organizerName,
      attendees: recipients,
      useUtc: true,
    });

    const { sendIcsInvite } = await import('@/lib/google/gmail-invite');
    await sendIcsInvite({
      userId: user.id,
      fromEmail: organizerEmail,
      fromName: organizerName,
      to: recipients,
      subject: event.title,
      textBody: `${event.title || 'Event'}\n${event.description || ''}`,
      icsContent: ics,
      method,
    });

    const nextMeta = { ...(event.metadata || {}), ics_sequence: seq, ics_uid: uid };
    await supabase
      .from('calendar_events')
      .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
      .eq('id', event.id);
  } catch (err) {
    console.warn('[ICS] Failed to send ICS invite:', err);
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// DELETE endpoint to remove event from Google Calendar
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');
    const calendarId = searchParams.get('calendarId');

    if (!eventId || !calendarId) {
      return NextResponse.json({ 
        error: 'Missing required parameters',
        details: 'eventId and calendarId are required'
      }, { status: 400 });
    }

    // Get the event to find Google event ID
    const { data: event, error: eventError } = await supabase
      .from('calendar_events')
      .select('google_event_id')
      .eq('id', eventId)
      .single();

    if (eventError || !event || !event.google_event_id) {
      return NextResponse.json({ 
        error: 'Event not found or not synced to Google'
      }, { status: 404 });
    }

    // Get Google credentials and create client
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ 
        error: 'Google Calendar API not configured'
      }, { status: 503 });
    }

    const { data: userTokens } = await supabase
      .from('user_google_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!userTokens) {
      return NextResponse.json({ 
        error: 'Google account not connected'
      }, { status: 401 });
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    oauth2Client.setCredentials({
      access_token: userTokens.access_token,
      refresh_token: userTokens.refresh_token,
      expiry_date: userTokens.expiry_date
    });

    // Delete from Google Calendar
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    try {
      await calendar.events.delete({
        calendarId: calendarId,
        eventId: event.google_event_id
      });

      // Clear Google event ID in our database
      await supabase
        .from('calendar_events')
        .update({
          google_event_id: null,
          google_sync_enabled: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', eventId);

      return NextResponse.json({
        success: true,
        message: 'Event removed from Google Calendar'
      });

    } catch (googleError: any) {
      const statusCode = googleError?.code ?? googleError?.response?.status;
      if (statusCode === 404 || statusCode === 410) {
        // Event already deleted from Google, just clear our reference
        await supabase
          .from('calendar_events')
          .update({
            google_event_id: null,
            google_sync_enabled: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', eventId);

        return NextResponse.json({
          success: true,
          message: 'Event reference cleared (already deleted from Google)'
        });
      }

      throw googleError;
    }

  } catch (error) {
    console.error('Error in DELETE /api/google/events/push:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
