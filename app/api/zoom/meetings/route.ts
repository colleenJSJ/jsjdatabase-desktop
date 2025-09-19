import { NextRequest, NextResponse } from 'next/server';

async function getZoomAccessToken() {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Zoom credentials missing. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET');
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const url = `https://zoom.us/oauth/token`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'account_credentials',
      account_id: accountId,
    }).toString()
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to get Zoom token: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  return data.access_token as string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      topic,
      start_time, // ISO local like 2025-09-27T09:00:00
      duration, // minutes
      timezone, // optional IANA tz; Zoom will use host default if omitted
      host_email, // optional override; must exist in your Zoom account
      settings,
    } = body || {};

    if (!topic || !start_time || !duration) {
      return NextResponse.json(
        { error: 'Missing required fields: topic, start_time, duration' },
        { status: 400 }
      );
    }

    const accessToken = await getZoomAccessToken();

    // Choose target user: provided host_email, or default from env, or "me"
    const targetUser = host_email || process.env.ZOOM_DEFAULT_USER_EMAIL || 'me';

    // Zoom expects start_time in ISO 8601; if no timezone provided, it assumes the host timezone
    const payload = {
      topic,
      type: 2, // scheduled meeting
      start_time,
      duration: Number(duration),
      ...(timezone ? { timezone } : {}),
      settings: {
        waiting_room: false,
        join_before_host: true,
        approval_type: 2, // no registration
        mute_upon_entry: true,
        ...((settings as object) || {}),
      },
    };

    const resp = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(targetUser)}/meetings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: 'Zoom API error', details: text },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    return NextResponse.json({
      id: data.id,
      join_url: data.join_url,
      start_url: data.start_url,
      password: data.password,
      settings: data.settings,
    });
  } catch (error) {
    console.error('Error creating Zoom meeting:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
