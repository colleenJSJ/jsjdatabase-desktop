import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireUser(request, { role: 'admin' });
    if (authResult instanceof Response) {
      return authResult;
    }

    const supabase = await createServiceClient();
    
    const { data: preferences, error } = await supabase
      .from('travel_preferences')
      .select(`
        *,
        users!inner(id, name, email)
      `)
      .order('users(name)', { ascending: true });

    if (error) {
      return jsonError('Failed to fetch all preferences', { status: 500 });
    }

    const payload = preferences || [];
    return jsonSuccess({ preferences: payload }, { legacy: { preferences: payload } });
  } catch (error) {
    return jsonError('Internal server error', { status: 500 });
  }
}
