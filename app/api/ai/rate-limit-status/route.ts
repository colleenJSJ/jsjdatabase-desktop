import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Access the rate limit map from the extract endpoint
// Note: This only works if both endpoints are in the same Node.js process
const getRateLimitStatus = (userId: string) => {
  const now = Date.now();
  // This is a simplified check - in production you'd use Redis or a database
  return {
    userId,
    message: 'Rate limit status check',
    note: 'Rate limits are per-process. Restart the server to reset.',
    limits: {
      maxRequests: 10,
      windowHours: 1,
      resetsAt: new Date(now + 60 * 60 * 1000).toISOString()
    }
  };
};

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const status = getRateLimitStatus(user.id);
    
    return NextResponse.json({
      ...status,
      tip: 'To reset rate limits during development, restart the Next.js server (Ctrl+C and npm run dev)'
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get rate limit status' },
      { status: 500 }
    );
  }
}
