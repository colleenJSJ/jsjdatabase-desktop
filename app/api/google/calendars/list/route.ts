import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch user's Google calendars from database
    const { data: calendars, error: calendarError } = await supabase
      .from('google_calendars')
      .select('*')
      .eq('user_id', user.id)
      .order('is_primary', { ascending: false });

    if (calendarError) {
      console.error('Error fetching calendars:', calendarError);
      return NextResponse.json({ 
        error: 'Failed to fetch calendars',
        calendars: []
      }, { status: 200 }); // Return empty list instead of error
    }

    // Transform calendar data for frontend
    const transformedCalendars = (calendars || []).map(cal => ({
      id: cal.google_calendar_id,
      google_calendar_id: cal.google_calendar_id, // Include this for color matching
      name: cal.name,
      description: cal.description,
      backgroundColor: cal.background_color,
      background_color: cal.background_color, // Include snake_case version too
      foregroundColor: cal.foreground_color,
      foreground_color: cal.foreground_color, // Include snake_case version too
      colorId: null,
      isPrimary: cal.is_primary,
      canWrite: cal.can_write !== false,
      accessRole: cal.access_role || 'writer',
      timeZone: cal.time_zone
    }));

    return NextResponse.json({
      calendars: transformedCalendars,
      count: transformedCalendars.length
    });
  } catch (error) {
    console.error('Error in /api/google/calendars/list:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      calendars: []
    }, { status: 200 }); // Return empty list on error
  }
}