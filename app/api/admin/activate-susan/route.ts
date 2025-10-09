import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/app/api/_helpers/auth';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request);
    
    if ('error' in authResult) {
      return authResult.error;
    }

    const supabase = await createServiceClient();
    
    // Activate Susan Johnson
    const { data, error } = await supabase
      .from('users')
      .update({ is_active: true })
      .eq('id', '6f0ddcb5-fff8-4c35-aacb-ef60f575cf0c')
      .select()
      .single();

    if (error) {

      return NextResponse.json(
        { error: 'Failed to activate Susan', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Susan Johnson has been activated',
      user: data 
    });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request);
    
    if ('error' in authResult) {
      return authResult.error;
    }

    const supabase = await createServiceClient();
    
    // Check Susan's current status
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, is_active')
      .eq('id', '6f0ddcb5-fff8-4c35-aacb-ef60f575cf0c')
      .single();

    if (error) {

      return NextResponse.json(
        { error: 'Failed to check Susan status', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ user: data });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
