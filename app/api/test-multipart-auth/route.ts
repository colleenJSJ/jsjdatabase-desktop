import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceCSRF } from '@/lib/security/csrf';

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  console.log('[Test Multipart] Request received');
  console.log('[Test Multipart] Content-Type:', request.headers.get('content-type'));
  console.log('[Test Multipart] Cookies:', request.headers.get('cookie'));
  
  try {
    // Check authentication
    const supabase = await createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    console.log('[Test Multipart] Session check:', {
      hasSession: !!session,
      hasUser: !!user,
      sessionError: sessionError?.message,
      userError: userError?.message,
      userId: user?.id,
      userEmail: user?.email
    });
    
    if (!session || !user) {
      return NextResponse.json(
        { 
          authenticated: false,
          error: 'No session found',
          sessionError: sessionError?.message,
          userError: userError?.message,
          headers: {
            contentType: request.headers.get('content-type'),
            cookie: request.headers.get('cookie')?.substring(0, 50) + '...'
          }
        },
        { status: 401 }
      );
    }
    
    // Try to parse multipart if present
    let fileInfo = null;
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        if (file) {
          fileInfo = {
            name: file.name,
            size: file.size,
            type: file.type
          };
        }
      } catch (e) {
        console.error('[Test Multipart] Error parsing form data:', e);
      }
    }
    
    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email
      },
      session: {
        expiresAt: session.expires_at
      },
      fileInfo,
      message: 'Multipart authentication test successful'
    });
    
  } catch (error: any) {
    console.error('[Test Multipart] Error:', error);
    return NextResponse.json(
      { 
        authenticated: false,
        error: 'Server error',
        details: error.message
      },
      { status: 500 }
    );
  }
}
