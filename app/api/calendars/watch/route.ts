import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { googleAuth } from '@/lib/google/auth';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
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
    const { calendarId } = body;

    if (!calendarId) {
      return NextResponse.json({ error: 'Calendar ID is required' }, { status: 400 });
    }

    // Check if user has access to this calendar
    const { data: permission } = await supabase
      .from('calendar_permissions')
      .select('can_read')
      .eq('user_id', user.id)
      .eq('google_calendar_id', calendarId)
      .single();

    // Check if user is admin
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = userData?.role === 'admin';

    if (!isAdmin && (!permission || !permission.can_read)) {
      return NextResponse.json({ error: 'Access denied to this calendar' }, { status: 403 });
    }

    // Get Google Calendar service
    const calendar = await googleAuth.getCalendarService(user.id);

    // Check if watch already exists
    const { data: existingWatch } = await supabase
      .from('webhook_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('calendar_id', calendarId)
      .single();

    if (existingWatch) {
      // Check if it's still valid
      const expirationDate = new Date(existingWatch.expiration);
      const now = new Date();
      
      if (expirationDate > now) {
        return NextResponse.json({
          message: 'Watch already exists and is still valid',
          expiration: existingWatch.expiration
        });
      }

      // Delete expired watch
      await supabase
        .from('webhook_subscriptions')
        .delete()
        .eq('id', existingWatch.id);
    }

    // Create a new watch
    const channelId = uuidv4();
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/google-calendar`;
    
    try {
      const watchResponse = await calendar.events.watch({
        calendarId,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: webhookUrl,
          // Token for additional security (optional)
          token: 'calendar-sync-token',
          // Expiration time (max 30 days from now)
          expiration: String(Date.now() + (30 * 24 * 60 * 60 * 1000))
        }
      });

      if (watchResponse.data.resourceId) {
        // Store the watch subscription
        const { error: insertError } = await supabase
          .from('webhook_subscriptions')
          .insert({
            user_id: user.id,
            calendar_id: calendarId,
            channel_id: channelId,
            resource_id: watchResponse.data.resourceId,
            expiration: new Date(parseInt(watchResponse.data.expiration!))
          });

        if (insertError) {
          console.error('Error storing webhook subscription:', insertError);
          // Try to stop the watch since we couldn't store it
          try {
            await calendar.channels.stop({
              requestBody: {
                id: channelId,
                resourceId: watchResponse.data.resourceId
              }
            });
          } catch (stopError) {
            console.error('Error stopping watch:', stopError);
          }
          
          return NextResponse.json({ 
            error: 'Failed to store webhook subscription' 
          }, { status: 500 });
        }

        return NextResponse.json({
          message: 'Calendar watch created successfully',
          channelId,
          resourceId: watchResponse.data.resourceId,
          expiration: watchResponse.data.expiration
        });
      }
    } catch (error: any) {
      console.error('Error creating calendar watch:', error);
      
      // Check if webhooks are not supported or accessible
      if (error.code === 400 || error.code === 403) {
        return NextResponse.json({
          error: 'Webhook setup failed',
          message: 'Falling back to polling mechanism',
          usePolling: true
        }, { status: 200 });
      }
      
      throw error;
    }

  } catch (error) {
    console.error('Error setting up calendar watch:', error);
    return NextResponse.json(
      { error: 'Failed to set up calendar watch' },
      { status: 500 }
    );
  }
}

// Stop watching a calendar
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const calendarId = searchParams.get('calendarId');

    if (!calendarId) {
      return NextResponse.json({ error: 'Calendar ID is required' }, { status: 400 });
    }

    // Get existing watch
    const { data: watch } = await supabase
      .from('webhook_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('calendar_id', calendarId)
      .single();

    if (!watch) {
      return NextResponse.json({ message: 'No watch found' });
    }

    // Get Google Calendar service
    const calendar = await googleAuth.getCalendarService(user.id);

    try {
      // Stop the watch
      await calendar.channels.stop({
        requestBody: {
          id: watch.channel_id,
          resourceId: watch.resource_id
        }
      });
    } catch (error) {
      console.error('Error stopping watch:', error);
      // Continue even if stop fails
    }

    // Delete from database
    await supabase
      .from('webhook_subscriptions')
      .delete()
      .eq('id', watch.id);

    return NextResponse.json({ message: 'Watch stopped successfully' });

  } catch (error) {
    console.error('Error stopping calendar watch:', error);
    return NextResponse.json(
      { error: 'Failed to stop calendar watch' },
      { status: 500 }
    );
  }
}
