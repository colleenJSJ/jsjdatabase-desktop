import { SupabaseClient } from '@supabase/supabase-js';

type TokenServiceAction = 'get' | 'upsert' | 'delete';

type TokenServiceResponse<T = unknown> = {
  data: T | null;
  error: Error | null;
};

type GoogleTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  scope?: string | null;
  [key: string]: unknown;
};

type GoogleTokenPayload = {
  tokens?: GoogleTokens;
  ok?: boolean;
  [key: string]: unknown;
};

type UpsertPayload = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope?: string | null;
};

type ServiceOptions = {
  userId: string;
  payload?: Partial<UpsertPayload>;
};

type UserOptions = {
  supabase: SupabaseClient;
  payload?: Partial<UpsertPayload>;
};

type ServiceInvocationOptions = ServiceOptions & {
  action: TokenServiceAction;
};

type UserInvocationOptions = UserOptions & {
  action: TokenServiceAction;
};

const PROJECT_REF = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EDGE_SUPABASE_URL;
  if (!url) return null;
  try {
    const host = new URL(url).host;
    const match = host.match(/^([^.]+)\.supabase\.co$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
})();

const FUNCTION_URL = PROJECT_REF
  ? `https://${PROJECT_REF}.functions.supabase.co/google-token-service`
  : null;

const SERVICE_SECRET = process.env.EDGE_SERVICE_SECRET;

async function invokeAsService({ action, userId, payload }: ServiceInvocationOptions): Promise<GoogleTokenPayload> {
  if (!FUNCTION_URL) {
    throw new Error('Google token service URL is not configured');
  }
  if (!SERVICE_SECRET) {
    throw new Error('EDGE_SERVICE_SECRET is not configured in this environment');
  }

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-service-secret': SERVICE_SECRET,
    },
    body: JSON.stringify({ action, user_id: userId, ...(payload ?? {}) }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`google-token-service error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  if (!json || typeof json !== 'object') {
    throw new Error('google-token-service returned an invalid response');
  }
  return json as GoogleTokenPayload;
}

async function invokeAsUser({ supabase, action, payload }: UserInvocationOptions): Promise<GoogleTokenPayload> {
  const { data, error } = await supabase.functions.invoke('google-token-service', {
    body: { action, ...(payload ?? {}) },
  });

  if (error) {
    throw error;
  }

  if (!data || typeof data !== 'object') {
    return {};
  }

  return data as GoogleTokenPayload;
}

export async function getGoogleTokens(options: { supabase?: SupabaseClient; userId?: string }): Promise<TokenServiceResponse<GoogleTokenPayload>> {
  try {
    if (options.supabase) {
      const data = await invokeAsUser({ supabase: options.supabase, action: 'get' });
      return { data, error: null };
    }

    if (options.userId) {
      const data = await invokeAsService({ action: 'get', userId: options.userId });
      return { data, error: null };
    }

    throw new Error('Either supabase client or userId must be provided');
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unknown error') };
  }
}

export async function upsertGoogleTokens(options: {
  supabase?: SupabaseClient;
  userId?: string;
  payload: UpsertPayload;
}): Promise<TokenServiceResponse<{ ok: boolean }>> {
  try {
    if (options.supabase) {
      await invokeAsUser({ supabase: options.supabase, action: 'upsert', payload: options.payload });
      return { data: { ok: true }, error: null };
    }

    if (options.userId) {
      await invokeAsService({ action: 'upsert', userId: options.userId, payload: options.payload });
      return { data: { ok: true }, error: null };
    }

    throw new Error('Either supabase client or userId must be provided');
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unknown error') };
  }
}

export async function deleteGoogleTokens(options: {
  supabase?: SupabaseClient;
  userId?: string;
}): Promise<TokenServiceResponse<{ ok: boolean }>> {
  try {
    if (options.supabase) {
      await invokeAsUser({ supabase: options.supabase, action: 'delete' });
      return { data: { ok: true }, error: null };
    }

    if (options.userId) {
      await invokeAsService({ action: 'delete', userId: options.userId });
      return { data: { ok: true }, error: null };
    }

    throw new Error('Either supabase client or userId must be provided');
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unknown error') };
  }
}
