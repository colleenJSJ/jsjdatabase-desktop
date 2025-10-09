import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { logger } from '@/lib/utils/logger';
import { getBackblazeService } from '@/lib/backblaze/b2-service';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

function deriveFilePath(fileUrl?: string | null, fallbackFileName?: string | null): string | null {
  if (fallbackFileName) {
    return fallbackFileName;
  }
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
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const requestLabel = '[Documents] Signed URL';

  try {
    const payload = await request.json().catch(() => ({}));
    const { fileName, fileUrl, documentId, download = false, preview = false } = payload as {
      fileName?: string | null;
      fileUrl?: string | null;
      documentId?: string | null;
      download?: boolean;
      preview?: boolean;
    };

    if (!documentId && !fileUrl && !fileName) {
      logger.warn(`${requestLabel} denied: missing identifiers`);
      return jsonError('Document identifier is required', { status: 400 });
    }

    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      logger.warn(`${requestLabel} denied: unauthenticated request`);
      return authResult;
    }

    const { user, supabase } = authResult;

    let query = supabase
      .from('documents')
      .select('id,file_name,file_url,file_type,file_size,uploaded_by,related_to,assigned_to,source_page,source_id');

    if (documentId) {
      query = query.eq('id', documentId).limit(1);
    } else if (fileUrl) {
      query = query.eq('file_url', fileUrl).limit(1);
    } else {
      query = query.eq('file_name', fileName).order('created_at', { ascending: false }).limit(1);
    }

    const { data: document, error: documentError } = await query.maybeSingle();

    if (documentError || !document) {
      logger.warn(`${requestLabel} denied`, {
        userId: user.id,
        documentId,
        fileUrl,
        fileName,
        reason: documentError?.message ?? 'not_found'
      });
      const statusCode = (!document && (!documentError || documentError.code === 'PGRST116')) ? 404 : 403;
      return jsonError('Document not found', { status: statusCode });
    }

    if (documentId && document.id !== documentId) {
      logger.warn(`${requestLabel} denied: document mismatch`, {
        userId: user.id,
        requestedId: documentId,
        resolvedId: document.id
      });
      return jsonError('Document mismatch', { status: 403 });
    }

    if (fileUrl && document.file_url && document.file_url !== fileUrl) {
      logger.warn(`${requestLabel} file URL mismatch`, {
        userId: user.id,
        documentId: document.id,
        requestedUrl: fileUrl,
        storedUrl: document.file_url
      });
    }

    const resolvedFilePath = deriveFilePath(document.file_url || fileUrl, document.file_name || fileName);
    if (!resolvedFilePath) {
      logger.warn(`${requestLabel} denied: unable to resolve file path`, {
        userId: user.id,
        documentId: document.id
      });
      return jsonError('Unable to resolve document file path', { status: 400 });
    }

    const backblazeService = getBackblazeService();
    let downloadDetails;
    try {
      downloadDetails = await backblazeService.getDownloadDetails(resolvedFilePath);
    } catch (error) {
      logger.error(`${requestLabel} failed to get download details`, {
        userId: user.id,
        documentId: document.id,
        error: error instanceof Error ? error.message : error,
      });
      return jsonError('Failed to generate signed URL', { status: 500 });
    }
    const searchParams = new URLSearchParams();
    searchParams.set('Authorization', downloadDetails.downloadAuthorizationToken);

    if (download) {
      const filename = document.file_name || `document-${document.id}`;
      searchParams.set('response-content-disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    } else if (preview) {
      searchParams.set('response-content-disposition', 'inline');
      if (document.file_type) {
        searchParams.set('response-content-type', document.file_type);
      }
    }

    const signedUrl = `${downloadDetails.fileUrl}?${searchParams.toString()}`;

    logger.info(`${requestLabel} granted`, {
      userId: user.id,
      documentId: document.id,
    });

    return jsonSuccess({ signedUrl }, { legacy: { signedUrl } });
  } catch (error) {
    logger.error('[Documents] Signed URL error', error);
    return jsonError('Failed to generate signed URL', {
      status: 500,
      meta: { details: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
}
