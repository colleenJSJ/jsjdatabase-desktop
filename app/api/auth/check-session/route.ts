import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const supabase = await createClient();
    const cookieStore = await cookies();
    const deviceId = cookieStore.get('device_id')?.value;
    
    // Check if we have a valid session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (user && !authError) {
      // Get user data from users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (userData && deviceId) {
        // Check if this device is trusted
        const { data: trustedDevice } = await supabase
          .from('trusted_devices')
          .select('id')
          .eq('user_id', user.id)
          .eq('device_fingerprint', deviceId)
          .single();
        
        return NextResponse.json({
          hasSession: true,
          isTrusted: !!trustedDevice,
          user: {
            email: userData.email,
            name: userData.name,
            setupCompleted: userData.is_setup_complete || false,
          }
        });
      }
      
      return NextResponse.json({
        hasSession: true,
        isTrusted: false,
        user: userData ? {
          email: userData.email,
          name: userData.name,
          setupCompleted: userData.is_setup_complete || false,
        } : null
      });
    }
    
    return NextResponse.json({
      hasSession: false,
      isTrusted: false,
      user: null
    });
  } catch (error) {
    console.error('[Check Session API] Unexpected error:', error);
    return NextResponse.json({
      hasSession: false,
      isTrusted: false,
      user: null
    });
  }
}