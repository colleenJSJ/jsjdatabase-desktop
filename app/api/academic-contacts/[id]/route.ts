import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceCSRF } from '@/lib/security/csrf';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: contact, error } = await supabase
      .from('j3_academics_contacts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching academic contact:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch children associations
    const { data: children } = await supabase
      .from('j3_academics_contact_children')
      .select('child_id')
      .eq('contact_id', id);
    
    const childIds = children?.map(c => c.child_id) || [];

    return NextResponse.json({ ...contact, children: childIds });
  } catch (error) {
    console.error('Error in GET /api/academic-contacts/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const { id } = await params;
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { children, ...contactData } = body;

    // Remove child_id from contactData as we'll use junction table
    delete contactData.child_id;

    const { data: contact, error: contactError } = await supabase
      .from('j3_academics_contacts')
      .update(contactData)
      .eq('id', id)
      .select()
      .single();

    if (contactError) {
      console.error('Error updating academic contact:', contactError);
      return NextResponse.json({ error: contactError.message }, { status: 500 });
    }

    // Update children associations
    // First, delete existing associations
    await supabase
      .from('j3_academics_contact_children')
      .delete()
      .eq('contact_id', id);

    // Then add new associations
    if (children && children.length > 0) {
      const childRecords = children.map((childId: string) => ({
        contact_id: id,
        child_id: childId
      }));

      const { error: childError } = await supabase
        .from('j3_academics_contact_children')
        .insert(childRecords);

      if (childError) {
        console.error('Error updating contact children:', childError);
      }
    }

    // Also sync to unified Contacts
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
          source_id: id,
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
      console.warn('[Academic Contacts] Sync update failed:', syncErr);
    }

    return NextResponse.json({ ...contact, children: children || [] });
  } catch (error) {
    console.error('Error in PUT /api/academic-contacts/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const { id } = await params;
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('j3_academics_contacts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting academic contact:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/academic-contacts/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
