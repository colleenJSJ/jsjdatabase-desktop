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

export async function GET(request: NextRequest) {
  const requestLabel = '[Documents] Preview';

  try {
    const segments = request.nextUrl.pathname.split('/');
    const documentId = segments[segments.length - 1];
    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }

    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      logger.warn(`${requestLabel} denied: unauthenticated request`);
      return authResult.error;
    }

    const { supabase, user } = authResult;
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('id,file_name,file_url,file_type,file_size')
      .eq('id', documentId)
      .maybeSingle();

    if (documentError || !document) {
      logger.warn(`${requestLabel} denied`, {
        userId: user.id,
        documentId,
        reason: documentError?.message ?? 'not_found'
      });
      const statusCode = (!document && (!documentError || documentError.code === 'PGRST116')) ? 404 : 403;
      return NextResponse.json({ error: 'Document not found' }, { status: statusCode });
    }

    const resolvedFilePath = deriveFilePath(document.file_url, document.file_name);
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

    const b2 = new B2({ applicationKeyId: keyId, applicationKey });
    const authResponse = await b2.authorize();

    const encodedPath = resolvedFilePath
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');

    const downloadAuth = await b2.getDownloadAuthorization({
      bucketId,
      fileNamePrefix: resolvedFilePath,
      validDurationInSeconds: 3600,
    });

    const signedUrl = new URL(`${authResponse.data.downloadUrl}/file/${bucketName}/${encodedPath}`);
    signedUrl.searchParams.set('Authorization', downloadAuth.data.authorizationToken);

    const downloadResponse = await fetch(signedUrl.toString(), {
      headers: {
        Authorization: authResponse.data.authorizationToken,
      },
    });

    if (!downloadResponse.ok || !downloadResponse.body) {
      logger.error(`${requestLabel} fetch failed`, {
        status: downloadResponse.status,
        statusText: downloadResponse.statusText,
      });
      return NextResponse.json({ error: 'Failed to load document preview' }, { status: 502 });
    }

    const headers = new Headers();
    const mode = request.nextUrl.searchParams.get('mode');
    const isDownload = mode === 'download';
    const filename = document.file_name || `document-${document.id}`;

    headers.set('Content-Type', document.file_type || downloadResponse.headers.get('content-type') || 'application/octet-stream');
    headers.set('Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="${encodeURIComponent(filename)}"`);
    headers.set('Cache-Control', 'private, no-store');
    const contentLength = downloadResponse.headers.get('content-length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    return new NextResponse(downloadResponse.body, { headers });
  } catch (error) {
    logger.error('[Documents] Preview error', error);
    return NextResponse.json({ error: 'Failed to load document preview' }, { status: 500 });
  }
}
