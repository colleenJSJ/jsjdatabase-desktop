import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SupabasePasswordService } from '@/lib/services/supabase-password-service';

const passwordService = new SupabasePasswordService();

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ 
        error: 'Not authenticated',
        authError: authError?.message 
      }, { status: 401 });
    }
    
    // Test creating a password
    const testPassword = {
      service_name: 'Test Service',
      username: 'testuser@example.com',
      password: 'TestPassword123!',
      url: 'https://example.com',
      category: 'other' as const,
      notes: 'This is a test password entry',
      tags: ['test'],
      owner_id: user.id,
      is_favorite: false,
      is_shared: false
    };
    
    console.log('[TEST] Creating password with data:', {
      ...testPassword,
      password: '[HIDDEN]'
    });
    
    try {
      const created = await passwordService.createPassword(testPassword);
      
      return NextResponse.json({
        success: true,
        message: 'Password created successfully',
        password: {
          ...created,
          password: '[HIDDEN]'
        }
      });
    } catch (error) {
      console.error('[TEST] Error creating password:', error);
      
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        authUserId: user.id
      });
    }
    
  } catch (error) {
    console.error('[TEST] General error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
