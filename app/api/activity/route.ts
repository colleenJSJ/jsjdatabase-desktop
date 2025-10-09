import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';
import { requireAdmin, requireUser } from '@/app/api/_helpers/auth';

// Allowed password-related actions
const ALLOWED_ACTIONS = [
  'password_revealed',
  'password_copied',
  'username_copied',
  'both_copied',
  'password_vault_unlocked',
  'password_export_attempted',
  'password_bulk_operation',
  'password_strength_changed'
];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if ('error' in auth) {
      return auth.error;
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20');

    const serviceClient = await createServiceClient();
    
    const { data: activities, error } = await serviceClient
      .from('activity_logs')
      .select(`
        *,
        user:users!activity_logs_user_id_fkey(id, name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Activity API] Error fetching activity logs:', error);
      return jsonError('Failed to fetch activities', {
        status: 500,
        code: 'ACTIVITY_FETCH_FAILED',
        meta: { details: error.message },
      });
    }

    // Transform the data to include user names
    const transformedActivities = activities?.map(activity => ({
      ...activity,
      user_name: activity.user?.name || 'Unknown User',
    })) || [];

    return jsonSuccess({ activities: transformedActivities }, { legacy: { activities: transformedActivities } });
  } catch (error) {
    console.error('[Activity API] Unexpected error:', error);
    return jsonError('Internal server error', { status: 500, code: 'INTERNAL_ERROR' });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { user } = auth;

    const { action, metadata = {} } = await request.json();

    // Validate action
    if (!action || !ALLOWED_ACTIONS.includes(action)) {
      return jsonError('Invalid action', { status: 400, code: 'INVALID_ACTION' });
    }

    const serviceClient = await createServiceClient();

    // Log the activity
    const { error } = await serviceClient
      .from('activity_logs')
      .insert({
        user_id: user.id,
        action,
        metadata,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('[API/activity] Error logging activity:', error);
      return jsonError('Failed to log activity', {
        status: 500,
        code: 'ACTIVITY_LOG_FAILED',
        meta: { details: error.message },
      });
    }

    // Check for suspicious activity patterns
    if (action === 'password_revealed') {
      // Check if too many passwords revealed in short time
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { count } = await serviceClient
        .from('activity_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('action', 'password_revealed')
        .gte('created_at', fiveMinutesAgo);

      if (count && count > 10) {
        // Log suspicious activity
        await serviceClient
          .from('activity_logs')
          .insert({
            user_id: user.id,
            action: 'suspicious_activity_detected',
            metadata: { 
              reason: 'Excessive password reveals',
              count: count,
              timeframe: '5_minutes'
            },
            created_at: new Date().toISOString()
          });
      }
    }

    return jsonSuccess({ logged: true });
  } catch (error) {
    console.error('[API/activity] Error:', error);
    return jsonError('Internal server error', { status: 500, code: 'INTERNAL_ERROR' });
  }
}
