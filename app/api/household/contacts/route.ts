import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeContactPayload } from '@/app/api/_helpers/contact-normalizer';
import { enforceCSRF } from '@/lib/security/csrf';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: contacts, error } = await supabase
      .from('contacts_unified')
      .select('*')
      .eq('contact_type', 'household')
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ contacts: contacts || [] });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const supabase = await createClient();
    const body = await request.json();
    const sanitized = sanitizeContactPayload({
      source_type: 'household',
      source_page: 'household',
      ...body,
    });

    const portalPassword = sanitized.portal_password
      ? await (async () => {
          const { encrypt } = await import('@/lib/encryption');
          return await encrypt(sanitized.portal_password as string);
        })()
      : null;

    const contactData = {
      contact_type: 'household',
      module: 'household',
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
      portal_password: portalPassword,
      is_emergency: sanitized.is_emergency,
      is_favorite: sanitized.is_favorite,
      source_type: sanitized.source_type ?? 'household',
      source_page: sanitized.source_page ?? 'household',
      created_by: body.created_by ?? null,
    };

    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .insert(contactData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // No longer need to sync - using unified table directly

    return NextResponse.json({ contact });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create contact' },
      { status: 500 }
    );
  }
}
