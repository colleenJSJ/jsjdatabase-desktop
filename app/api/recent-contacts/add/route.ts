import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const { emails } = body;

    if (!emails || !Array.isArray(emails)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Process each email
    const results = [];
    for (const emailEntry of emails) {
      const email = typeof emailEntry === 'string' ? emailEntry : emailEntry.email;
      const name = typeof emailEntry === 'string' ? null : emailEntry.name;

      if (!email || !email.includes('@')) {
        continue; // Skip invalid emails
      }

      // Check if contact already exists
      const { data: existingContact, error: checkError } = await supabase
        .from('recent_contacts')
        .select('*')
        .eq('user_id', user.id)
        .eq('email', email.toLowerCase())
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Error checking existing contact:', checkError);
        continue;
      }

      if (existingContact) {
        // Update existing contact
        const { data: updated, error: updateError } = await supabase
          .from('recent_contacts')
          .update({
            use_count: existingContact.use_count + 1,
            last_used: new Date().toISOString(),
            name: name || existingContact.name // Update name if provided
          })
          .eq('id', existingContact.id)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating contact:', updateError);
        } else {
          results.push(updated);
        }
      } else {
        // Insert new contact
        const { data: inserted, error: insertError } = await supabase
          .from('recent_contacts')
          .insert({
            user_id: user.id,
            email: email.toLowerCase(),
            name: name,
            use_count: 1,
            last_used: new Date().toISOString()
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error inserting contact:', insertError);
        } else {
          results.push(inserted);
        }
      }
    }

    return NextResponse.json({ 
      success: true,
      contacts: results
    });

  } catch (error) {
    console.error('Error in POST /api/recent-contacts/add:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}