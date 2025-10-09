import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectDevice, generateDeviceName } from '@/lib/utils/device-detection';
import { enforceCSRF } from '@/lib/security/csrf';

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const { email, code, deviceId, trustDevice } = await request.json();
    
    // Get stored verification code from cookie
    const storedCode = request.cookies.get('verification_code')?.value;
    
    if (!storedCode) {
      return NextResponse.json(
        { error: 'Verification session expired' },
        { status: 400 }
      );
    }
    
    // Verify code
    if (code !== storedCode) {
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 400 }
      );
    }
    
    const supabase = await createClient();
    
    // Get user by email
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();
    
    if (userError || !users) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    // Get current authenticated user
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    
    if (!authUser || authUser.email !== email.toLowerCase()) {
      return NextResponse.json(
        { error: 'Authentication mismatch' },
        { status: 401 }
      );
    }
    
    // Trust device if requested
    if (trustDevice && deviceId) {
      const userAgent = request.headers.get('user-agent') || '';
      const deviceInfo = detectDevice(userAgent);
      const deviceName = generateDeviceName(deviceInfo);
      
      await supabase
        .from('trusted_devices')
        .upsert({
          user_id: authUser.id,
          device_fingerprint: deviceId,
          device_name: deviceName,
          last_used_at: new Date().toISOString()
        });
    }
    
    // Clear verification cookies
    const response = NextResponse.json({
      success: true,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        setupCompleted: users.is_setup_complete || false,
      }
    });
    
    response.cookies.delete('verification_code');
    
    return response;
  } catch (error) {
    console.error('[Verify Device API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}