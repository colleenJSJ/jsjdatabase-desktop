import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { enforceCSRF } from '@/lib/security/csrf';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  
  const searchParams = request.nextUrl.searchParams;
  const childId = searchParams.get('child_id');
  
  let query = supabase
    .from('documents')
    .select('*')
    .in('category', ['education', 'school'])
    .order('created_at', { ascending: false });
  
  if (childId) {
    query = query.eq('source_reference', childId);
  }
  
  const { data, error } = await query;
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  
  const body = await request.json();
  
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { data, error } = await supabase
    .from('documents')
    .insert({
      title: body.document_title || body.title,
      file_name: body.document_title || body.title || 'academic_document',
      file_url: body.file_url,
      file_type: body.document_type || body.file_type,
      category: 'education',
      source: 'academic',
      source_reference: body.child_id?.toString() || null,
      description: body.notes || null,
      uploaded_by: userData.user.id,
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
