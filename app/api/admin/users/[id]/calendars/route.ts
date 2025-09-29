import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options)
          },
          remove(name: string, options: any) {
            cookieStore.delete(name)
          },
        },
      }
    );

    // Check if user is authenticated and admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get user details
    const { data: targetUser, error: targetUserError } = await supabase
      .from('users')
      .select('id, email, name, role')
      .eq('id', id)
      .single();

    if (targetUserError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get calendars with permissions for this user
    const { data: calendars, error: calendarsError } = await supabase
      .from('google_calendars')
      .select(`
        *,
        calendar_permissions(
          can_read,
          can_write
        )
      `)
      .order('name');

    if (calendarsError) {
      throw calendarsError;
    }

    // Format response
    const formattedCalendars = calendars?.map(calendar => {
      const permission = calendar.calendar_permissions?.find(
        (p: any) => p.user_id === id
      );

      return {
        ...calendar,
        can_read: permission?.can_read || false,
        can_write: permission?.can_write || false,
        calendar_permissions: undefined
      };
    });

    return NextResponse.json({
      user: targetUser,
      calendars: formattedCalendars || []
    });

  } catch (error) {
    console.error('Error fetching user calendars:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user calendars' },
      { status: 500 }
    );
  }
}