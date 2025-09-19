import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
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

    return NextResponse.json({ success: true });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}