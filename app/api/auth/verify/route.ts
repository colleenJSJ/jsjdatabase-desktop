import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    
    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify password by attempting to sign in with current email
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: password
    });

    if (signInError) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // Log successful verification
    try {
      const serviceClient = await createServiceClient();
      await serviceClient
        .from('activity_logs')
        .insert({
          user_id: user.id,
          action: 'password_vault_unlocked',
          metadata: { method: 'session_timeout' },
          created_at: new Date().toISOString()
        });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API/auth/verify] Error:', error);
    return NextResponse.json(
      { error: 'Failed to verify password' },
      { status: 500 }
    );
  }
}

