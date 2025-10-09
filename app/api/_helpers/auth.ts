import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { csrfMiddleware } from '@/lib/security/csrf';
import { jsonError } from '@/app/api/_helpers/responses';
import type { Database } from '@/lib/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

type UserRow = Database['public']['Tables']['users']['Row'];

export type RequireUserOptions = {
  enforceCsrf?: boolean;
  role?: 'admin' | 'user';
};

export type RequireUserResult = {
  user: UserRow;
  supabase: SupabaseClient<Database>;
};

/**
 * Unified auth helper that enforces CSRF (by default) and optionally checks role.
 * Returns either the `{ user, supabase }` tuple or a `NextResponse` you should return early.
 */
export async function requireUser(
  request?: NextRequest,
  options: RequireUserOptions = {}
): Promise<RequireUserResult | NextResponse> {
  const { enforceCsrf = true, role = 'user' } = options;

  if (enforceCsrf && request) {
    const csrfResult = await csrfMiddleware(request);
    if (!csrfResult.valid) {
      return jsonError(csrfResult.error || 'Invalid CSRF token', { status: 403 });
    }
  }

  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonError('Unauthorized', { status: 401 });
  }

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (userError || !userRow) {
    return jsonError('User not found', { status: 404 });
  }

  if (role === 'admin' && userRow.role !== 'admin') {
    return jsonError('Forbidden', { status: 403 });
  }

  return { user: userRow, supabase };
}

interface LegacyAuthOptions {
  skipCSRF?: boolean;
}

export async function getAuthenticatedUser(
  request?: NextRequest,
  options: LegacyAuthOptions = {}
) {
  const result = await requireUser(request, {
    enforceCsrf: !options.skipCSRF,
  });

  if (result instanceof NextResponse) {
    return { error: result };
  }

  return result;
}

export async function requireAdmin(
  request?: NextRequest,
  options: LegacyAuthOptions = {}
) {
  const result = await requireUser(request, {
    enforceCsrf: !options.skipCSRF,
    role: 'admin',
  });

  if (result instanceof NextResponse) {
    return { error: result };
  }

  return result;
}
