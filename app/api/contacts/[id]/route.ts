import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { sanitizeContactPayload, cleanStringArray, cleanNullableString } from '@/app/api/_helpers/contact-normalizer';
import { enforceCSRF } from '@/lib/security/csrf';
import {
  syncPortalCredentialsForContact,
  deletePortalCredentialsForContact,
} from '@/app/api/_helpers/contact-portal-sync';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;

    // Fetch contact by ID from unified table
    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return jsonError('Contact not found', { status: 404, code: 'CONTACT_NOT_FOUND' });
      }
      console.error('Error fetching contact:', error);
      try {
        const { logRlsDenied } = await import('@/lib/utils/db-telemetry');
        await logRlsDenied({ userId: user.id, error, endpoint: `/api/contacts/${id}`, entityType: 'contact', entityId: id, page: 'household' });
      } catch {}
      return jsonError('Failed to fetch contact', {
        status: 500,
        code: 'CONTACT_FETCH_FAILED',
        meta: { details: error.message },
      });
    }

    return jsonSuccess({ contact }, { legacy: { contact } });
  } catch (error) {
    console.error('Error in GET /api/contacts/[id]:', error);
    return jsonError('Internal server error', { status: 500, code: 'INTERNAL_ERROR' });
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
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;

    const body = await request.json();
    const sanitized = sanitizeContactPayload(body);

    let plainPortalPassword: string | null | undefined = undefined;
    if (Object.prototype.hasOwnProperty.call(body as Record<string, unknown>, 'portal_password')) {
      plainPortalPassword = sanitized.portal_password ? sanitized.portal_password : null;
    }

    const servicesProvided = cleanStringArray(body.services_provided);
    const specialties = cleanStringArray(body.specialties);
    const accountNumber = cleanNullableString(body.account_number);
    const hoursOfOperation = cleanNullableString(body.hours_of_operation);

    const updateData: Record<string, unknown> = {
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
      is_emergency: sanitized.is_emergency,
      is_emergency_contact: sanitized.is_emergency,
      is_preferred: sanitized.is_preferred,
      is_archived: sanitized.is_archived,
      updated_at: new Date().toISOString(),
      services_provided: servicesProvided.length > 0 ? servicesProvided : null,
      specialties: specialties.length > 0 ? specialties : null,
      account_number: accountNumber,
      hours_of_operation: hoursOfOperation,
    };

    if (Object.prototype.hasOwnProperty.call(body as Record<string, unknown>, 'portal_password')) {
      if (!sanitized.portal_password) {
        updateData.portal_password = null;
      } else {
        const { encrypt } = await import('@/lib/encryption');
        updateData.portal_password = await encrypt(sanitized.portal_password);
      }
    }

    // Update contact in unified table
    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return jsonError('Contact not found', { status: 404, code: 'CONTACT_NOT_FOUND' });
      }
      console.error('Error updating contact:', error);
      try {
        const { logRlsDenied } = await import('@/lib/utils/db-telemetry');
        await logRlsDenied({ userId: user.id, error, endpoint: `/api/contacts/${id}`, entityType: 'contact', entityId: id, page: 'household' });
      } catch {}
      return jsonError('Failed to update contact', {
        status: 500,
        code: 'CONTACT_UPDATE_FAILED',
        meta: { details: error.message },
      });
    }

    try {
      await syncPortalCredentialsForContact(contact as any, {
        plainPassword: plainPortalPassword,
      });
    } catch (syncError) {
      console.error('[Contacts API PUT] Failed to sync portal credentials', syncError);
    }

    return jsonSuccess({ contact }, { legacy: { contact } });
  } catch (error) {
    console.error('Error in PUT /api/contacts/[id]:', error);
    return jsonError('Internal server error', { status: 500, code: 'INTERNAL_ERROR' });
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
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;

    // Check if user is admin or creator
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.error('Error fetching user role:', userError);
      return jsonError('Failed to verify permissions', {
        status: 500,
        code: 'PERMISSION_CHECK_FAILED',
        meta: { details: userError.message },
      });
    }

    // Get the contact to check creator from unified table
    const { data: contact, error: fetchError } = await supabase
      .from('contacts_unified')
      .select(
        `
          id,
          created_by,
          module,
          contact_type,
          category,
          source_type,
          source_id,
          portal_url,
          portal_username,
          portal_password,
          related_to,
          pets,
          services_provided,
          specialties,
          account_number,
          notes,
          hours_of_operation
        `
      )
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return jsonError('Contact not found', { status: 404, code: 'CONTACT_NOT_FOUND' });
      }
      return jsonError('Failed to fetch contact', {
        status: 500,
        code: 'CONTACT_FETCH_FAILED',
        meta: { details: fetchError.message },
      });
    }

    // Check permissions
    if (userRecord.role !== 'admin' && contact.created_by !== user.id) {
      return jsonError('Forbidden', { status: 403, code: 'FORBIDDEN' });
    }

    try {
      await deletePortalCredentialsForContact(contact as any);
    } catch (syncError) {
      console.error('[Contacts API DELETE] Failed to remove portal credentials', syncError);
    }

    // Delete contact from unified table
    const { error } = await supabase
      .from('contacts_unified')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting contact:', error);
      try {
        const { logRlsDenied } = await import('@/lib/utils/db-telemetry');
        await logRlsDenied({ userId: user.id, error, endpoint: `/api/contacts/${id}`, entityType: 'contact', entityId: id, page: 'household' });
      } catch {}
      return jsonError('Failed to delete contact', {
        status: 500,
        code: 'CONTACT_DELETE_FAILED',
        meta: { details: error.message },
      });
    }

    return jsonSuccess({ deleted: true });
  } catch (error) {
    console.error('Error in DELETE /api/contacts/[id]:', error);
    return jsonError('Internal server error', { status: 500, code: 'INTERNAL_ERROR' });
  }
}
