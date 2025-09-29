import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/encryption';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { pin } = await request.json();

    if (!pin || !/^\d{5}$/.test(pin)) {
      return NextResponse.json(
        { error: 'PIN must be exactly 5 digits' },
        { status: 400 }
      );
    }

    // Hash the PIN before storing
    const hashedPin = await bcrypt.hash(pin, 10);

    // Update user's PIN and mark setup as complete
    const { error: updateError } = await supabase
      .from('users')
      .update({
        pin_hash: hashedPin,
        is_setup_complete: true
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[Setup PIN API] Error updating PIN:', updateError);
      return NextResponse.json(
        { error: 'Failed to update PIN' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Setup PIN API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}