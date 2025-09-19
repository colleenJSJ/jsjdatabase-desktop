import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncContactToContactsTable } from '@/lib/utils/sync-contact';

export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data: contacts, error } = await supabase
      .from('contacts_unified')
      .select('*')
      .eq('contact_type', 'household')
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ contacts: contacts || [] });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    // Add contact_type and module for unified table
    const contactData = {
      ...body,
      contact_type: 'household',
      module: 'household'
    };

    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .insert(contactData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // No longer need to sync - using unified table directly

    return NextResponse.json({ contact });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create contact' },
      { status: 500 }
    );
  }
}