import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceCSRF } from '@/lib/security/csrf';

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const supabase = await createClient();
    
    // Sign out using Supabase
    const { error } = await supabase.auth.signOut();
    
    if (error) {

      return NextResponse.json(
        { error: 'Failed to logout' },
        { status: 500 }
      );
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete('csrf-session');
    response.cookies.delete('csrf-token');
    return response;
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
