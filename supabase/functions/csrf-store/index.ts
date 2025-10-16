// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.3';
import {
  importPKCS8,
  importSPKI,
  jwtVerify
} from 'https://esm.sh/jose@5.2.2';

type DenoSupabaseEnv = typeof globalThis & {
  Deno?: {
    env: {
      get(key: string): string | undefined;
    };
    serve: typeof serve;
  };
};

const denoGlobal = globalThis as DenoSupabaseEnv;
const denoEnv = denoGlobal.Deno?.env;

const SUPABASE_URL =
  denoEnv?.get('EDGE_SUPABASE_URL') ?? denoEnv?.get('SUPABASE_URL') ?? null;
const SERVICE_ROLE_KEY =
  denoEnv?.get('EDGE_SUPABASE_SERVICE_ROLE_KEY') ??
  denoEnv?.get('SUPABASE_SERVICE_ROLE_KEY') ??
  null;
const EDGE_SERVICE_SECRET = denoEnv?.get('EDGE_SERVICE_SECRET') ?? null;
const SUPABASE_JWT_SECRET = denoEnv?.get('SUPABASE_JWT_SECRET') ?? null;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[csrf-store] Missing Supabase configuration');
  throw new Error('Supabase configuration missing for csrf-store function');
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const JSON_HEADERS = {
  'content-type': 'application/json'
};

type CsrfAction = 'get' | 'set' | 'delete' | 'cleanup';

type CsrfRequest = {
  action?: CsrfAction;
  sessionId?: string;
  token?: string;
  expires?: number;
};

type EdgeResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

type CsrfRecord = {
  token: string;
  expires: number;
};

function jsonResponse<T>(payload: EdgeResponse<T>, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    ...init
  });
}

async function verifyAutomationToken(token: string): Promise<boolean> {
  if (!SUPABASE_JWT_SECRET) {
    return false;
  }

  const normalizedSecret = SUPABASE_JWT_SECRET.includes('\\n')
    ? SUPABASE_JWT_SECRET.replace(/\\n/g, '\n')
    : SUPABASE_JWT_SECRET;

  try {
    let key: CryptoKey | Uint8Array;
    if (normalizedSecret.trim().startsWith('-----BEGIN')) {
      const algorithm = normalizedSecret.includes('EC PRIVATE KEY')
        ? 'ES256'
        : 'RS256';
      if (normalizedSecret.includes('PUBLIC KEY')) {
        key = await importSPKI(normalizedSecret, algorithm);
      } else {
        key = await importPKCS8(normalizedSecret, algorithm);
      }
    } else {
      key = new TextEncoder().encode(normalizedSecret);
    }

    const { payload } = await jwtVerify(token, key, {
      issuer: `${SUPABASE_URL.replace(/\\/$/, '')}/auth/v1`
    });

    return payload?.sub === 'service-role' || payload?.role === 'service_role';
  } catch (error) {
    console.warn('[csrf-store] Failed to verify automation token', error);
    return false;
  }
}

async function authorizeRequest(request: Request): Promise<Response | null> {
  if (EDGE_SERVICE_SECRET) {
    const providedSecret = request.headers.get('x-service-secret');
    if (!providedSecret || providedSecret !== EDGE_SERVICE_SECRET) {
      return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice('bearer '.length).trim();
  if (!token) {
    return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // First try to validate as a user session token
  const { data, error } = await adminClient.auth.getUser(token);
  if (!error && data?.user) {
    return null;
  }

  // Then verify as an automation/service token
  const isAutomationToken = await verifyAutomationToken(token);
  if (isAutomationToken) {
    return null;
  }

  return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 401 });
}

async function getToken(sessionId: string): Promise<Response> {
  const { data, error } = await adminClient
    .from('csrf_tokens')
    .select('token, expires')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116') {
      // no rows found
      return jsonResponse<{ token: string; expires: number } | null>(
        { ok: true, data: null }
      );
    }
    console.error('[csrf-store] Failed to fetch token', error);
    return jsonResponse({ ok: false, error: 'Failed to fetch token' }, { status: 500 });
  }

  if (!data) {
    return jsonResponse<{ token: string; expires: number } | null>(
      { ok: true, data: null }
    );
  }

  return jsonResponse<CsrfRecord>({ ok: true, data });
}

async function setToken(sessionId: string, token: string, expires: number): Promise<Response> {
  const { error } = await adminClient
    .from('csrf_tokens')
    .upsert({
      session_id: sessionId,
      token,
      expires,
      created_at: new Date().toISOString()
    });

  if (error) {
    console.error('[csrf-store] Failed to set token', error);
    return jsonResponse({ ok: false, error: 'Failed to persist token' }, { status: 500 });
  }

  return jsonResponse({ ok: true });
}

async function deleteToken(sessionId: string): Promise<Response> {
  const { error } = await adminClient
    .from('csrf_tokens')
    .delete()
    .eq('session_id', sessionId);

  if (error) {
    console.error('[csrf-store] Failed to delete token', error);
    return jsonResponse({ ok: false, error: 'Failed to delete token' }, { status: 500 });
  }

  return jsonResponse({ ok: true });
}

async function cleanupTokens(): Promise<Response> {
  const now = Date.now();
  const { error } = await adminClient
    .from('csrf_tokens')
    .delete()
    .lt('expires', now);

  if (error) {
    console.error('[csrf-store] Failed to cleanup tokens', error);
    return jsonResponse({ ok: false, error: 'Failed to cleanup tokens' }, { status: 500 });
  }

  return jsonResponse({ ok: true });
}

if (!denoGlobal.Deno?.serve) {
  throw new Error('Deno serve is not available in this environment');
}

denoGlobal.Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
  }

  const authError = await authorizeRequest(request);
  if (authError) {
    return authError;
  }

  let payload: CsrfRequest;
  try {
    payload = await request.json();
  } catch (error) {
    console.error('[csrf-store] Invalid request payload', error);
    return jsonResponse({ ok: false, error: 'Invalid JSON payload' }, { status: 400 });
  }

  switch (payload.action) {
    case 'get': {
      if (!payload.sessionId) {
        return jsonResponse({ ok: false, error: 'sessionId is required' }, { status: 400 });
      }
      return await getToken(payload.sessionId);
    }
    case 'set': {
      if (!payload.sessionId || typeof payload.token !== 'string' || typeof payload.expires !== 'number') {
        return jsonResponse(
          { ok: false, error: 'sessionId, token, and expires are required' },
          { status: 400 }
        );
      }
      return await setToken(payload.sessionId, payload.token, payload.expires);
    }
    case 'delete': {
      if (!payload.sessionId) {
        return jsonResponse({ ok: false, error: 'sessionId is required' }, { status: 400 });
      }
      return await deleteToken(payload.sessionId);
    }
    case 'cleanup': {
      return await cleanupTokens();
    }
    default:
      return jsonResponse({ ok: false, error: 'Invalid action' }, { status: 400 });
  }
});
