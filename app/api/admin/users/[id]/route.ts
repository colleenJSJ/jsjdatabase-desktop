import { NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const resolvedParams = await params;
  try {
    const supabase = await createClient();
    
    // Get the current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return jsonError('Not authenticated', { status: 401, code: 'NOT_AUTHENTICATED' });
    }

    // Get the current user's data
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single();
    
    if (!user || user.role !== 'admin') {
      return jsonError('Unauthorized', { status: 401, code: 'ADMIN_REQUIRED' });
    }

    const body = await request.json();
    const { role, user_status, name, email, password } = body;

    // supabase client already created above

    // First, let's check if this user exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('id', resolvedParams.id)
      .single();

    if (checkError) {
      console.error(`[Admin Users API] User ${resolvedParams.id} not found:`, checkError);
      return jsonError('User not found', {
        status: 404,
        code: 'USER_NOT_FOUND',
        meta: { details: checkError.message, userId: resolvedParams.id },
      });
    }

    // Prevent editing other admins (only allow self-edit for admins)
    if (existingUser.role === 'admin' && existingUser.id !== user.id) {
      return jsonError('Cannot edit other admin users', {
        status: 403,
        code: 'ADMIN_EDIT_FORBIDDEN',
      });
    }

    // Build update object
    const updateData: any = {
      role,
      user_status,
      updated_at: new Date().toISOString()
    };

    // Only update name and email if provided
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', resolvedParams.id)
      .select()
      .single();

    if (error) {
      console.error(`[Admin Users API] Error updating user ${resolvedParams.id}:`, {
        error,
        userId: resolvedParams.id,
        attemptedUpdate: { role }
      });
      return jsonError('Failed to update user', {
        status: 500,
        code: 'USER_UPDATE_FAILED',
        meta: { details: error.message, dbCode: error.code, hint: error.hint },
      });
    }

    // Update password if provided (requires admin client)
    if (password) {
      const adminClient = await createServiceClient();
      const { error: authError } = await adminClient.auth.admin.updateUserById(
        resolvedParams.id,
        { password }
      );
      
      if (authError) {
        console.error(`[Admin Users API] Error updating password for user ${resolvedParams.id}:`, authError);
        return jsonError('Failed to update password', {
          status: 500,
          code: 'PASSWORD_UPDATE_FAILED',
          meta: { details: authError.message },
        });
      }
    }

    // Update email in auth if changed
    if (email && email !== existingUser.email) {
      const adminClient = await createServiceClient();
      const { error: authError } = await adminClient.auth.admin.updateUserById(
        resolvedParams.id,
        { email }
      );
      
      if (authError) {
        console.error(`[Admin Users API] Error updating auth email for user ${resolvedParams.id}:`, authError);
        // Revert database changes if auth update fails
        await supabase
          .from('users')
          .update({ email: existingUser.email })
          .eq('id', resolvedParams.id);
        
        return jsonError('Failed to update email', {
          status: 500,
          code: 'EMAIL_UPDATE_FAILED',
          meta: { details: authError.message },
        });
      }
    }

    return jsonSuccess({ user: updatedUser }, { legacy: { user: updatedUser } });
  } catch (error) {
    console.error('[Admin Users API] Unexpected error:', error);
    return jsonError('Internal server error', {
      status: 500,
      code: 'INTERNAL_ERROR',
      meta: { details: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
}
