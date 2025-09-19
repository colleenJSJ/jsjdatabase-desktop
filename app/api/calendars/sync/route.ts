import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { googleAuth } from '@/lib/google/auth';
import { google } from 'googleapis';

export async function POST(request: NextRequest) {
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

    if (userDataError || userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get calendar service
    const calendar = await googleAuth.getCalendarService(user.id);
    
    // Fetch calendar list
    const { data: calendarList } = await calendar.calendarList.list();

    if (!calendarList.items || calendarList.items.length === 0) {
      return NextResponse.json({ 
        message: 'No calendars found',
        count: 0 
      });
    }

    // Store/update calendars in database
    const syncedCalendars = [];
    
    for (const cal of calendarList.items) {
      const calendarData = {
        google_calendar_id: cal.id!,
        name: cal.summary!,
        description: cal.description || null,
        color_id: cal.colorId || null,
        background_color: cal.backgroundColor || null,
        foreground_color: cal.foregroundColor || null,
        is_primary: cal.primary || false,
        time_zone: cal.timeZone || null,
        access_role: cal.accessRole || null,
        updated_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString()
      };

      const { data, error: calError } = await supabase
        .from('google_calendars')
        .upsert(calendarData, {
          onConflict: 'google_calendar_id'
        })
        .select()
        .single();

      if (calError) {
        console.error('Error storing calendar:', calError);
      } else if (data) {
        syncedCalendars.push(data);
      }
    }

    return NextResponse.json({
      message: 'Calendars synced successfully',
      count: syncedCalendars.length,
      calendars: syncedCalendars
    });

  } catch (error) {
    console.error('Calendar sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync calendars' },
      { status: 500 }
    );
  }
}