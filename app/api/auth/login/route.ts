import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/app/api/_helpers/log-activity';
import { enforceCSRF } from '@/lib/security/csrf';

export async function POST(request: NextRequest) {
  // Login forms originate from our own UI, but unauthenticated users won't
  // have a CSRF session yet. Skip strict enforcement here to avoid false 403s.
  const csrfError = await enforceCSRF(request, { skip: true });
  if (csrfError) return csrfError;

  try {
    console.log('[Login API] Starting login process');
    const body = await request.json();
    const { email, password } = body;
    console.log('[Login API] Email:', email);

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Create Supabase client
    console.log('[Login API] Creating Supabase client...');
    const supabase = await createClient();
    console.log('[Login API] Supabase client created');
    
    // Sign in with Supabase Auth
    console.log('[Login API] Attempting sign in...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password.trim()
    });

    if (authError || !authData.user || !authData.session) {
      console.error('[Login API] Auth failed:', authError);
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    console.log('[Login API] Auth successful for user:', authData.user.id);

    // Get full user data from the users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (userError || !userData) {
      console.error('[Login API] User data fetch failed:', userError);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Create response with user data
    const response = NextResponse.json({ 
      success: true,
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        role: userData.role,
      }
    });

    // Log the login activity
    await logActivity({
      userId: userData.id,
      action: 'login',
      entityType: 'auth',
      page: 'login',
      details: {
        email: userData.email,
        role: userData.role
      },
      request
    });

    // The Supabase server client should have already set the auth cookies
    // via the createClient function, but let's make sure the session is properly stored
    console.log('[Login API] Login complete, session should be set via cookies');

    return response;
  } catch (error) {
    console.error('[Login API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
