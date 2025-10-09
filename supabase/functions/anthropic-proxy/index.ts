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
const ANTHROPIC_API_KEY = denoEnv?.get('ANTHROPIC_API_KEY');
const ANTHROPIC_VERSION = denoEnv?.get('ANTHROPIC_VERSION') || '2023-06-01';
const ANTHROPIC_BETA = denoEnv?.get('ANTHROPIC_BETA');

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: JSON_HEADERS,
    ...init,
  });
}

function authorizeRequest(request: Request): Response | null {
  if (!EDGE_SECRET) {
    console.warn('[anthropic-proxy] EDGE_SERVICE_SECRET is not configured; skipping check');
    return null;
  }
  const provided = request.headers.get('x-service-secret');
  if (!provided || provided !== EDGE_SECRET) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

type ProxyAction = 'messages.create';

interface ProxyPayload {
  action?: ProxyAction;
  payload?: Record<string, unknown>;
}

async function forwardMessagesCreate(payload: Record<string, unknown>) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key is not configured in the Edge environment');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      ...(ANTHROPIC_BETA ? { 'anthropic-beta': ANTHROPIC_BETA } : {}),
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error('[anthropic-proxy] Anthropic API error', response.status, text);
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep raw text
    }
    return jsonResponse({
      error: 'Anthropic API error',
      status: response.status,
      details: parsed,
    }, { status: response.status });
  }

  try {
    return jsonResponse(JSON.parse(text));
  } catch (error) {
    console.error('[anthropic-proxy] Failed to parse Anthropic response', error, text);
    return jsonResponse({
      error: 'Failed to parse Anthropic response',
      details: text,
    }, { status: 502 });
  }
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

    let payload: ProxyPayload;
    try {
      payload = await request.json();
    } catch (error) {
      console.error('[anthropic-proxy] Invalid JSON payload', error);
      return jsonResponse({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const action = payload.action ?? 'messages.create';
    const actionPayload = payload.payload;

    if (!actionPayload || typeof actionPayload !== 'object') {
      return jsonResponse({ error: 'payload object is required' }, { status: 400 });
    }

    try {
      switch (action) {
        case 'messages.create':
          return await forwardMessagesCreate(actionPayload);
        default:
          return jsonResponse({ error: 'Unsupported action' }, { status: 400 });
      }
    } catch (error) {
      console.error('[anthropic-proxy] internal error', error);
      return jsonResponse({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      }, { status: 500 });
    }
  });
}

export {};
