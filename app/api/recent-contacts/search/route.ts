import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get search query
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');
    
    if (!query || query.length < 2) {
      return NextResponse.json({ contacts: [] });
    }

    // Search recent contacts by email or name
    const { data: contacts, error } = await supabase
      .from('recent_contacts')
      .select('*')
      .eq('user_id', user.id)
      .or(`email.ilike.%${query}%,name.ilike.%${query}%`)
      .order('use_count', { ascending: false })
      .order('last_used', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error searching recent contacts:', error);
      return NextResponse.json({ error: 'Failed to search contacts' }, { status: 500 });
    }

    // Format response to match expected structure
    const formattedContacts = (contacts || []).map(contact => ({
      name: contact.name || contact.email,
      email: contact.email,
      source: 'recent',
      use_count: contact.use_count,
      last_used: contact.last_used
    }));

    return NextResponse.json({ 
      contacts: formattedContacts
    });

  } catch (error) {
    console.error('Error in GET /api/recent-contacts/search:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}