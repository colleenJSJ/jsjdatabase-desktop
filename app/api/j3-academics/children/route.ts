import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-user';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('j3_academics')
      .select('*')
      .order('birthdate', { ascending: true }); // Oldest first
      
    if (error) {
      // If table doesn't exist, return empty array
      if (error.code === '42P01' || error.code === 'PGRST116') {
        console.log('[API/j3-academics/children] Table may not exist yet');
        return NextResponse.json([]);
      }
      
      console.error('[API/j3-academics/children] Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch children', details: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('[API/j3-academics/children] API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const supabase = await createClient();
    
    const { data: child, error } = await supabase
      .from('j3_academics')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[API/j3-academics/children] Error:', error);
      return NextResponse.json(
        { error: 'Failed to create child record', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ child });
  } catch (error) {
    console.error('[API/j3-academics/children] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}