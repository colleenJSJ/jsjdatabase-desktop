import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return jsonError('Unauthorized', { status: 401 });
    }

    const { ids } = await request.json();
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return jsonError('Document IDs are required', { status: 400 });
    }

    // Fetch documents by IDs
    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .in('id', ids);

    if (error) {
      console.error('Failed to fetch documents by IDs:', error);
      return jsonError('Failed to fetch documents', { status: 500 });
    }

    const payload = documents || [];
    return jsonSuccess({ documents: payload }, { legacy: { documents: payload } });
  } catch (error) {
    console.error('Documents by IDs API error:', error);
    return jsonError('Internal server error', { status: 500 });
  }
}
