import { NextRequest, NextResponse } from 'next/server';
import { CategoriesService } from '@/lib/categories/categories-service';
import { getCurrentUser } from '@/lib/auth/get-user';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can check category usage
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const categoryName = searchParams.get('name');

    if (!categoryName) {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }

    const usage = await CategoriesService.getCategoryUsage(categoryName);
    
    return NextResponse.json({ usage });
  } catch (error) {
    console.error('Error fetching category usage:', error);
    return NextResponse.json(
      { error: 'Failed to fetch category usage' },
      { status: 500 }
    );
  }
}