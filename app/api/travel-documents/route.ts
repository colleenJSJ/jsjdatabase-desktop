import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, requireAdmin } from '@/app/api/_helpers/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const searchParams = request.nextUrl.searchParams;
    const trip_id = searchParams.get('trip_id');

    const { user, supabase } = authResult;
    
    let query = supabase
      .from('documents')
      .select('*')
      .eq('uploaded_by', user.id)
      .eq('category', 'travel')
      .order('created_at', { ascending: false });

    if (trip_id) {
      query = query.eq('trip_id', trip_id);
    }

    const { data: documents, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch travel documents' },
        { status: 500 }
      );
    }

    return NextResponse.json({ documents: documents || [] });
  } catch (error) {
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

    const data = await request.json();
    const { user, supabase } = authResult;
    
    const { data: document, error } = await supabase
      .from('documents')
      .insert({
        category: 'travel',
        source: 'travel',
        source_reference: data.trip_id || null,
        uploaded_by: user.id,
        trip_id: data.trip_id || null,
        title: data.document_name,
        file_name: data.file_name || data.document_name,
        file_url: data.file_url || null,
        file_size: data.file_size || null,
        file_type: data.file_type || data.document_type || null,
        expiration_date: data.expiry_date || null,
        description: data.notes || null,
        document_type: data.document_type,
        metadata: {
          document_number: data.document_number || null
        },
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create travel document' },
        { status: 500 }
      );
    }

    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}