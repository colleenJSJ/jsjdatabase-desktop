import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, requireAdmin } from '@/app/api/_helpers/auth';
import { syncAcademicContactToUnified } from '@/app/api/_helpers/contact-sync';

export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser();
    
    if ('error' in authResult) {
      return authResult.error;
    }

    const { searchParams } = new URL(request.url);
    const childId = searchParams.get('child_id');
    
    const supabase = await createServiceClient();
    
    let query = supabase.from('j3_academics_contacts').select('*');
    
    if (childId && childId !== 'all') {
      query = query.eq('child_id', childId);
    }
    
    const { data, error } = await query.order('contact_name');
      
    if (error) {
      // If table doesn't exist, return empty array
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json([]);
      }
      
      console.error('[API/j3-academics/contacts] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch contacts', details: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('[API/j3-academics/contacts] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    
    if ('error' in authResult) {
      return authResult.error;
    }

    const data = await request.json();
    const supabase = await createServiceClient();
    
    const { data: contact, error } = await supabase
      .from('j3_academics_contacts')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[API/j3-academics/contacts] Error:', error);
      return NextResponse.json(
        { error: 'Failed to create contact', details: error.message },
        { status: 500 }
      );
    }

    // Sync to unified contacts table
    await syncAcademicContactToUnified(contact);

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('[API/j3-academics/contacts] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}