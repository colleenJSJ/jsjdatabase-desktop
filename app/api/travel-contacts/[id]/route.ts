import { NextRequest, NextResponse } from 'next/server';
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
    const data = await request.json();
    
    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .update({
        category: data.category || 'Travel',
        contact_subtype: data.contact_type,
        name: data.name,
        company: data.company,
        phone: data.phone,
        email: data.email,
        address: data.address,
        notes: data.notes,
        is_preferred: data.is_preferred,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('contact_type', 'travel')
      .select()
      .single();

    if (error) {
      console.error('[Travel Contacts API] Failed to update contact:', error);
      return NextResponse.json(
        { error: 'Failed to update travel contact' },
        { status: 500 }
      );
    }

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('[Travel Contacts API] Error updating contact:', error);
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
    
    const { error } = await supabase
      .from('contacts_unified')
      .delete()
      .eq('id', id)
      .eq('contact_type', 'travel');

    if (error) {
      console.error('[Travel Contacts API] Failed to delete contact:', error);
      return NextResponse.json(
        { error: 'Failed to delete travel contact' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Travel Contacts API] Error deleting contact:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
