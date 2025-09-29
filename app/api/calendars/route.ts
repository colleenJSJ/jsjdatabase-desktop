import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    // Create Supabase client
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

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user is admin
    const { data: userData, error: userDataError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = userData?.role === 'admin';

    let calendars;

    if (isAdmin) {
      // Admins can see all calendars
      const { data, error } = await supabase
        .from('google_calendars')
        .select('*')
        .order('name');

      if (error) {
        throw error;
      }

      calendars = data;
    } else {
      // Regular users only see calendars they have permission for
      const { data, error } = await supabase
        .from('google_calendars')
        .select(`
          *,
          calendar_permissions!inner(
            can_read,
            can_write
          )
        `)
        .eq('calendar_permissions.user_id', user.id)
        .eq('calendar_permissions.can_read', true)
        .order('name');

      if (error) {
        throw error;
      }

      // Flatten the response
      calendars = data?.map(cal => ({
        ...cal,
        can_write: cal.calendar_permissions?.[0]?.can_write || false,
        calendar_permissions: undefined
      }));
    }

    // Get user's calendar preferences
    const { data: preferences } = await supabase
      .from('user_calendar_preferences')
      .select('visible_calendar_ids')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      calendars: calendars || [],
      visibleCalendarIds: preferences?.visible_calendar_ids || [],
      isAdmin
    });

  } catch (error: any) {
    console.error('Error fetching calendars:', error);
    
    // Handle case where table doesn't exist yet
    if (error?.code === 'PGRST205' && error?.message?.includes('google_calendars')) {
      console.log('Google calendars table not found - returning empty array');
      return NextResponse.json({
        calendars: [],
        visibleCalendarIds: [],
        isAdmin: false
      });
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch calendars' },
      { status: 500 }
    );
  }
}