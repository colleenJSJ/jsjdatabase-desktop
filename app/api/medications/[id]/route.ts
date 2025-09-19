import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, requireAdmin } from '@/app/api/_helpers/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }
    
    const { user, supabase } = authResult;
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const data = await request.json();
    
    const { data: medication, error } = await supabase
      .from('medications')
      .update({
        name: data.name,
        dosage: data.dosage,
        frequency: data.frequency,
        prescribing_doctor: data.prescribing_doctor || null,
        for_user: data.for_user,
        refill_reminder_date: data.refill_reminder_date || null,
        notes: data.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {

      return NextResponse.json(
        { error: 'Failed to update medication' },
        { status: 500 }
      );
    }

    return NextResponse.json({ medication });
  } catch (error) {

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
  const { id } = await params;
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }
    
    const { user, supabase } = authResult;
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const { error } = await supabase
      .from('medications')
      .delete()
      .eq('id', id);

    if (error) {

      return NextResponse.json(
        { error: 'Failed to delete medication' },
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