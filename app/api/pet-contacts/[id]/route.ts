import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cleanStringArray, sanitizeContactPayload } from '@/app/api/_helpers/contact-normalizer';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const body = await request.json();
    const petsList = cleanStringArray((body as Record<string, unknown>).pets);
    const sanitized = sanitizeContactPayload({
      source_type: 'pets',
      source_page: 'pets',
      ...body,
      pets: petsList,
      related_to: (body as Record<string, unknown>).related_to ?? petsList,
    });

    const updateData = {
      module: 'pets',
      category: 'Pets',
      contact_type: 'pets',
      contact_subtype: sanitized.contact_subtype ?? sanitized.category ?? 'vet',
      name: sanitized.name,
      company: sanitized.company,
      email: sanitized.email,
      emails: sanitized.emails,
      phone: sanitized.phone,
      phones: sanitized.phones,
      address: sanitized.address,
      addresses: sanitized.addresses,
      website: sanitized.website,
      portal_url: sanitized.portal_url,
      portal_username: sanitized.portal_username,
      notes: sanitized.notes,
      tags: sanitized.tags,
      related_to: sanitized.related_to.length > 0 ? sanitized.related_to : petsList,
      pets: petsList,
      is_emergency: sanitized.is_emergency,
      is_favorite: sanitized.is_favorite,
      is_archived: sanitized.is_archived,
      source_type: 'pets',
      source_id: id,
      source_page: sanitized.source_page ?? 'pets',
      updated_at: new Date().toISOString(),
    };

    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // No junction table updates; pets are stored as an array

    return NextResponse.json({ contact: { ...contact, pets: contact?.pets ?? petsList } });
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
