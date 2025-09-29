import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
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
      return NextResponse.json({ 
        categories: ['Health', 'Household', 'Pets', 'Travel', 'J3 Academics', 'Other'] 
      });
    }

    // Transform to simple array of category names
    const categoryNames = categories?.map(cat => cat.name) || ['Health', 'Household', 'Pets', 'Travel', 'J3 Academics', 'Other'];

    return NextResponse.json({ categories: categoryNames });
  } catch (error) {
    console.error('Error in GET /api/contacts/categories:', error);
    return NextResponse.json({ 
      categories: ['Health', 'Household', 'Pets', 'Travel', 'J3 Academics', 'Other'] 
    });
  }
}
