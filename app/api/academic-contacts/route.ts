import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceCSRF } from '@/lib/security/csrf';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const childId = searchParams.get('childId');

    let query = supabase
      .from('j3_academics_contacts')
      .select('*')
      .order('contact_name');

    const { data: contacts, error } = await query;

    if (error) {
      console.error('Error fetching academic contacts:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch children associations for each contact
    if (contacts && contacts.length > 0) {
      const contactsWithChildren = await Promise.all(
        contacts.map(async (contact) => {
          const { data: children } = await supabase
            .from('j3_academics_contact_children')
            .select('child_id')
            .eq('contact_id', contact.id);
          
          const childIds = children?.map(c => c.child_id) || [];
          
          // Filter by childId if specified
          if (childId && childId !== 'all' && !childIds.includes(childId)) {
            return null;
          }
          
          return {
            ...contact,
            children: childIds
          };
        })
      );
      
      // Filter out null values (contacts that don't match the childId filter)
      const filteredContacts = contactsWithChildren.filter(c => c !== null);
      return NextResponse.json(filteredContacts);
    }

    return NextResponse.json([]);
  } catch (error) {
    console.error('Error in GET /api/academic-contacts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    console.log('Received contact data:', body);
    
    const { children, ...contactData } = body;

    // Remove child_id from contactData as we'll use junction table
    delete contactData.child_id;

    // Ensure we have required fields
    if (!contactData.contact_name) {
      return NextResponse.json({ error: 'Contact name is required' }, { status: 400 });
    }

    const { data: contact, error: contactError } = await supabase
      .from('j3_academics_contacts')
      .insert({
        ...contactData,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (contactError) {
      console.error('Error creating academic contact:', contactError);
      return NextResponse.json({ error: contactError.message }, { status: 500 });
    }

    // Add children associations
    if (contact && children && children.length > 0) {
      const childRecords = children.map((childId: string) => ({
        contact_id: contact.id,
        child_id: childId
      }));

      const { error: childError } = await supabase
        .from('j3_academics_contact_children')
        .insert(childRecords);

      if (childError) {
        console.error('Error adding contact children:', childError);
      }
    }

    // Sync to unified Contacts with category and related people
    try {
      await fetch(`${request.nextUrl.origin}/api/contacts/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': request.headers.get('Authorization') || '',
          'Cookie': request.headers.get('Cookie') || ''
        },
        body: JSON.stringify({
          source_type: 'academics',
          source_id: contact.id,
          contact_data: {
            name: contact.contact_name,
            email: contact.email,
            phone: contact.phone,
            address: null,
            company: contact.role || contact.category,
            related_to: children || [],
            notes: contact.notes,
            website: null
          }
        })
      });
    } catch (syncErr) {
      console.warn('[Academic Contacts] Sync to unified contacts failed:', syncErr);
    }

    return NextResponse.json({ ...contact, children: children || [] });
  } catch (error) {
    console.error('Error in POST /api/academic-contacts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
