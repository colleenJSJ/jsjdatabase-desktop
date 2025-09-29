import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/app/api/_helpers/auth';

export async function POST() {
  try {
    const authResult = await requireAdmin();
    
    if ('error' in authResult) {
      return authResult.error;
    }

    const supabase = await createServiceClient();
    
    // Check if Susan exists
    const { data: susan, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('id', '6f0ddcb5-fff8-4c35-aacb-ef60f575cf0c')
      .single();

    if (findError) {

      return NextResponse.json({ error: 'Susan not found', details: findError.message }, { status: 404 });
    }

    // Update Susan to ensure she has all required fields
    const { data: updated, error: updateError } = await supabase
      .from('users')
      .update({
        name: 'Susan Johnson',
        email: susan.email || 'susan@jsjmail.com',
        role: susan.role || 'user',
        is_active: true
      })
      .eq('id', '6f0ddcb5-fff8-4c35-aacb-ef60f575cf0c')
      .select()
      .single();

    if (updateError) {

      return NextResponse.json({ error: 'Failed to update Susan', details: updateError.message }, { status: 500 });
    }

    // Verify she's now in the users list
    const { data: allUsers, error: listError } = await supabase
      .from('users')
      .select('id, name, email, role, is_active')
      .order('name');

    if (listError) {

    }

    const susanInList = allUsers?.find(u => u.id === '6f0ddcb5-fff8-4c35-aacb-ef60f575cf0c');

    return NextResponse.json({ 
      success: true,
      susan: updated,
      susanInList: susanInList,
      totalUsers: allUsers?.length,
      allUserNames: allUsers?.map(u => u.name)
    });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}