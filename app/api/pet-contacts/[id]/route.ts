import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { pets, ...contactData } = body;

    // Update unified contacts table instead of legacy pet_contacts
    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .update({ 
        module: 'pets',
        category: 'Pets',
        contact_type: 'general',
        contact_subtype: (contactData as any).contact_subtype || (contactData as any).contact_type || 'vet',
        name: (contactData as any).name,
        email: (contactData as any).email || null,
        phone: (contactData as any).phone || null,
        address: (contactData as any).address || null,
        company: (contactData as any).business_name || (contactData as any).company || null,
        website: (contactData as any).website || null,
        portal_url: (contactData as any).portal_url || null,
        portal_username: (contactData as any).portal_username || null,
        portal_password: (contactData as any).portal_password || null,
        notes: (contactData as any).notes || null,
        related_to: pets || [],
        pets: pets || [],
        updated_at: new Date().toISOString(),
        source_type: 'pets',
        source_id: id
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // No junction table updates; pets are stored as an array

    return NextResponse.json({ contact: { ...contact, pets: pets || [] } });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update pet contact' },
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
    const supabase = await createClient();
    // Delete from unified contacts
    const { error } = await supabase
      .from('contacts_unified')
      .delete()
      .eq('id', id)
      .eq('module', 'pets');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete pet contact' },
      { status: 500 }
    );
  }
}
