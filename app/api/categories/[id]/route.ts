import { NextRequest } from 'next/server';
import { CategoriesService, Category } from '@/lib/categories/categories-service';
import { requireUser } from '@/app/api/_helpers/auth';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  try {
    const authResult = await requireUser(request, { enforceCsrf: false, role: 'admin' });
    if (authResult instanceof Response) {
      return authResult;
    }

    const updates = (await request.json()) as Partial<Category>;
    const category = await CategoriesService.updateCategory(id, updates);
    return jsonSuccess({ category }, { legacy: { category } });
  } catch (error) {
    console.error('Error updating category:', error);
    return jsonError('Failed to update category', { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  try {
    const authResult = await requireUser(request, { enforceCsrf: false, role: 'admin' });
    if (authResult instanceof Response) {
      return authResult;
    }

    // Check if force parameter is provided in the query string
    const searchParams = request.nextUrl.searchParams;
    const force = searchParams.get('force') === 'true';

    const result = await CategoriesService.deleteCategory(id, force);
    
    // If deletion was not successful due to usage, return usage information
    if (!result.success) {
      return jsonSuccess({ usage: result.usage, message: result.message }, {
        status: 409,
        legacy: {
          success: false,
          usage: result.usage,
          message: result.message,
        },
      });
    }

    return jsonSuccess({ deleted: true, message: result.message }, {
      legacy: {
        success: true,
        message: result.message,
      },
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete category';
    return jsonError(message, { status: 500 });
  }
}
