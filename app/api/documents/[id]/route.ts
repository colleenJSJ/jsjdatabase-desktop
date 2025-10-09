import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { getBackblazeService } from '@/lib/backblaze/b2-service';

const resolveFilePath = (fileName?: string | null, fileUrl?: string | null): string | null => {
  if (fileName) return fileName;
  if (fileUrl && fileUrl.includes('/file/')) {
    const afterFile = fileUrl.split('/file/')[1];
    if (afterFile) {
      const parts = afterFile.split('/');
      if (parts.length > 1) {
        return parts.slice(1).join('/');
      }
    }
  }
  return null;
};
import { ActivityLogger } from '@/lib/services/activity-logger';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;

    // Get document details
    const { data: document, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !document) {
      return jsonError('Document not found', { status: 404 });
    }

    // Check if user has permission to download (admin or document owner)
    if (user.role !== 'admin' && document.uploaded_by !== user.id) {
      return jsonError('Forbidden', { status: 403 });
    }

    // Return document info with file URL for download
    return jsonSuccess({
      document: {
        ...document,
        download_url: document.file_url,
      },
    }, { legacy: {
      document: {
        ...document,
        download_url: document.file_url,
      },
    } });
  } catch (error) {

    return jsonError('Failed to fetch document', { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;
    const body = await request.json();

    // Get document to check permissions
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !document) {
      return jsonError('Document not found', { status: 404 });
    }

    // Check permissions - user can update if they're admin or assigned to the document
    const canUpdate = user.role === 'admin' || 
      document.assigned_to?.includes(user.id) || 
      document.assigned_to?.includes('shared');

    if (!canUpdate) {
      return jsonError('Forbidden', { status: 403 });
    }

    // Update only allowed fields
    const allowedUpdates: any = {};
    const changes: Record<string, { from: any; to: any }> = {};
    
    if (body.is_starred !== undefined && body.is_starred !== document.is_starred) {
      allowedUpdates.is_starred = body.is_starred;
      changes.starred = { from: document.is_starred, to: body.is_starred };
    }
    if (body.tags !== undefined && JSON.stringify(body.tags) !== JSON.stringify(document.tags)) {
      allowedUpdates.tags = body.tags;
      changes.tags = { from: document.tags, to: body.tags };
    }
    if (body.description !== undefined && body.description !== document.description) {
      allowedUpdates.description = body.description;
      changes.description = { from: document.description, to: body.description };
    }
    if (body.expiration_date !== undefined && body.expiration_date !== document.expiration_date) {
      allowedUpdates.expiration_date = body.expiration_date;
      changes.expiration_date = { from: document.expiration_date, to: body.expiration_date };
    }

    // Update document
    const { data: updatedDoc, error: updateError } = await supabase
      .from('documents')
      .update(allowedUpdates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return jsonError('Failed to update document', {
        status: 500,
        meta: { details: updateError.message },
      });
    }

    // Log the activity if there were changes
    if (Object.keys(changes).length > 0) {
      await ActivityLogger.logDocumentActivity(
        user.id,
        'updated',
        updatedDoc,
        { changes }
      );
    }

    return jsonSuccess(updatedDoc, { legacy: updatedDoc });
  } catch (error) {
    console.error('PATCH error:', error);
    return jsonError('Failed to update document', { status: 500 });
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

    const { user, supabase } = authResult;

    // Only admins can delete documents
    if (user.role !== 'admin') {
      return jsonError('Only administrators can delete documents', { status: 403 });
    }

    // Get document details before deleting
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      return jsonError('Document not found', { status: 404 });
    }

    // Before deleting, update any tasks that reference this document
    // Get all tasks that reference this document
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, document_ids')
      .contains('document_ids', [id]);

    // Remove this document ID from any tasks that reference it
    if (tasks && tasks.length > 0) {
      for (const task of tasks) {
        const updatedDocumentIds = (task.document_ids || []).filter((docId: string) => docId !== id);
        await supabase
          .from('tasks')
          .update({ document_ids: updatedDocumentIds })
          .eq('id', task.id);
      }
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return jsonError('Failed to delete document', {
        status: 500,
        meta: { details: deleteError.message },
      });
    }

    // Delete from Backblaze B2
    const filePath = resolveFilePath(document?.file_name, document?.file_url);
    if (filePath) {
      try {
        const backblazeService = getBackblazeService();
        await backblazeService.deleteFile(filePath);
      } catch (error) {
        console.error('Failed to delete file from Backblaze:', error);
        // Continue with database deletion even if B2 deletion fails
      }
    }

    // Log the deletion
    if (document) {
      await ActivityLogger.logDocumentActivity(
        user.id,
        'deleted',
        document
      );
    }

    return jsonSuccess({ deleted: true }, { legacy: { success: true } });
  } catch (error) {

    return jsonError('Failed to delete document', { status: 500 });
  }
}
