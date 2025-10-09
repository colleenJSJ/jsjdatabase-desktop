import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireUser(request);
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;

    // Fetch contact categories from unified categories table
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .eq('module', 'contacts')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[Contacts Categories] Error fetching categories:', {
        code: error.code,
        message: error.message,
        details: error.details
      });
      // Return default categories if table doesn't exist or error occurs
      const fallback = ['Health', 'Household', 'Pets', 'Travel', 'J3 Academics', 'Other'];
      return jsonSuccess({ categories: fallback }, { legacy: { categories: fallback } });
    }

    // Transform to simple array of category names
    const categoryNames = categories?.map(cat => cat.name) || ['Health', 'Household', 'Pets', 'Travel', 'J3 Academics', 'Other'];

    return jsonSuccess({ categories: categoryNames }, { legacy: { categories: categoryNames } });
  } catch (error) {
    console.error('Error in GET /api/contacts/categories:', error);
    const fallback = ['Health', 'Household', 'Pets', 'Travel', 'J3 Academics', 'Other'];
    return jsonSuccess({ categories: fallback }, { legacy: { categories: fallback } });
  }
}
