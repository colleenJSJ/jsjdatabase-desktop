import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';
import { cleanStringArray, sanitizeContactPayload } from '@/app/api/_helpers/contact-normalizer';

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;

    const body = await request.json();
    const { source_type, source_id, contact_data } = body;

    if (!source_type || !source_id || !contact_data) {
      return NextResponse.json({ 
        error: 'Missing required fields: source_type, source_id, contact_data' 
      }, { status: 400 });
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
      return NextResponse.json({ error: 'Failed to check existing contact' }, { status: 500 });
    }

    const sanitized = sanitizeContactPayload(contact_data);

    const encryptedPortalPassword = sanitized.portal_password
      ? await (async () => {
          const { encrypt } = await import('@/lib/encryption');
          return encrypt(sanitized.portal_password as string);
        })()
      : null;

    const contactRecord = {
      contact_type: 'general',
      module: source_type,
      name: sanitized.name,
      company: sanitized.company || (contact_data.specialty ?? null),
      category: getCategoryFromSource(source_type),
      contact_subtype: sanitized.contact_subtype,
      email: sanitized.email,
      emails: sanitized.emails,
      phone: sanitized.phone,
      phones: sanitized.phones,
      address: sanitized.address,
      addresses: sanitized.addresses,
      tags: sanitized.tags,
      related_to: sanitized.related_to.length > 0
        ? sanitized.related_to
        : cleanStringArray(contact_data?.patients, contact_data?.pets),
      source_type,
      source_page: sanitized.source_page ?? source_type,
      source_id,
      notes: sanitized.notes,
      website: sanitized.website,
      portal_url: sanitized.portal_url,
      portal_username: sanitized.portal_username,
      portal_password: encryptedPortalPassword,
      is_emergency: sanitized.is_emergency,
      is_archived: sanitized.is_archived,
      created_by: user.id
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
        return NextResponse.json({ error: 'Failed to update synced contact' }, { status: 500 });
      }

      return NextResponse.json({ 
        contact: updatedContact,
        action: 'updated'
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
        return NextResponse.json({ error: 'Failed to create synced contact' }, { status: 500 });
      }

      return NextResponse.json({ 
        contact: newContact,
        action: 'created'
      }, { status: 201 });
    }
  } catch (error) {
    console.error('Error in POST /api/contacts/sync:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
