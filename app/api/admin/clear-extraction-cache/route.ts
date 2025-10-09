import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function DELETE(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;

    // Optional: Add admin check here if you want to restrict this
    // For now, users can only clear their own cache

    // Clear extraction_cache_v2 for current user
    const { error: v2Error, count: v2Count } = await supabase
      .from('extraction_cache_v2')
      .delete()
      .eq('user_id', user.id)
      .select({ count: 'exact', head: true } as any);

    if (v2Error && v2Error.code !== 'PGRST116') {
      console.error('Error clearing extraction_cache_v2:', v2Error);
    }

    // Clear extraction_cache (legacy) for current user
    const { error: v1Error, count: v1Count } = await supabase
      .from('extraction_cache')
      .delete()
      .eq('user_id', user.id)
      .select({ count: 'exact', head: true } as any);

    if (v1Error && v1Error.code !== 'PGRST116') {
      console.error('Error clearing extraction_cache:', v1Error);
    }

    const cleared = {
      extraction_cache_v2: v2Count || 0,
      extraction_cache: v1Count || 0,
    };

    return jsonSuccess({ cleared }, {
      legacy: {
        success: true,
        message: 'Extraction cache cleared successfully',
        cleared,
      },
    });
  } catch (error) {
    console.error('Error clearing extraction cache:', error);
    return jsonError('Failed to clear extraction cache', { status: 500 });
  }
}

// GET endpoint to check cache status
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;

    // Get count of cached entries for current user
    const { count: v2Count } = await supabase
      .from('extraction_cache_v2')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { count: v1Count } = await supabase
      .from('extraction_cache')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const payload = {
      extraction_cache_v2: v2Count || 0,
      extraction_cache: v1Count || 0,
      total: (v2Count || 0) + (v1Count || 0),
    };

    return jsonSuccess(payload, { legacy: payload });
  } catch (error) {
    console.error('Error checking extraction cache:', error);
    return jsonError('Failed to check extraction cache', { status: 500 });
  }
}
