import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';
import { sanitizeContactPayload } from '@/app/api/_helpers/contact-normalizer';

export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;

    // Fetch all contacts from unified table (all types, not just general)
    const { data: contacts, error } = await supabase
      .from('contacts_unified')
      .select('*')
      .eq('is_archived', false)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching contacts:', error);
      try {
        const { logRlsDenied } = await import('@/lib/utils/db-telemetry');
        await logRlsDenied({ userId: user.id, error, endpoint: '/api/contacts', entityType: 'contact', page: 'household' });
      } catch {}
      return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
    }

    return NextResponse.json({ contacts: contacts || [] });
  } catch (error) {
    console.error('Error in GET /api/contacts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;

    const body = await request.json();

    const sanitized = sanitizeContactPayload(body);

    const portalPassword = sanitized.portal_password
      ? await (async () => {
          const { encrypt } = await import('@/lib/encryption');
          return encrypt(sanitized.portal_password as string);
        })()
      : null;

    const contactData = {
      contact_type: 'general',
      module: 'general',
      name: sanitized.name,
      company: sanitized.company,
      category: sanitized.category ?? 'Other',
      contact_subtype: sanitized.contact_subtype,
      email: sanitized.email,
      emails: sanitized.emails,
      phone: sanitized.phone,
      phones: sanitized.phones,
      address: sanitized.address,
      addresses: sanitized.addresses,
      tags: sanitized.tags,
      related_to: sanitized.related_to,
      assigned_entities: sanitized.assigned_entities,
      pets: sanitized.pets,
      trip_id: sanitized.trip_id,
      source_type: sanitized.source_type ?? 'other',
      source_page: sanitized.source_page ?? 'contacts',
      source_id: sanitized.source_id,
      notes: sanitized.notes,
      website: sanitized.website,
      portal_url: sanitized.portal_url,
      portal_username: sanitized.portal_username,
      portal_password: portalPassword,
      is_emergency: sanitized.is_emergency,
      is_preferred: sanitized.is_preferred,
      is_favorite: sanitized.is_favorite,
      is_archived: false,
      created_by: user.id,
    };

    // Insert contact into unified table
    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .insert(contactData)
      .select()
      .single();

    if (error) {
      console.error('Error creating contact:', error);
      try {
        const { logRlsDenied } = await import('@/lib/utils/db-telemetry');
        await logRlsDenied({ userId: user.id, error, endpoint: '/api/contacts', entityType: 'contact', page: 'household' });
      } catch {}
      return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
    }

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/contacts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
