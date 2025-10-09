import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { enforceCSRF } from '@/lib/security/csrf';

// GET user's calendar preferences
export async function GET(request: NextRequest) {
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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: preferences, error } = await supabase
      .from('user_calendar_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw error;
    }

    return NextResponse.json({
      visible_calendar_ids: preferences?.visible_calendar_ids || []
    });

  } catch (error) {
    console.error('Error fetching calendar preferences:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar preferences' },
      { status: 500 }
    );
  }
}

// PUT update user's calendar preferences
export async function PUT(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { visible_calendar_ids } = body;

    if (!Array.isArray(visible_calendar_ids)) {
      return NextResponse.json(
        { error: 'visible_calendar_ids must be an array' },
        { status: 400 }
      );
    }

    // Verify that user has access to all the calendars they're trying to make visible
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = userData?.role === 'admin';

    if (!isAdmin && visible_calendar_ids.length > 0) {
      // Check permissions for non-admin users
      const { data: permissions, error: permError } = await supabase
        .from('calendar_permissions')
        .select('google_calendar_id')
        .eq('user_id', user.id)
        .eq('can_read', true);

      if (permError) {
        throw permError;
      }

      const allowedCalendarIds = permissions?.map(p => p.google_calendar_id) || [];
      const invalidCalendarIds = visible_calendar_ids.filter(
        id => !allowedCalendarIds.includes(id)
      );

      if (invalidCalendarIds.length > 0) {
        return NextResponse.json(
          { error: 'Access denied to some calendars' },
          { status: 403 }
        );
      }
    }

    // Upsert preferences
    const { data, error } = await supabase
      .from('user_calendar_preferences')
      .upsert({
        user_id: user.id,
        visible_calendar_ids,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      message: 'Calendar preferences updated',
      preferences: data
    });

  } catch (error) {
    console.error('Error updating calendar preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update calendar preferences' },
      { status: 500 }
    );
  }
}