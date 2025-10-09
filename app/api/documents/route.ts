import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { expandPersonReferences } from '@/app/api/_helpers/person-resolver';
import { applyPersonFilter } from '@/app/api/_helpers/apply-person-filter';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireUser(request);
    if (authResult instanceof Response) {
      return authResult;
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const sourcePage = searchParams.get('sourcePage');
    const limit = searchParams.get('limit');
    const selectedPerson = searchParams.get('selected_person');
    const showArchived = searchParams.get('show_archived') === 'true';
    const onlyArchived = searchParams.get('only_archived') === 'true';

    const { user, supabase } = authResult;
    
    let base = supabase.from('documents').select('*');

    const applyBaseFilters = (q: any) => {
      let qq = q;
      // Archived filtering
      if (!showArchived) {
        try { qq = qq.eq('is_archived', onlyArchived ? true : false); } catch {}
      } else if (onlyArchived) {
        try { qq = qq.eq('is_archived', true); } catch {}
      }
      if (category) qq = qq.eq('category', category.toLowerCase());
      if (sourcePage) qq = qq.eq('source_page', sourcePage.toLowerCase());
      qq = qq.order('created_at', { ascending: false });
      if (limit) qq = qq.limit(parseInt(limit));
      return qq;
    };
    
    // Archived filtering is handled inside applyBaseFilters via the query builder.

    // Person filtering path: build union of related_to and assigned_to without using OR on missing columns
    let documents: any[] | null = null;
    let error: any = null;
    if (selectedPerson && selectedPerson !== 'all') {
      try {
        const { resolvePersonReferences } = await import('@/app/api/_helpers/person-resolver');
        const resolved = await resolvePersonReferences(selectedPerson);
        const famId = Array.isArray(resolved) ? resolved[0] : resolved;
        if (famId) {
          const q1 = applyBaseFilters(base.contains('related_to', [famId]));
          const { data: d1, error: e1 } = await q1;
          if (e1) throw e1;
          let d2: any[] = [];
          try {
            const q2 = applyBaseFilters(base.contains('assigned_to', [famId]));
            const res2 = await q2;
            d2 = res2.data || [];
          } catch {}
          // Merge by id
          const map = new Map<string, any>();
          (d1 || []).forEach((doc: any) => map.set(doc.id, doc));
          (d2 || []).forEach((doc: any) => map.set(doc.id, doc));
          documents = Array.from(map.values());
        } else {
          documents = [];
        }
      } catch (e) {
        error = e;
      }
    } else {
      // No person filter: show all (with base filters)
      const { data, error: e } = await applyBaseFilters(base);
      documents = data || [];
      error = e;
    }

    if (error) {
      console.error('Database error:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      
      // Check if error is due to missing columns
      if (error.message?.includes('column') || error.code === '42703') {
        return jsonError('Database schema needs update. Please run the migration script.', {
          status: 500,
          meta: { details: error.message },
        });
      }
      
      return jsonError('Failed to fetch documents', {
        status: 500,
        meta: { details: error.message },
      });
    }

    // Transform documents to expand person references
    const transformedDocuments = await Promise.all(
      (documents || []).map(async (doc) => {
        // Expand person references to include names
        const expandedRelatedTo = await expandPersonReferences(doc.related_to || doc.assigned_to);
        
        return {
          ...doc,
          related_to: doc.related_to || doc.assigned_to || [], // Keep UUIDs for compatibility
          related_to_expanded: expandedRelatedTo, // Add expanded person objects
        };
      })
    );

    // Return in expected format with documents key
    return jsonSuccess({ documents: transformedDocuments }, {
      legacy: { documents: transformedDocuments },
    });
  } catch (error) {
    console.error('API error:', error);
    return jsonError('Internal server error', { status: 500 });
  }
}
