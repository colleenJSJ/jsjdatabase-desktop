import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const supabase = await createClient();
    
    // Test Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.log('[TEST-AUTH] Supabase auth error:', authError);
      return NextResponse.json({ 
        authenticated: false,
        method: 'supabase-auth',
        error: authError.message 
      });
    }
    
    if (!user) {
      console.log('[TEST-AUTH] No user found');
      return NextResponse.json({ 
        authenticated: false,
        method: 'supabase-auth',
        error: 'No user found' 
      });
    }
    
    // Get user details from users table
    const { data: userDetails } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();
    
    console.log('[TEST-AUTH] User authenticated:', user.email);
    
    return NextResponse.json({
      authenticated: true,
      method: 'supabase-auth',
      user: {
        id: user.id,
        email: user.email,
        details: userDetails
      }
    });
    
  } catch (error) {
    console.error('[TEST-AUTH] Error:', error);
    return NextResponse.json({ 
      authenticated: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
