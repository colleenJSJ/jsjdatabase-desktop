import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// This is a development-only endpoint to clear rate limits
// DO NOT deploy to production without proper security

export async function POST(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'This endpoint is disabled in production' },
      { status: 403 }
    );
  }
  
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // In a real implementation, you'd clear the rate limit for this user
    // Since the rate limit map is in the other endpoint's memory, 
    // the best way to clear it is to restart the dev server
    
    return NextResponse.json({
      success: true,
      message: 'To clear rate limits in development, restart the Next.js server (Ctrl+C and npm run dev)',
      userId: user.id,
      note: 'Rate limits are now 50 requests/hour in development mode (vs 10 in production)',
      tip: 'Cache hits no longer count against your rate limit!'
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to clear rate limit' },
      { status: 500 }
    );
  }
}
