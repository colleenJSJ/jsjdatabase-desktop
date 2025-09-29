import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/app/api/_helpers/auth';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    
    if ('error' in authResult) {
      return authResult.error;
    }

    const { name, email, password, role } = await request.json();

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const adminClient = await createServiceClient();
    
    // Create the user in Supabase Auth
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name
      }
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Create the user profile
    const { error: profileError } = await adminClient
      .from('users')
      .insert({
        id: authData.user.id,
        name,
        email,
        role,
        user_status: 'active',
        theme_preference: 'dark',
        notification_preferences: {}
      });

    if (profileError) {
      // If profile creation fails, try to delete the auth user
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ 
      user: {
        id: authData.user.id,
        name,
        email,
        role,
        user_status: 'active'
      }
    });
  } catch (error) {
    console.error('Error adding user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}