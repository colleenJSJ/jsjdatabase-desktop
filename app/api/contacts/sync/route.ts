import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { cleanStringArray, sanitizeContactPayload, cleanNullableString } from '@/app/api/_helpers/contact-normalizer';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

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
    const { source_type, source_id, contact_data } = body;

    if (!source_type || !source_id || !contact_data) {
      return jsonError('Missing required fields: source_type, source_id, contact_data', {
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    // Check if contact already exists for this source in unified table
    const { data: existingContact, error: checkError } = await supabase
      .from('contacts_unified')
      .select('id')
      .eq('source_type', source_type)
      .eq('source_id', source_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing contact:', checkError);
      return jsonError('Failed to check existing contact', {
        status: 500,
        code: 'CONTACT_CHECK_FAILED',
        meta: { details: checkError.message },
      });
    }

    const sanitized = sanitizeContactPayload(contact_data);

    const encryptedPortalPassword = sanitized.portal_password
      ? await (async () => {
          const { encrypt } = await import('@/lib/encryption');
          return await encrypt(sanitized.portal_password as string);
        })()
      : null;

    const servicesProvided = cleanStringArray(contact_data?.services_provided);
    const specialties = cleanStringArray(contact_data?.specialties);
    const accountNumber = cleanNullableString(contact_data?.account_number);
    const hoursOfOperation = cleanNullableString(contact_data?.hours_of_operation);

    const relatedTo = sanitized.related_to.length > 0
      ? sanitized.related_to
      : cleanStringArray(contact_data?.patients, contact_data?.pets);

    const contactRecord = {
      contact_type: 'general',
      module: source_type,
      name: sanitized.name,
      company: sanitized.company || (contact_data.specialty ?? null),
      category: getCategoryFromSource(source_type),
      contact_subtype: sanitized.contact_subtype,
      email: sanitized.email,
      phone: sanitized.phone,
      address: sanitized.address,
      related_to: relatedTo.length > 0 ? relatedTo : null,
      pets: sanitized.pets.length > 0 ? sanitized.pets : null,
      source_type,
      source_id,
      notes: sanitized.notes,
      website: sanitized.website,
      portal_url: sanitized.portal_url,
      portal_username: sanitized.portal_username,
      portal_password: encryptedPortalPassword,
      is_emergency: sanitized.is_emergency,
      is_emergency_contact: sanitized.is_emergency,
      is_preferred: sanitized.is_preferred,
      is_archived: sanitized.is_archived,
      created_by: user.id,
      services_provided: servicesProvided.length > 0 ? servicesProvided : null,
      specialties: specialties.length > 0 ? specialties : null,
      account_number: accountNumber,
      hours_of_operation: hoursOfOperation,
    };

    if (existingContact) {
      // Update existing contact in unified table
      const { data: updatedContact, error: updateError } = await supabase
        .from('contacts_unified')
        .update({
          ...contactRecord,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingContact.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating synced contact:', updateError);
        return jsonError('Failed to update synced contact', {
          status: 500,
          code: 'CONTACT_SYNC_UPDATE_FAILED',
          meta: { details: updateError.message },
        });
      }

      return jsonSuccess({ contact: updatedContact, action: 'updated' }, {
        legacy: { contact: updatedContact, action: 'updated' },
      });
    } else {
      // Create new contact in unified table
      const { data: newContact, error: insertError } = await supabase
        .from('contacts_unified')
        .insert(contactRecord)
        .select()
        .single();

      if (insertError) {
        console.error('Error creating synced contact:', insertError);
        return jsonError('Failed to create synced contact', {
          status: 500,
          code: 'CONTACT_SYNC_CREATE_FAILED',
          meta: { details: insertError.message },
        });
      }

      return jsonSuccess({ contact: newContact, action: 'created' }, {
        status: 201,
        legacy: { contact: newContact, action: 'created' },
      });
    }
  } catch (error) {
    console.error('Error in POST /api/contacts/sync:', error);
    return jsonError('Internal server error', { status: 500, code: 'INTERNAL_ERROR' });
  }
}

// Helper function to determine category based on source type
function getCategoryFromSource(sourceType: string): string {
  switch (sourceType) {
    case 'health':
      return 'Health';
    case 'household':
      return 'Household';
    case 'pets':
      return 'Pets';
    case 'academics':
      return 'J3 Academics';
    default:
      return 'Other';
  }
}
