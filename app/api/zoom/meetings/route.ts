import { NextRequest, NextResponse } from 'next/server';
import { getZoomMeetingService, ZoomServiceError } from '@/lib/zoom/zoom-service';
import { enforceCSRF } from '@/lib/security/csrf';

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const body = await request.json();
    const {
      topic,
      start_time,
      duration,
      timezone,
      host_email,
      settings,
    } = body || {};

    if (!topic || !start_time || (duration === undefined || duration === null)) {
      return NextResponse.json(
        { error: 'Missing required fields: topic, start_time, duration' },
        { status: 400 }
      );
    }

    const durationMinutes = Number(duration);
    if (Number.isNaN(durationMinutes) || durationMinutes <= 0) {
      return NextResponse.json(
        { error: 'Duration must be a positive number' },
        { status: 400 }
      );
    }

    const zoomService = getZoomMeetingService();
    const meeting = await zoomService.createMeeting({
      topic,
      start_time,
      duration: durationMinutes,
      ...(timezone ? { timezone } : {}),
      ...(host_email ? { host_email } : {}),
      ...(settings ? { settings } : {}),
    });

    return NextResponse.json({
      id: meeting.id,
      join_url: meeting.join_url,
      start_url: meeting.start_url,
      password: meeting.password,
      settings: meeting.settings,
    });
  } catch (error) {
    if (error instanceof ZoomServiceError) {
      console.error('Zoom service error', error.details);
      const status = error.status || 502;
      return NextResponse.json(
        { error: 'Zoom API error', details: error.details },
        { status }
      );
    }

    console.error('Error creating Zoom meeting:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
