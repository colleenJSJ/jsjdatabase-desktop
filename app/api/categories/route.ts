import { NextRequest, NextResponse } from 'next/server';
import { CategoriesService, CategoryModule } from '@/lib/categories/categories-service';
import { getCurrentUser } from '@/lib/auth/get-user';
import { enforceCSRF } from '@/lib/security/csrf';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const module = searchParams.get('module') as CategoryModule | null;

    const categories = await CategoriesService.getCategories(module || undefined);
    
    // Add cache control headers to prevent stale data
    return NextResponse.json(
      { categories },
      { 
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json({ categories: [] });
  }
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can add categories
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { name, module, color } = await request.json();
    
    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }

    if (!module || !['tasks', 'calendar', 'documents', 'passwords', 'contacts'].includes(module)) {
      return NextResponse.json(
        { error: 'Valid module is required (tasks, calendar, documents, passwords, or contacts)' },
        { status: 400 }
      );
    }

    const category = await CategoriesService.addCategory(name, module as CategoryModule, color);
    return NextResponse.json({ category });
  } catch (error) {

    const message = error instanceof Error ? error.message : 'Failed to add category';
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}