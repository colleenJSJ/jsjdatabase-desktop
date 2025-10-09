import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeContactPayload } from '@/app/api/_helpers/contact-normalizer';
import { enforceCSRF } from '@/lib/security/csrf';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();

    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .select('*')
      .eq('id', id)
      .eq('contact_type', 'household')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ contact });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch contact' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  try {
    const supabase = await createClient();
    const body = await request.json();
    const sanitized = sanitizeContactPayload({
      source_type: 'household',
      source_page: 'household',
      ...body,
    });

    const updateData: Record<string, unknown> = {
      name: sanitized.name,
      company: sanitized.company,
      category: 'household',
      contact_subtype: sanitized.contact_subtype ?? sanitized.category ?? 'other',
      email: sanitized.email,
      emails: sanitized.emails,
      phone: sanitized.phone,
      phones: sanitized.phones,
      address: sanitized.address,
      addresses: sanitized.addresses,
      tags: sanitized.tags,
      related_to: sanitized.related_to,
      assigned_entities: sanitized.assigned_entities,
      notes: sanitized.notes,
      website: sanitized.website,
      portal_url: sanitized.portal_url,
      portal_username: sanitized.portal_username,
      is_emergency: sanitized.is_emergency,
      is_favorite: sanitized.is_favorite,
      source_type: sanitized.source_type ?? 'household',
      source_page: sanitized.source_page ?? 'household',
      updated_at: new Date().toISOString(),
    };

    if (Object.prototype.hasOwnProperty.call(body as Record<string, unknown>, 'portal_password')) {
      if (!sanitized.portal_password) {
        updateData.portal_password = null;
      } else {
        const { encrypt } = await import('@/lib/encryption');
        updateData.portal_password = await encrypt(sanitized.portal_password);
      }
    }

    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .update(updateData)
      .eq('id', id)
      .eq('contact_type', 'household')
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ contact });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update contact' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('contacts_unified')
      .delete()
      .eq('id', id)
      .eq('contact_type', 'household');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete contact' },
      { status: 500 }
    );
  }
}
