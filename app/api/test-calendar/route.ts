import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  console.log('[TEST] Starting test endpoint');
  
  try {
    // Test 1: Can we create a Supabase client?
    console.log('[TEST] Creating Supabase client...');
    const supabase = await createClient();
    console.log('[TEST] ✅ Supabase client created');
    
    // Test 2: Can we get the authenticated user?
    console.log('[TEST] Getting authenticated user...');
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError) {
      console.log('[TEST] ❌ Auth error:', userError);
      return NextResponse.json({ 
        test: 'auth',
        success: false,
        error: userError.message 
      });
    }
    
    if (!user) {
      console.log('[TEST] ❌ No user found');
      return NextResponse.json({ 
        test: 'auth',
        success: false,
        error: 'No authenticated user' 
      });
    }
    
    console.log('[TEST] ✅ User authenticated:', user.email);
    
    // Test 3: Can we query the calendar_events table?
    console.log('[TEST] Querying calendar_events table...');
    const { data: events, error: queryError } = await supabase
      .from('calendar_events')
      .select('id, title')
      .limit(1);
    
    if (queryError) {
      console.log('[TEST] ❌ Query error:', queryError);
      return NextResponse.json({ 
        test: 'query',
        success: false,
        user: user.email,
        error: queryError.message 
      });
    }
    
    console.log('[TEST] ✅ Query successful');
    
    // Test 4: Can we query family_members table?
    console.log('[TEST] Querying family_members table...');
    const { data: members, error: membersError } = await supabase
      .from('family_members')
      .select('id, name')
      .limit(1);
    
    if (membersError) {
      console.log('[TEST] ❌ Family members query error:', membersError);
      return NextResponse.json({ 
        test: 'family_members',
        success: false,
        user: user.email,
        error: membersError.message 
      });
    }
    
    console.log('[TEST] ✅ All tests passed!');
    
    return NextResponse.json({ 
      success: true,
      user: user.email,
      tests: {
        auth: '✅ Passed',
        database: '✅ Passed',
        calendar_events: '✅ Passed',
        family_members: '✅ Passed'
      },
      sample_event: events?.[0],
      sample_member: members?.[0]
    });
    
  } catch (error) {
    console.error('[TEST] Uncaught error:', error);
    return NextResponse.json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  console.log('[TEST POST] Starting test POST endpoint');
  
  try {
    const body = await request.json();
    console.log('[TEST POST] Received body:', JSON.stringify(body, null, 2));
    
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ 
        error: 'Not authenticated',
        details: userError?.message 
      }, { status: 401 });
    }
    
    // Try to create a minimal test event
    const testEvent = {
      title: body.title || 'Test Event',
      category: 'personal',
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      created_by: user.id,
      all_day: false,
      google_sync_enabled: false
    };
    
    console.log('[TEST POST] Creating test event:', testEvent);
    
    const { data: newEvent, error } = await supabase
      .from('calendar_events')
      .insert([testEvent])
      .select()
      .single();
    
    if (error) {
      console.error('[TEST POST] Error creating event:', error);
      return NextResponse.json({ 
        error: 'Failed to create test event',
        details: error.message,
        code: error.code
      }, { status: 500 });
    }
    
    console.log('[TEST POST] ✅ Test event created:', newEvent.id);
    
    // Clean up - delete the test event
    await supabase
      .from('calendar_events')
      .delete()
      .eq('id', newEvent.id);
    
    return NextResponse.json({ 
      success: true,
      message: 'Test event created and deleted successfully',
      user: user.email
    });
    
  } catch (error) {
    console.error('[TEST POST] Uncaught error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
