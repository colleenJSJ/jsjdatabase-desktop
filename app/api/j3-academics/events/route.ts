import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  
  const searchParams = request.nextUrl.searchParams;
  const childId = searchParams.get('child_id');
  
  let query = supabase
    .from('j3_academics_events')
    .select(`
      *,
      j3_academics:j3_academics_children(
        child_name,
        grade,
        school_name
      )
    `)
    .order('event_date', { ascending: true });
  
  if (childId) {
    query = query.eq('child_id', childId);
  }
  
  const { data, error } = await query;
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  
  const body = await request.json();
  
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { data, error } = await supabase
    .from('j3_academics_events')
    .insert({
      ...body,
      created_by: userData.user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}