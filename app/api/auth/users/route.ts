import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    console.log('[Auth Users API] Starting GET request');
    
    const supabase = await createClient();
    console.log('[Auth Users API] Supabase client created');
    
    // Get current user from Supabase auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('[Auth Users API] Auth check result:', { userId: user?.id, error: authError?.message });
    
    if (authError || !user) {
      console.error('[Auth Users API] No authenticated user:', authError?.message);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all users (name column already exists in DB)
    console.log('[Auth Users API] Fetching users from database');
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, role, is_active')
      .order('name');
    
    console.log('[Auth Users API] Database query result:', { userCount: users?.length, error: error?.message });

    if (error) {

      return NextResponse.json(
        { error: 'Failed to fetch users', details: error.message },
        { status: 500 }
      );
    }
    
    console.log('[Auth Users API] Returning', users?.length, 'users');
    
    return NextResponse.json({ users: users || [] });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}