import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { sanitizeContactPayload, cleanStringArray, cleanNullableString } from '@/app/api/_helpers/contact-normalizer';
import { syncPortalCredentialsForContact } from '@/app/api/_helpers/contact-portal-sync';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
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
      return jsonError('Failed to fetch contacts', {
        status: 500,
        code: 'CONTACTS_FETCH_FAILED',
        meta: { details: error.message },
      });
    }

    return jsonSuccess({ contacts: contacts || [] }, { legacy: { contacts: contacts || [] } });
  } catch (error) {
    console.error('Error in GET /api/contacts:', error);
    return jsonError('Internal server error', { status: 500, code: 'INTERNAL_ERROR' });
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

    const body = await request.json();

    const sanitized = sanitizeContactPayload(body);

    const portalPassword = sanitized.portal_password
      ? await (async () => {
          const { encrypt } = await import('@/lib/encryption');
          return await encrypt(sanitized.portal_password as string);
        })()
      : null;

    const servicesProvided = cleanStringArray(body.services_provided);
    const specialties = cleanStringArray(body.specialties);
    const accountNumber = cleanNullableString(body.account_number);
    const hoursOfOperation = cleanNullableString(body.hours_of_operation);

    const contactData = {
      contact_type: 'general',
      module: 'general',
      name: sanitized.name,
      company: sanitized.company,
      category: sanitized.category ?? 'Other',
      contact_subtype: sanitized.contact_subtype,
      email: sanitized.email,
      phone: sanitized.phone,
      address: sanitized.address,
      related_to: sanitized.related_to.length > 0 ? sanitized.related_to : null,
      pets: sanitized.pets.length > 0 ? sanitized.pets : null,
      trip_id: sanitized.trip_id,
      source_type: sanitized.source_type ?? 'other',
      source_id: sanitized.source_id,
      notes: sanitized.notes,
      website: sanitized.website,
      portal_url: sanitized.portal_url,
      portal_username: sanitized.portal_username,
      portal_password: portalPassword,
      is_emergency: sanitized.is_emergency,
      is_emergency_contact: sanitized.is_emergency,
      is_preferred: sanitized.is_preferred,
      is_archived: false,
      created_by: user.id,
      services_provided: servicesProvided.length > 0 ? servicesProvided : null,
      specialties: specialties.length > 0 ? specialties : null,
      account_number: accountNumber,
      hours_of_operation: hoursOfOperation,
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
      return jsonError('Failed to create contact', {
        status: 500,
        code: 'CONTACT_CREATE_FAILED',
        meta: { details: error.message },
      });
    }

    try {
      await syncPortalCredentialsForContact({
        ...(contact as any),
      }, { plainPassword: sanitized.portal_password ?? null });
    } catch (syncError) {
      console.error('[Contacts API POST] Failed to sync portal credentials', syncError);
    }

    return jsonSuccess({ contact }, { status: 201, legacy: { contact } });
  } catch (error) {
    console.error('Error in POST /api/contacts:', error);
    return jsonError('Internal server error', { status: 500, code: 'INTERNAL_ERROR' });
  }
}
