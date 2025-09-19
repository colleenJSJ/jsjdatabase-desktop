import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
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
      return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
    }

    return NextResponse.json({ contacts: contacts || [] });
  } catch (error) {
    console.error('Error in GET /api/contacts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;

    const body = await request.json();
    
    // Prepare contact data for unified table
    const contactData = {
      contact_type: 'general',
      module: 'general',
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      company: body.company || null,
      category: body.category || 'Other',
      related_to: body.related_to || [],
      source_type: body.source_type || 'other',
      source_id: body.source_id || null,
      notes: body.notes || null,
      website: body.website || null,
      portal_url: body.portal_url || null,
      portal_username: body.portal_username || null,
      portal_password: body.portal_password ? (await (async () => { const { encrypt } = await import('@/lib/encryption'); return encrypt(body.portal_password); })()) : null,
      is_emergency: body.is_emergency || false,
      is_archived: false,
      created_by: user.id
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
      return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
    }

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/contacts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
