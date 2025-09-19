import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    console.log('[Admin Users API] Starting GET request');
    const supabase = await createClient();
    
    // Get the current user from Supabase (more secure than getSession)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('[Admin Users API] User:', user ? 'Found' : 'Not found');
    
    if (authError || !user) {
      console.log('[Admin Users API] No user found');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get the current user's data
    const { data: currentUser, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    console.log('[Admin Users API] Current user:', currentUser);

    if (!currentUser || currentUser.role !== 'admin') {
      console.log('[Admin Users API] Unauthorized - user not admin');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at');

    console.log('[Admin Users API] Query result:', { users, error });

    if (error) {
      console.error('[Admin Users API] Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      );
    }

    console.log('[Admin Users API] Returning users:', users?.length || 0);
    // Return users directly - no mapping needed
    return NextResponse.json({ users: users || [] });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}