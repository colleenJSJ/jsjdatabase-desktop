import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cleanStringArray, sanitizeContactPayload } from '@/app/api/_helpers/contact-normalizer';
import { enforceCSRF } from '@/lib/security/csrf';
// Unified contacts sync is handled inline for pets to avoid duplicates

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const contactType = searchParams.get('type');
    const petId = searchParams.get('petId');
    
    // Build query using unified contacts table
    // Note: Removed pet_contact_pets join as table doesn't exist
    let query = supabase
      .from('contacts_unified')
      .select('*')
      .eq('module', 'pets')  // Use module instead of contact_type
      .order('name', { ascending: true });

    // Filter by contact subtype if provided (vet, groomer, etc)
    if (contactType && contactType !== 'all') {
      query = query.eq('contact_subtype', contactType);
    }

    // Filter by pet if provided
    if (petId) {
      query = query.contains('pets', [petId]);
    }

    const { data: contacts, error } = await query;

    if (error) {
      console.error('[Pet Contacts] Error fetching contacts:', {
        code: error.code,
        message: error.message,
        details: error.details
      });
      // If table doesn't exist, return empty array
      if (error.code === '42P01') {
        return NextResponse.json({ contacts: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Contacts already have pets array, just return them
    const transformedContacts = contacts || [];

    return NextResponse.json({ contacts: transformedContacts });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch pet contacts' },
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
    const petsList = cleanStringArray(body.pets);

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sanitized = sanitizeContactPayload({
      source_type: 'pets',
      source_page: 'pets',
      ...body,
      pets: petsList,
      related_to: body.related_to ?? petsList,
    });

    const insertData = {
      contact_type: 'pets',
      module: 'pets',
      category: 'Pets',
      contact_subtype: sanitized.contact_subtype ?? sanitized.category ?? 'vet',
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
      related_to: sanitized.related_to.length > 0 ? sanitized.related_to : petsList,
      pets: petsList,
      source_type: sanitized.source_type ?? 'pets',
      source_page: sanitized.source_page ?? 'pets',
      is_emergency: sanitized.is_emergency,
      is_favorite: sanitized.is_favorite,
      is_archived: sanitized.is_archived,
      created_by: user.id,
    };

    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[Pet Contacts] Error creating contact:', {
        code: error.code,
        message: error.message,
        details: error.details
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Tag the same record with source linkage for consistency
    // so future sync paths can find/update it
    try {
      await supabase
        .from('contacts_unified')
        .update({ source_type: 'pets', source_id: contact.id })
        .eq('id', contact.id);
    } catch (linkErr) {
      console.warn('[Pet Contacts] Failed to set source linkage:', linkErr);
    }

    // Return contact with pets array
    return NextResponse.json({ contact: { ...contact, pets: contact?.pets ?? petsList } });
  } catch (error) {
    console.error('Error creating pet contact:', error);
    return NextResponse.json(
      { error: 'Failed to create pet contact' },
      { status: 500 }
    );
  }
}
