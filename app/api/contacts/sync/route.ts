import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';

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

    // Prepare contact data for unified table
    const contactRecord = {
      contact_type: 'general',
      module: source_type,
      name: contact_data.name,
      email: contact_data.email || null,
      phone: contact_data.phone || null,
      address: contact_data.address || null,
      company: contact_data.company || contact_data.specialty || null, // For doctors, use specialty as company
      category: getCategoryFromSource(source_type),
      related_to: contact_data.related_to || contact_data.patients || contact_data.pets || [],
      source_type,
      source_id,
      notes: contact_data.notes || null,
      website: contact_data.website || null,
      portal_url: contact_data.portal_url || null,
      portal_username: contact_data.portal_username || null,
      portal_password: contact_data.portal_password || null,
      is_emergency: contact_data.is_emergency || false,
      is_archived: false,
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