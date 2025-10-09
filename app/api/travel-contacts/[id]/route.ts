import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { sanitizeContactPayload } from '@/app/api/_helpers/contact-normalizer';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

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
    const data = await request.json();
    const sanitized = sanitizeContactPayload({
      source_type: 'travel',
      source_page: 'travel',
      ...data,
    });

    const updateData = {
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
      updated_at: new Date().toISOString(),
    };

    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .update(updateData)
      .eq('id', id)
      .eq('contact_type', 'travel')
      .select()
      .single();

    if (error) {
      console.error('[Travel Contacts API] Failed to update contact:', error);
      return jsonError('Failed to update travel contact', { status: 500 });
    }

    return jsonSuccess({ contact }, { legacy: { contact } });
  } catch (error) {
    console.error('[Travel Contacts API] Error updating contact:', error);
    return jsonError('Internal server error', { status: 500 });
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
    
    const { error } = await supabase
      .from('contacts_unified')
      .delete()
      .eq('id', id)
      .eq('contact_type', 'travel');

    if (error) {
      console.error('[Travel Contacts API] Failed to delete contact:', error);
      return jsonError('Failed to delete travel contact', { status: 500 });
    }

    return jsonSuccess({ deleted: true }, { legacy: { success: true } });
  } catch (error) {
    console.error('[Travel Contacts API] Error deleting contact:', error);
    return jsonError('Internal server error', { status: 500 });
  }
}
