import { NextRequest, NextResponse } from 'next/server';
import B2 from 'backblaze-b2';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';
import { deriveFilePath } from '@/app/api/documents/_helpers';
import { logger } from '@/lib/utils/logger';

export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const id = pathname.split('/').filter(Boolean).pop();
  const requestLabel = '[Documents] Preview proxy';

  if (!id) {
    return NextResponse.json({ error: 'Document id required' }, { status: 400 });
  }

  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { supabase, user } = authResult;

    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('id,file_name,file_url,file_type')
      .eq('id', id)
      .maybeSingle();

    if (documentError || !document) {
      logger.warn(`${requestLabel} denied`, {
        userId: user.id,
        documentId: id,
        reason: documentError?.message ?? 'not_found'
      });
      const statusCode = (!document && (!documentError || documentError.code === 'PGRST116')) ? 404 : 403;
      return NextResponse.json({ error: 'Document not found' }, { status: statusCode });
    }

    const resolvedFilePath = deriveFilePath(document.file_url, document.file_name);
    if (!resolvedFilePath) {
      logger.warn(`${requestLabel} file path unresolved`, {
        userId: user.id,
        documentId: document.id,
      });
      return NextResponse.json({ error: 'Unable to resolve document path' }, { status: 400 });
    }

    const keyId = process.env.BACKBLAZE_KEY_ID;
    const applicationKey = process.env.BACKBLAZE_APPLICATION_KEY;
    const bucketId = process.env.BACKBLAZE_BUCKET_ID;
    const bucketName = process.env.BACKBLAZE_BUCKET_NAME;

    if (!keyId || !applicationKey || !bucketId || !bucketName) {
      logger.error(`${requestLabel} failed: missing Backblaze configuration`);
      return NextResponse.json({ error: 'Storage configuration incomplete' }, { status: 500 });
    }

    const b2 = new B2({ applicationKeyId: keyId, applicationKey });
    const authResponse = await b2.authorize();
    const downloadAuth = await b2.getDownloadAuthorization({
      bucketId,
      fileNamePrefix: resolvedFilePath,
      validDurationInSeconds: 3600,
    });

    const baseUrl = authResponse.data.downloadUrl;
    const encodedPath = resolvedFilePath
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');

    const signedUrl = new URL(`${baseUrl}/file/${bucketName}/${encodedPath}`);
    signedUrl.searchParams.set('Authorization', downloadAuth.data.authorizationToken);

    const downloadResponse = await fetch(signedUrl.toString(), {
      headers: {
        Authorization: authResponse.data.authorizationToken,
      },
    });

    if (!downloadResponse.ok || !downloadResponse.body) {
      logger.error(`${requestLabel} download failed`, {
        userId: user.id,
        documentId: document.id,
        status: downloadResponse.status,
      });
      return NextResponse.json({ error: 'Failed to fetch document preview' }, { status: 502 });
    }

    const responseHeaders = new Headers();
    const upstreamType = downloadResponse.headers.get('content-type');
    const inferredType = document.file_type?.startsWith('image/') ? document.file_type : upstreamType;
    if (inferredType) {
      responseHeaders.set('Content-Type', inferredType);
    }
    responseHeaders.set('Cache-Control', 'private, no-store');
    const filename = document.file_name || `document-${document.id}`;
    responseHeaders.set('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);

    return new Response(downloadResponse.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    logger.error(`${requestLabel} error`, error);
    return NextResponse.json({ error: 'Failed to load preview' }, { status: 500 });
  }
}
