import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCSRFTokenFromRequest } from '@/lib/security/csrf';
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
    const { eventId, action } = body;

    if (!eventId || !action) {
      return NextResponse.json({ 
        error: 'Missing required parameters',
        details: 'eventId and action are required'
      }, { status: 400 });
    }

    // Get the event
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
    
    console.log('[Sync Google] Event retrieved for sync:', {
      id: event.id,
      title: event.title,
      metadata: event.metadata,
      additional_attendees: event.metadata?.additional_attendees
    });

    // Check if event has Google Calendar ID
    if (!event.google_calendar_id) {
      return NextResponse.json({ 
        error: 'Event not configured for Google sync',
        details: 'No Google Calendar ID specified'
      }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const csrfToken = await resolveCSRFTokenFromRequest(request);
    const authHeader = request.headers.get('Authorization');
    const cookieHeader = request.headers.get('Cookie');

    const buildInternalHeaders = (initial?: Record<string, string>) => {
      const headers: Record<string, string> = {
        'x-internal-request': 'calendar-sync',
        ...(initial || {})
      };

      if (authHeader) {
        headers.Authorization = authHeader;
      }

      if (cookieHeader) {
        headers.Cookie = cookieHeader;
      }

      if (csrfToken) {
        headers['x-csrf-token'] = csrfToken;
      }

      return headers;
    };

    switch (action) {
      case 'create':
      case 'update':
        // Push event to Google Calendar
        const pushResponse = await fetch(`${baseUrl}/api/google/events/push`, {
          method: 'POST',
          headers: buildInternalHeaders({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            eventId: event.id,
            calendarId: event.google_calendar_id
          })
        });

        if (!pushResponse.ok) {
          const errorData = await pushResponse.json();
          return NextResponse.json({ 
            error: 'Failed to sync with Google',
            details: errorData.details || errorData.error
          }, { status: pushResponse.status });
        }

        const pushData = await pushResponse.json();
        
        // Update event with Google event ID if created
        if (pushData.googleEventId && !event.google_event_id) {
          await supabase
            .from('calendar_events')
            .update({
              google_event_id: pushData.googleEventId,
              updated_at: new Date().toISOString()
            })
            .eq('id', eventId);
        }

        return NextResponse.json({
          success: true,
          action: pushData.action,
          googleEventId: pushData.googleEventId,
          htmlLink: pushData.htmlLink
        });

      case 'delete':
        // Remove event from Google Calendar
        const deleteResponse = await fetch(
          `${baseUrl}/api/google/events/push?eventId=${eventId}&calendarId=${event.google_calendar_id}`,
          {
            method: 'DELETE',
            headers: buildInternalHeaders()
          }
        );

        if (!deleteResponse.ok) {
          const errorData = await deleteResponse.json();
          return NextResponse.json({ 
            error: 'Failed to delete from Google',
            details: errorData.details || errorData.error
          }, { status: deleteResponse.status });
        }

        return NextResponse.json({
          success: true,
          message: 'Event removed from Google Calendar'
        });

      default:
        return NextResponse.json({ 
          error: 'Invalid action',
          details: 'Action must be create, update, or delete'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Error in /api/calendar-events/sync/google:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
