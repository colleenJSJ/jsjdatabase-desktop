/**
 * CSRF Token Store backed by Supabase Edge Function
 * Provides durable token storage that survives server restarts
 */

import { getEncryptionSessionToken } from '@/lib/encryption/context';
import { createEdgeHeaders } from '@/lib/supabase/jwt';

export interface CSRFTokenData {
  token: string;
  expires: number;
}

type CsrfAction = 'get' | 'set' | 'delete' | 'cleanup';

const PROJECT_REF = (() => {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EDGE_SUPABASE_URL;
  if (!url) return null;
  try {
    const host = new URL(url).host;
    const match = host.match(/^([^.]+)\.supabase\.co$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
})();

const EDGE_SERVICE_SECRET = process.env.EDGE_SERVICE_SECRET || '';

const CSRF_FUNCTION_URL = PROJECT_REF
  ? `https://${PROJECT_REF}.functions.supabase.co/csrf-store`
  : null;

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.EDGE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

let hasLoggedConfigWarning = false;

function canUseEdgeStore(): boolean {
  return Boolean(CSRF_FUNCTION_URL && EDGE_SERVICE_SECRET);
}

async function callCsrfStore<T>(
  action: CsrfAction,
  payload: Record<string, unknown> = {}
): Promise<T | null> {
  if (!CSRF_FUNCTION_URL || !EDGE_SERVICE_SECRET) {
    if (!hasLoggedConfigWarning) {
      console.warn('[CSRF Store] Edge function configuration missing', {
        hasFunctionUrl: Boolean(CSRF_FUNCTION_URL),
        hasServiceSecret: Boolean(EDGE_SERVICE_SECRET)
      });
      hasLoggedConfigWarning = true;
    }
    return null;
  }

  const sessionToken = getEncryptionSessionToken();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-service-secret': EDGE_SERVICE_SECRET
  };

  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
    if (SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
    }
  } else {
    try {
      Object.assign(headers, createEdgeHeaders());
    } catch (error) {
      console.warn('[CSRF Store] Failed to create edge headers', error);
      return null;
    }
  }

  const response = await fetch(CSRF_FUNCTION_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...payload })
  });

  const text = await response.text();

  if (!response.ok) {
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: text };
    }
    console.warn('[CSRF Store] Edge function error', {
      action,
      status: response.status,
      parsed
    });
    return null;
  }

  try {
    const data = JSON.parse(text) as { ok: boolean; data?: T | null };
    if (!data.ok) {
      console.warn('[CSRF Store] Edge function returned failure', { action, data });
      return null;
    }
    return (data.data ?? null) as T | null;
  } catch (error) {
    console.error('[CSRF Store] Failed to parse edge response', error, text);
    return null;
  }
}

/**
 * Supabase-based CSRF token store
 * Uses a simple key-value table for token storage
 */
export class SupabaseCSRFStore {
  private tableName = 'csrf_tokens';
  
  async get(sessionId: string): Promise<CSRFTokenData | null> {
    if (!canUseEdgeStore()) {
      return null;
    }

    try {
      const record = await callCsrfStore<CSRFTokenData>('get', { sessionId });
      if (!record) return null;

      if (Date.now() > record.expires) {
        await this.delete(sessionId).catch(() => {});
        return null;
      }

      return record;
    } catch (error) {
      console.error('[CSRF Store] Get error:', error);
      return null;
    }
  }
  
  async set(sessionId: string, data: CSRFTokenData): Promise<void> {
    if (!canUseEdgeStore()) {
      return;
    }

    try {
      await callCsrfStore('set', {
        sessionId,
        token: data.token,
        expires: data.expires
      });
    } catch (error) {
      console.error('[CSRF Store] Set error:', error);
    }
  }
  
  async delete(sessionId: string): Promise<void> {
    if (!canUseEdgeStore()) {
      return;
    }

    try {
      await callCsrfStore('delete', { sessionId });
    } catch (error) {
      console.error('[CSRF Store] Delete error:', error);
    }
  }
  
  async cleanup(): Promise<void> {
    if (!canUseEdgeStore()) {
      return;
    }

    try {
      await callCsrfStore('cleanup');
    } catch (error) {
      console.error('[CSRF Store] Cleanup error:', error);
    }
  }
}

// Export singleton instance
export const csrfStore = new SupabaseCSRFStore();
