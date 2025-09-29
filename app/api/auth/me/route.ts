import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCurrentUserToFamilyMember } from '@/app/api/_helpers/person-resolver';

export async function GET(request: NextRequest) {

  try {
    const supabase = await createClient();
    
    // Get the current user from Supabase (more secure than getSession)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {

      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get full user data from the users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {

      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const familyMemberId = await resolveCurrentUserToFamilyMember(userData.id);

    return NextResponse.json({
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        family_member_id: familyMemberId,
      }
    });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
