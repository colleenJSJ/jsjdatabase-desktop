import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { applyPersonFilter } from '@/app/api/_helpers/apply-person-filter';
import { resolvePersonReferences } from '@/app/api/_helpers/person-resolver';
import { sanitizeContactPayload } from '@/app/api/_helpers/contact-normalizer';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get('trip_id');
    const selectedPerson = searchParams.get('selected_person') || undefined;

    const shouldFilterByPerson = Boolean(selectedPerson && selectedPerson !== 'all');
    const selectedParam = shouldFilterByPerson ? undefined : selectedPerson;

    let query = supabase
      .from('contacts_unified')
      .select('*')
      .eq('contact_type', 'travel');

    if (tripId && tripId !== 'all') {
      query = query.eq('trip_id', tripId);
    }

    query = await applyPersonFilter({
      query,
      selectedPerson: selectedParam,
      userId: user.id,
      module: 'travel_contacts',
      columnName: 'related_to',
      isAdmin: user.role === 'admin',
    });
    let response;
    if (query && typeof (query as any)?.order === 'function') {
      response = await query.order('name', { ascending: true });
    } else {
      // If filtering already executed the query, just await the result directly
      response = await query;
    }

    const { data: contacts, error } = response || { data: null, error: null };

    if (error) {
      console.error('[Travel Contacts API] Failed to fetch contacts:', error);
      return jsonError('Failed to fetch travel contacts', { status: 500 });
    }

    let filteredContacts = contacts || [];
    if (shouldFilterByPerson && selectedPerson && Array.isArray(filteredContacts)) {
      const { resolvePersonReferences } = await import('@/app/api/_helpers/person-resolver');
      const resolved = await resolvePersonReferences(selectedPerson);
      const ids = new Set<string>();
      if (resolved) {
        const list = Array.isArray(resolved) ? resolved : [resolved];
        list.filter(Boolean).forEach(id => ids.add(String(id)));
      }

      filteredContacts = filteredContacts.filter(contact => {
        const related = Array.isArray((contact as any).related_to)
          ? (contact as any).related_to.filter(Boolean)
          : [];
        if (contact.created_by === user.id) return true;
        if (related.length === 0) return true;
        if (ids.size === 0) return false;
        return related.some((rid: string) => ids.has(String(rid)));
      });
    }

    return jsonSuccess({ contacts: filteredContacts }, {
      legacy: { contacts: filteredContacts },
    });
  } catch (error) {
    console.error('[Travel Contacts API] Error fetching contacts:', error);
    return jsonError('Internal server error', { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;
    const data = await request.json();
    const sanitized = sanitizeContactPayload({
      source_type: 'travel',
      source_page: 'travel',
      ...data,
    });

    const insertData = {
      contact_type: 'travel',
      module: 'travel',
      category: sanitized.category ?? 'Travel',
      contact_subtype: sanitized.contact_subtype ?? sanitized.category ?? 'other',
      name: sanitized.name,
      company: sanitized.company,
      email: sanitized.email,
      emails: sanitized.emails,
      phone: sanitized.phone,
      phones: sanitized.phones,
      address: sanitized.address,
      addresses: sanitized.addresses,
      notes: sanitized.notes,
      tags: sanitized.tags,
      related_to: sanitized.related_to,
      is_preferred: sanitized.is_preferred,
      is_favorite: sanitized.is_favorite,
      is_archived: sanitized.is_archived,
      trip_id: sanitized.trip_id,
      source_type: sanitized.source_type ?? 'travel',
      source_page: sanitized.source_page ?? 'travel',
      created_by: user.id,
    };

    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[Travel Contacts API] Failed to create contact:', error);
      return jsonError('Failed to create travel contact', { status: 500 });
    }

    return jsonSuccess({ contact }, { status: 201, legacy: { contact } });
  } catch (error) {
    console.error('[Travel Contacts API] Error creating contact:', error);
    return jsonError('Internal server error', { status: 500 });
  }
}
