import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const { email, password, deviceId, rememberMe, deviceInfo, pin } = await request.json();

    const supabase = await createClient();

    // PIN-based login
    if (pin && email) {
      // First authenticate with Supabase to get the user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }

      // Get user data to verify PIN
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('pin_hash')
        .eq('id', user.id)
        .single();

      if (!userData || !userData.pin_hash) {
        return NextResponse.json({ error: 'PIN not set up' }, { status: 400 });
      }

      // Validate PIN
      const isPinValid = await bcrypt.compare(pin, userData.pin_hash);
      if (!isPinValid) {
        return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
      }

      return NextResponse.json({ 
        success: true,
        user: {
          id: user.id,
          email: user.email,
        }
      });
    }

    // Email/Password login - redirect to main login endpoint
    if (email && password) {
      // Use Supabase Auth for email/password login
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim()
      });

      if (authError || !authData.user) {
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401 }
        );
      }

      // Get user data
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      // Handle device trust if needed
      if (rememberMe && deviceId) {
        await supabase
          .from('trusted_devices')
          .upsert({
            user_id: authData.user.id,
            device_fingerprint: deviceId,
            device_name: deviceInfo?.name || 'Unknown Device',
            last_used_at: new Date().toISOString()
          });
      }

      return NextResponse.json({ 
        success: true,
        user: userData ? {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          role: userData.role,
          setupCompleted: userData.is_setup_complete || false,
        } : {
          id: authData.user.id,
          email: authData.user.email
        }
      });
    }

    return NextResponse.json(
      { error: 'Email and password or PIN required' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[Login V2 API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}