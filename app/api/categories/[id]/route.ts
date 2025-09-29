import { NextRequest, NextResponse } from 'next/server';
import { CategoriesService, Category } from '@/lib/categories/categories-service';
import { getAuthenticatedUser, requireAdmin } from '@/app/api/_helpers/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    // Only admins can update categories
    if (authResult.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updates = await request.json() as Partial<Category>;
    const category = await CategoriesService.updateCategory(id, updates);
    return NextResponse.json({ category });
  } catch (error) {
    console.error('Error updating category:', error);
    return NextResponse.json(
      { error: 'Failed to update category' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    // Only admins can delete categories
    if (authResult.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if force parameter is provided in the query string
    const searchParams = request.nextUrl.searchParams;
    const force = searchParams.get('force') === 'true';

    const result = await CategoriesService.deleteCategory(id, force);
    
    // If deletion was not successful due to usage, return usage information
    if (!result.success) {
      return NextResponse.json({
        success: false,
        usage: result.usage,
        message: result.message
      }, { status: 409 }); // 409 Conflict - indicates resource is in use
    }

    return NextResponse.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete category';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}