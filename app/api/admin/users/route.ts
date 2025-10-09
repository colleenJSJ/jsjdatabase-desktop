import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get the current user from Supabase (more secure than getSession)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return jsonError('Not authenticated', { status: 401, code: 'NOT_AUTHENTICATED' });
    }

    // Get the current user's data
    const { data: currentUser, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!currentUser || currentUser.role !== 'admin') {
      return jsonError('Unauthorized', { status: 401, code: 'ADMIN_REQUIRED' });
    }
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at');

    if (error) {
      console.error('[Admin Users API] Database error:', error);
      return jsonError('Failed to fetch users', {
        status: 500,
        code: 'USERS_FETCH_FAILED',
        meta: { details: error.message },
      });
    }

    return jsonSuccess({ users: users || [] }, { legacy: { users: users || [] } });
  } catch (error) {
    console.error('[Admin Users API] Unexpected error:', error);
    return jsonError('Internal server error', { status: 500, code: 'INTERNAL_ERROR' });
  }
}
