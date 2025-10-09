import crypto from 'crypto';
import BackblazeB2 from 'backblaze-b2';

type BackblazeClient = InstanceType<typeof BackblazeB2>;

type UploadResult = {
  fileId: string;
  fileName: string;
  fileUrl: string;
  contentType: string;
  contentLength: number;
};

type DownloadDetails = {
  action: 'download';
  fileUrl: string;
  downloadAuthorizationToken: string;
  accountAuthorizationToken: string;
};

type DeleteResult = {
  action: 'delete';
  ok: boolean;
  message?: string;
};

const DEFAULT_PREFIX = 'documents/';
const DOWNLOAD_AUTH_VALID_SECONDS = 60 * 60; // 1 hour
const AUTH_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 minutes before expiry

export class BackblazeService {
  private readonly keyId: string;
  private readonly applicationKey: string;
  private readonly bucketId: string;
  private readonly bucketName: string;

  private readonly b2: BackblazeClient;
  private authData: { authorizationToken: string; downloadUrl: string } | null = null;
  private authFetchedAt = 0;

  constructor() {
    this.keyId = process.env.BACKBLAZE_KEY_ID || process.env.EDGE_BACKBLAZE_KEY_ID || '';
    this.applicationKey = process.env.BACKBLAZE_APPLICATION_KEY || process.env.EDGE_BACKBLAZE_APPLICATION_KEY || '';
    this.bucketId = process.env.BACKBLAZE_BUCKET_ID || process.env.EDGE_BACKBLAZE_BUCKET_ID || '';
    this.bucketName = process.env.BACKBLAZE_BUCKET_NAME || process.env.EDGE_BACKBLAZE_BUCKET_NAME || '';

    if (!this.keyId || !this.applicationKey || !this.bucketId || !this.bucketName) {
      console.warn('[BackblazeService] Missing Backblaze configuration; operations will fail');
    }

    this.b2 = new BackblazeB2({
      applicationKeyId: this.keyId,
      applicationKey: this.applicationKey,
    });
  }

  private async ensureAuthorized(): Promise<{ authorizationToken: string; downloadUrl: string }> {
    const now = Date.now();
    const tokenLifetimeMs = 24 * 60 * 60 * 1000;
    const shouldRefresh =
      !this.authData ||
      now - this.authFetchedAt > tokenLifetimeMs - AUTH_REFRESH_BUFFER_MS;

    if (shouldRefresh) {
      const rawAuth = await this.b2.authorize();
      const container =
        rawAuth && typeof rawAuth === 'object' && rawAuth !== null && 'data' in rawAuth
          ? (rawAuth as { data?: unknown }).data
          : rawAuth;

      if (!container || typeof container !== 'object') {
        throw new Error('Failed to authorize with Backblaze');
      }

      const record = container as Record<string, unknown>;
      const authorizationToken = typeof record.authorizationToken === 'string' ? record.authorizationToken : undefined;
      const downloadUrl = typeof record.downloadUrl === 'string' ? record.downloadUrl : undefined;

      if (!authorizationToken || !downloadUrl) {
        throw new Error('Incomplete Backblaze authorization response');
      }

      this.authData = { authorizationToken, downloadUrl };
      this.authFetchedAt = now;
    }

    return this.authData!;
  }

  private ensurePrefixedName(fileName: string) {
    return fileName.startsWith(DEFAULT_PREFIX)
      ? fileName
      : `${DEFAULT_PREFIX}${Date.now()}-${fileName}`;
  }

  private static encodePath(path: string) {
    return path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
  }

  async uploadFile(fileName: string, fileBuffer: Buffer, contentType: string): Promise<UploadResult> {
    if (!this.keyId || !this.applicationKey || !this.bucketId || !this.bucketName) {
      throw new Error('Backblaze configuration is incomplete');
    }

    const finalName = this.ensurePrefixedName(fileName);
    const auth = await this.ensureAuthorized();

    const { data: uploadData } = await this.b2.getUploadUrl({ bucketId: this.bucketId });

    const sha1 = crypto.createHash('sha1').update(fileBuffer).digest('hex');
    const encodedName = BackblazeService.encodePath(finalName);

    const response = await fetch(uploadData.uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: uploadData.authorizationToken,
        'X-Bz-File-Name': encodedName,
        'Content-Type': contentType || 'application/octet-stream',
        'X-Bz-Content-Sha1': sha1,
      },
      body: fileBuffer as any,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Backblaze upload failed (${response.status}): ${text}`);
    }

    const uploadResult = await response.json();

    const fileUrl = `${auth.downloadUrl}/file/${this.bucketName}/${encodedName}`;

    return {
      fileId: uploadResult.fileId as string,
      fileName: uploadResult.fileName || finalName,
      fileUrl,
      contentType: (uploadResult.contentType as string) || contentType,
      contentLength: Number(uploadResult.contentLength ?? fileBuffer.length),
    };
  }

  async getDownloadDetails(fileName: string): Promise<DownloadDetails> {
    if (!this.bucketId || !this.bucketName) {
      throw new Error('Backblaze configuration is incomplete');
    }

    const auth = await this.ensureAuthorized();
    const normalizedName = fileName.startsWith(DEFAULT_PREFIX) ? fileName : `${DEFAULT_PREFIX}${fileName}`;
    const encodedName = BackblazeService.encodePath(normalizedName);

    const { data } = await this.b2.getDownloadAuthorization({
      bucketId: this.bucketId,
      fileNamePrefix: normalizedName,
      validDurationInSeconds: DOWNLOAD_AUTH_VALID_SECONDS,
    });

    const fileUrl = `${auth.downloadUrl}/file/${this.bucketName}/${encodedName}`;

    return {
      action: 'download',
      fileUrl,
      downloadAuthorizationToken: data.authorizationToken,
      accountAuthorizationToken: auth.authorizationToken,
    };
  }

  async deleteFile(fileName: string): Promise<boolean> {
    if (!this.bucketId) {
      throw new Error('Backblaze configuration is incomplete');
    }

    await this.ensureAuthorized();

    const normalizedName = fileName.startsWith(DEFAULT_PREFIX) ? fileName : `${DEFAULT_PREFIX}${fileName}`;

    const { data } = await this.b2.listFileNames({
      bucketId: this.bucketId,
      startFileName: normalizedName,
      maxFileCount: 1,
      prefix: normalizedName,
    });

    const files = Array.isArray(data?.files)
      ? (data.files as Array<{ fileName?: string; fileId?: string }>)
      : [];
    const file = files.find((entry) => entry.fileName === normalizedName);
    if (!file || typeof file.fileId !== 'string') {
      return true; // already gone
    }

    await this.b2.deleteFileVersion({
      fileId: file.fileId,
      fileName: normalizedName,
    });

    return true;
  }
}

let _service: BackblazeService | null = null;
export const getBackblazeService = () => {
  if (!_service) {
    _service = new BackblazeService();
  }
  return _service;
};

export const backblazeService = getBackblazeService();
export type BackblazeDownloadDetails = DownloadDetails;
export type BackblazeDeleteResult = DeleteResult;
