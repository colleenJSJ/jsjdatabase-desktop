import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/app/api/_helpers/auth';
import { enforceCSRF } from '@/lib/security/csrf';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  console.log('[Announcements API] GET request for ID:', id);
  
  try {
    const supabase = await createServiceClient();
    
    const { data: announcement, error } = await supabase
      .from('announcements')
      .select(`
        *,
        created_by_user:users!announcements_created_by_fkey(id, name)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[Announcements API] Get error:', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Announcement not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: error.message || 'Failed to fetch announcement' },
        { status: 500 }
      );
    }

    return NextResponse.json({ announcement });
  } catch (error) {
    console.error('[Announcements API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  try {
    const authResult = await requireAdmin(request, { skipCSRF: true });
    
    if ('error' in authResult) {
      return authResult.error;
    }

    const data = await request.json();
    const supabase = await createServiceClient();
    console.log('[Announcements API] PUT request for ID:', id);
    
    // Calculate expiry date if pinned status changed
    const expiresAt = data.is_pinned 
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year for pinned
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days for regular

    const { data: announcement, error } = await supabase
      .from('announcements')
      .update({
        title: data.title,
        message: data.message,
        is_pinned: data.is_pinned || false,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        created_by_user:users!announcements_created_by_fkey(id, name)
      `)
      .single();

    if (error) {
      console.error('[Announcements API] Update error:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to update announcement' },
        { status: 500 }
      );
    }

    return NextResponse.json({ announcement });
  } catch (error) {
    console.error('[Announcements API] PUT unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  console.log('[Announcements API] DELETE request for ID:', id);
  
  try {
    const authResult = await requireAdmin(request, { skipCSRF: true });
    
    if ('error' in authResult) {
      return authResult.error;
    }

    const supabase = await createServiceClient();
    
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Announcements API] Delete error:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to delete announcement' },
        { status: 500 }
      );
    }

    console.log('[Announcements API] Successfully deleted announcement:', id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Announcements API] DELETE unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}