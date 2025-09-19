import { NextRequest, NextResponse } from 'next/server';
import B2 from 'backblaze-b2';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';
import { logger } from '@/lib/utils/logger';

function deriveFilePath(fileUrl?: string | null, fallbackFileName?: string | null): string | null {
  if (fileUrl && fileUrl.includes('/file/')) {
    const afterFile = fileUrl.split('/file/')[1];
    if (afterFile) {
      const parts = afterFile.split('/');
      if (parts.length > 1) {
        return parts.slice(1).join('/');
      }
    }
  }
  if (fallbackFileName) {
    return fallbackFileName;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const requestLabel = '[Documents] Signed URL';

  try {
    const { fileName, fileUrl, documentId } = await request.json();

    if (!documentId && !fileUrl && !fileName) {
      logger.warn(`${requestLabel} denied: missing identifiers`);
      return NextResponse.json({ error: 'Document identifier is required' }, { status: 400 });
    }

    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      logger.warn(`${requestLabel} denied: unauthenticated request`);
      return authResult.error;
    }

    const { user, supabase } = authResult;

    let query = supabase
      .from('documents')
      .select('id,file_name,file_url,uploaded_by,related_to,assigned_to,source_page,source_id');

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
      return NextResponse.json({ error: 'Document not found' }, { status: statusCode });
    }

    if (documentId && document.id !== documentId) {
      logger.warn(`${requestLabel} denied: document mismatch`, {
        userId: user.id,
        requestedId: documentId,
        resolvedId: document.id
      });
      return NextResponse.json({ error: 'Document mismatch' }, { status: 403 });
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
      return NextResponse.json({ error: 'Unable to resolve document file path' }, { status: 400 });
    }

    const keyId = process.env.BACKBLAZE_KEY_ID;
    const applicationKey = process.env.BACKBLAZE_APPLICATION_KEY;
    const bucketId = process.env.BACKBLAZE_BUCKET_ID;
    const bucketName = process.env.BACKBLAZE_BUCKET_NAME;

    if (!keyId || !applicationKey || !bucketId || !bucketName) {
      logger.error(`${requestLabel} failed: missing Backblaze configuration`);
      return NextResponse.json(
        { error: 'Storage configuration incomplete' },
        { status: 500 }
      );
    }

    const b2 = new B2({
      applicationKeyId: keyId,
      applicationKey,
    });

    const authResponse = await b2.authorize();

    const downloadAuth = await b2.getDownloadAuthorization({
      bucketId,
      fileNamePrefix: resolvedFilePath,
      validDurationInSeconds: 3600,
    });

    const baseUrl = authResponse.data.downloadUrl;
    const authToken = downloadAuth.data.authorizationToken;
    const signedUrl = `${baseUrl}/file/${bucketName}/${resolvedFilePath}?Authorization=${authToken}`;

    logger.info(`${requestLabel} granted`, {
      userId: user.id,
      documentId: document.id,
    });

    return NextResponse.json({ signedUrl });
  } catch (error) {
    logger.error('[Documents] Signed URL error', error);
    return NextResponse.json(
      {
        error: 'Failed to generate signed URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
