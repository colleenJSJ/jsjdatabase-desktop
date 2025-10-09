import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/app/api/_helpers/auth';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const authResult = await requireAdmin(request, { skipCSRF: true });
    
    if ('error' in authResult) {
      return authResult.error;
    }

    const { name, email, password, role } = await request.json();

    if (!name || !email || !password || !role) {
      return jsonError('Missing required fields', { status: 400, code: 'VALIDATION_ERROR' });
    }

    const adminClient = await createServiceClient();
    
    // Create the user in Supabase Auth
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name
      }
    });

    if (authError) {
      return jsonError('Failed to create auth user', {
        status: 400,
        code: 'AUTH_USER_CREATE_FAILED',
        meta: { details: authError.message },
      });
    }

    // Create the user profile
    const { error: profileError } = await adminClient
      .from('users')
      .insert({
        id: authData.user.id,
        name,
        email,
        role,
        user_status: 'active',
        theme_preference: 'dark',
        notification_preferences: {}
      });

    if (profileError) {
      // If profile creation fails, try to delete the auth user
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return jsonError('Failed to create user profile', {
        status: 400,
        code: 'USER_PROFILE_CREATE_FAILED',
        meta: { details: profileError.message },
      });
    }

    const user = {
      id: authData.user.id,
      name,
      email,
      role,
      user_status: 'active' as const,
    };

    return jsonSuccess({ user }, { legacy: { user } });
  } catch (error) {
    console.error('Error adding user:', error);
    return jsonError('Internal server error', { status: 500, code: 'INTERNAL_ERROR' });
  }
}
