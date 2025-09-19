import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';
import { applyPersonFilter } from '@/app/api/_helpers/apply-person-filter';
import { resolvePersonReferences } from '@/app/api/_helpers/person-resolver';

export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get('trip_id');
    const selectedPerson = searchParams.get('selected_person') || undefined;

    const shouldFilterByPerson = Boolean(selectedPerson && selectedPerson !== 'all');
    const selectedParam = shouldFilterByPerson ? undefined : selectedPerson;

    let query = supabase
      .from('contacts_unified')
      .select('*')
      .eq('contact_type', 'travel');

    if (tripId && tripId !== 'all') {
      query = query.eq('trip_id', tripId);
    }

    query = await applyPersonFilter({
      query,
      selectedPerson: selectedParam,
      userId: user.id,
      module: 'travel_contacts',
      columnName: 'related_to',
      isAdmin: user.role === 'admin',
    });
    let response;
    if (query && typeof (query as any)?.order === 'function') {
      response = await query.order('name', { ascending: true });
    } else {
      // If filtering already executed the query, just await the result directly
      response = await query;
    }

    const { data: contacts, error } = response || { data: null, error: null };

    if (error) {
      console.error('[Travel Contacts API] Failed to fetch contacts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch travel contacts' },
        { status: 500 }
      );
    }

    let filteredContacts = contacts || [];
    if (shouldFilterByPerson && selectedPerson && Array.isArray(filteredContacts)) {
      const { resolvePersonReferences } = await import('@/app/api/_helpers/person-resolver');
      const resolved = await resolvePersonReferences(selectedPerson);
      const ids = new Set<string>();
      if (resolved) {
        const list = Array.isArray(resolved) ? resolved : [resolved];
        list.filter(Boolean).forEach(id => ids.add(String(id)));
      }

      filteredContacts = filteredContacts.filter(contact => {
        const related = Array.isArray((contact as any).related_to)
          ? (contact as any).related_to.filter(Boolean)
          : [];
        if (contact.created_by === user.id) return true;
        if (related.length === 0) return true;
        if (ids.size === 0) return false;
        return related.some((rid: string) => ids.has(String(rid)));
      });
    }

    return NextResponse.json({ contacts: filteredContacts });
  } catch (error) {
    console.error('[Travel Contacts API] Error fetching contacts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;
    const data = await request.json();
    
    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .insert({
        contact_type: 'travel',
        module: 'travel',
        category: data.category || 'Travel',
        contact_subtype: data.contact_type || 'other',
        name: data.name,
        company: data.company || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        notes: data.notes || null,
        is_preferred: data.is_preferred || false,
        trip_id: data.trip_id || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[Travel Contacts API] Failed to create contact:', error);
      return NextResponse.json(
        { error: 'Failed to create travel contact' },
        { status: 500 }
      );
    }

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('[Travel Contacts API] Error creating contact:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
