import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all active family members (humans and pets)
    const { data: familyMembers, error } = await supabase
      .from('family_members')
      .select('id, name, type, is_child, email, user_id')
      .eq('is_active', true)
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching family members:', error);
      return NextResponse.json({ error: 'Failed to fetch family members' }, { status: 500 });
    }

    // Also fetch users to include them
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('is_active', true);

    if (!usersError && users) {
      // Add users that aren't already in family_members
      users.forEach(user => {
        if (!familyMembers?.find(fm => fm.email === user.email)) {
          familyMembers?.push({
            id: user.id,
            name: user.name || user.email?.split('@')[0] || 'Unknown',
            type: 'user',
            is_child: false,
            email: user.email,
            user_id: user.id
          });
        }
      });
    }

    return NextResponse.json({ 
      members: familyMembers || [],
      success: true 
    });
  } catch (error) {
    console.error('Error in GET /api/family-members:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
