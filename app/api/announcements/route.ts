import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, requireAdmin } from '@/app/api/_helpers/auth';

export async function GET() {
  console.log('[Announcements API] GET request received');
  
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;
    console.log('[Announcements API] Using service client to bypass RLS');
    
    // Get announcements that haven't expired or are pinned
    const { data: announcements, error } = await supabase
      .from('announcements')
      .select(`
        *,
        created_by_user:users!announcements_created_by_fkey(id, name)
      `)
      .or('is_pinned.eq.true,expires_at.gt.now()')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Announcements API] Database error:', error);
      console.error('[Announcements API] Error code:', error.code);
      console.error('[Announcements API] Error details:', error.details);
      console.error('[Announcements API] Error hint:', error.hint);
      
      // If table doesn't exist, return empty array
      if (error.code === '42P01') {
        console.log('[Announcements API] Table does not exist, returning empty array');
        return NextResponse.json({ announcements: [] });
      }
      return NextResponse.json(
        { error: error.message || 'Failed to fetch announcements' },
        { status: 500 }
      );
    }

    console.log('[Announcements API] Found announcements:', announcements?.length || 0);
    return NextResponse.json({ announcements: announcements || [] });
  } catch (error) {
    console.error('[Announcements API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;
    const data = await request.json();
    
    // Calculate expiry date (7 days from now unless pinned)
    const expiresAt = data.is_pinned 
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year for pinned
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days for regular

    const { data: announcement, error } = await supabase
      .from('announcements')
      .insert({
        title: data.title,
        message: data.message,
        is_pinned: data.is_pinned || false,
        created_by: user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select(`
        *,
        created_by_user:users!announcements_created_by_fkey(id, name)
      `)
      .single();

    if (error) {
      console.error('Error creating announcement:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to create announcement' },
        { status: 500 }
      );
    }

    return NextResponse.json({ announcement });
  } catch (error) {
    console.error('Unexpected error in POST announcement:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}