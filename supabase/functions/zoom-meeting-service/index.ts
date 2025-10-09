const JSON_HEADERS = {
  'content-type': 'application/json',
};

type DenoGlobal = typeof globalThis & {
  Deno?: {
    env?: {
      get(key: string): string | undefined;
    };
    serve?: (
      handler: (request: Request) => Response | Promise<Response>,
      options?: Record<string, unknown>,
    ) => Promise<void> | void;
  };
};

const denoGlobal = (globalThis as DenoGlobal).Deno;
const denoEnv = denoGlobal?.env;

const EDGE_SECRET = denoEnv?.get('EDGE_SERVICE_SECRET');
const ZOOM_ACCOUNT_ID = denoEnv?.get('ZOOM_ACCOUNT_ID');
const ZOOM_CLIENT_ID = denoEnv?.get('ZOOM_CLIENT_ID');
const ZOOM_CLIENT_SECRET = denoEnv?.get('ZOOM_CLIENT_SECRET');
const ZOOM_DEFAULT_USER_EMAIL = denoEnv?.get('ZOOM_DEFAULT_USER_EMAIL');

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: JSON_HEADERS,
    ...init,
  });
}

async function getZoomAccessToken(): Promise<string> {
  if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
    throw new Error('Zoom credentials are not configured in the Edge environment');
  }

  const basic = btoa(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`);

  const response = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'account_credentials',
      account_id: ZOOM_ACCOUNT_ID,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom token exchange failed (${response.status}): ${text}`);
  }

  const data = await response.json() as { access_token?: string };
  if (!data.access_token) {
    throw new Error('Zoom token exchange succeeded but access_token was missing in the response');
  }

  return data.access_token;
}

async function createMeeting(payload: Record<string, unknown>) {
  const {
    topic,
    start_time,
    duration,
    timezone,
    host_email,
    settings,
  } = payload;

  if (typeof topic !== 'string' || !topic.trim()) {
    return jsonResponse({ error: 'Missing meeting topic' }, { status: 400 });
  }
  if (typeof start_time !== 'string' || !start_time.trim()) {
    return jsonResponse({ error: 'Missing meeting start_time' }, { status: 400 });
  }
  if (typeof duration !== 'number' && typeof duration !== 'string') {
    return jsonResponse({ error: 'Missing meeting duration' }, { status: 400 });
  }

  const accessToken = await getZoomAccessToken();
  const targetUser = typeof host_email === 'string' && host_email.trim()
    ? host_email
    : ZOOM_DEFAULT_USER_EMAIL || 'me';

  const meetingPayload: Record<string, unknown> = {
    topic,
    type: 2,
    start_time,
    duration: typeof duration === 'number' ? duration : Number(duration),
    ...(typeof timezone === 'string' && timezone ? { timezone } : {}),
    settings: {
      waiting_room: false,
      join_before_host: true,
      approval_type: 2,
      mute_upon_entry: true,
      ...(settings && typeof settings === 'object' ? settings : {}),
    },
  };

  const response = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(targetUser)}/meetings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(meetingPayload),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error('Zoom meeting creation failed', response.status, text);
    return jsonResponse({
      error: 'Zoom API error',
      status: response.status,
      details: text,
    }, { status: response.status });
  }

  try {
    const data = JSON.parse(text);
    return jsonResponse({
      id: data.id,
      join_url: data.join_url,
      start_url: data.start_url,
      password: data.password,
      settings: data.settings,
      raw: data,
    });
  } catch (error) {
    console.error('Failed to parse Zoom create response', error, text);
    return jsonResponse({
      error: 'Failed to parse Zoom response',
      details: text,
    }, { status: 502 });
  }
}

async function updateMeeting(payload: Record<string, unknown>) {
  const { meeting_id, settings, topic, start_time, duration, timezone } = payload;
  if (!meeting_id || (typeof meeting_id !== 'string' && typeof meeting_id !== 'number')) {
    return jsonResponse({ error: 'meeting_id is required for update' }, { status: 400 });
  }

  const accessToken = await getZoomAccessToken();
  const updatePayload: Record<string, unknown> = {};

  if (typeof topic === 'string') updatePayload.topic = topic;
  if (typeof start_time === 'string') updatePayload.start_time = start_time;
  if (typeof duration === 'number' || typeof duration === 'string') {
    updatePayload.duration = typeof duration === 'number' ? duration : Number(duration);
  }
  if (typeof timezone === 'string') updatePayload.timezone = timezone;
  if (settings && typeof settings === 'object') updatePayload.settings = settings;

  const response = await fetch(`https://api.zoom.us/v2/meetings/${meeting_id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(updatePayload),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Zoom meeting update failed', response.status, text);
    return jsonResponse({
      error: 'Zoom API error',
      status: response.status,
      details: text,
    }, { status: response.status });
  }

  return jsonResponse({ ok: true });
}

async function deleteMeeting(payload: Record<string, unknown>) {
  const { meeting_id, occurrence_id } = payload;
  if (!meeting_id || (typeof meeting_id !== 'string' && typeof meeting_id !== 'number')) {
    return jsonResponse({ error: 'meeting_id is required for delete' }, { status: 400 });
  }

  const accessToken = await getZoomAccessToken();
  const url = new URL(`https://api.zoom.us/v2/meetings/${meeting_id}`);
  if (typeof occurrence_id === 'string' && occurrence_id) {
    url.searchParams.set('occurrence_id', occurrence_id);
  }

  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    console.error('Zoom meeting delete failed', response.status, text);
    return jsonResponse({
      error: 'Zoom API error',
      status: response.status,
      details: text,
    }, { status: response.status });
  }

  return jsonResponse({ ok: true });
}

interface ZoomRequestPayload {
  action?: string;
  [key: string]: unknown;
}

function authorizeRequest(request: Request): Response | null {
  if (!EDGE_SECRET) {
    console.warn('EDGE_SERVICE_SECRET is not configured; skipping authorization check.');
    return null;
  }

  const provided = request.headers.get('x-service-secret');
  if (!provided || provided !== EDGE_SECRET) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

if (denoGlobal?.serve) {
  denoGlobal.serve(async (request) => {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method Not Allowed' }, { status: 405 });
    }

    const authError = authorizeRequest(request);
    if (authError) {
      return authError;
    }

    let payload: ZoomRequestPayload;
    try {
      payload = await request.json();
    } catch (error) {
      console.error('Invalid JSON payload', error);
      return jsonResponse({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const action = payload.action;
    try {
      switch (action) {
        case 'create_meeting':
          return await createMeeting(payload);
        case 'update_meeting':
          return await updateMeeting(payload);
        case 'delete_meeting':
          return await deleteMeeting(payload);
        default:
          return jsonResponse({ error: 'Unknown action' }, { status: 400 });
      }
    } catch (error) {
      console.error('zoom-meeting-service error', error);
      return jsonResponse({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      }, { status: 500 });
    }
  });
}

export {};
