import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  console.log('[Test Auth] Request received');
  
  try {
    const supabase = await createClient();
    
    // Get the session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    console.log('[Test Auth] Session check:', {
      hasSession: !!session,
      sessionError: sessionError?.message,
      userId: session?.user?.id,
      userEmail: session?.user?.email
    });
    
    if (!session) {
      return NextResponse.json(
        { 
          authenticated: false,
          message: 'No session found',
          error: sessionError?.message 
        },
        { status: 401 }
      );
    }
    
    // Also check if we can get the user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    return NextResponse.json({
      authenticated: true,
      session: {
        userId: session.user.id,
        email: session.user.email,
        expiresAt: session.expires_at
      },
      user: user ? {
        id: user.id,
        email: user.email,
        role: user.role
      } : null,
      userError: userError?.message
    });
    
  } catch (error) {
    console.error('[Test Auth] Error:', error);
    return NextResponse.json(
      { 
        authenticated: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
