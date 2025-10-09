import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/app/api/_helpers/auth';

export async function GET(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const authResult = await requireAdmin(request);
    if ('error' in authResult) {
      return authResult.error;
    }

    const supabase = await createServiceClient();
    
    // Fetch Susan by ID
    const { data: susanById, error: error1 } = await supabase
      .from('users')
      .select('*')
      .eq('id', '6f0ddcb5-fff8-4c35-aacb-ef60f575cf0c')
      .single();
    
    // Fetch Susan by name
    const { data: susanByName, error: error2 } = await supabase
      .from('users')
      .select('*')
      .ilike('name', '%susan%');
    
    // Fetch all users to see the complete list
    const { data: allUsers, error: error3 } = await supabase
      .from('users')
      .select('id, name, email, is_active, role')
      .order('name');
    
    return NextResponse.json({
      susanById,
      susanByName,
      allUsers,
      errors: {
        byId: error1?.message,
        byName: error2?.message,
        allUsers: error3?.message
      }
    });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
