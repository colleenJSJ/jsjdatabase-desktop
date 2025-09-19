import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';

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
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user details to check role
    const { data: userDetails } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    // Only admins can view activity logs
    if (!userDetails || userDetails.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

      return NextResponse.json(
        { error: 'Failed to fetch activities' },
        { status: 500 }
      );
    }

    // Transform the data to include user names
    const transformedActivities = activities?.map(activity => ({
      ...activity,
      user_name: activity.user?.name || 'Unknown User',
    })) || [];

    return NextResponse.json({ activities: transformedActivities });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, metadata = {} } = await request.json();

    // Validate action
    if (!action || !ALLOWED_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: 'Failed to log activity' },
        { status: 500 }
      );
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API/activity] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}