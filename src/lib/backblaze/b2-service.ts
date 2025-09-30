import B2 from 'backblaze-b2';

interface B2FileUploadResponse {
  fileId: string;
  fileName: string;
  fileUrl: string;
  contentType: string;
  contentLength: number;
}

export class BackblazeService {
  private b2?: any;
  private bucketId?: string;
  private bucketName?: string;
  private authToken: string | null = null;
  private downloadUrl: string | null = null;
  private uploadUrl: string | null = null;
  private uploadAuthToken: string | null = null;

  constructor() {
    const isProd = process.env.NODE_ENV === 'production';
    const isBuild = process.env.NEXT_PHASE === 'phase-production-build';

    if (!isProd) {
      console.log('[B2] Initializing Backblaze service...');
      console.log('[B2] Environment check:', {
        hasKeyId: !!process.env.BACKBLAZE_KEY_ID,
        hasAppKey: !!process.env.BACKBLAZE_APPLICATION_KEY,
        hasBucketId: !!process.env.BACKBLAZE_BUCKET_ID,
        hasBucketName: !!process.env.BACKBLAZE_BUCKET_NAME,
        isBuild
      });
    }

    // Skip validation during build phase (Next.js pre-rendering)
    if (isBuild) {
      console.log('[B2] Skipping Backblaze init during build phase');
      return;
    }

    if (!process.env.BACKBLAZE_KEY_ID || !process.env.BACKBLAZE_APPLICATION_KEY) {
      throw new Error('[B2] Missing BACKBLAZE_KEY_ID or BACKBLAZE_APPLICATION_KEY environment variables');
    }

    if (!process.env.BACKBLAZE_BUCKET_ID || !process.env.BACKBLAZE_BUCKET_NAME) {
      throw new Error('[B2] Missing BACKBLAZE_BUCKET_ID or BACKBLAZE_BUCKET_NAME environment variables');
    }

    this.b2 = new B2({
      applicationKeyId: process.env.BACKBLAZE_KEY_ID,
      applicationKey: process.env.BACKBLAZE_APPLICATION_KEY,
    });
    this.bucketId = process.env.BACKBLAZE_BUCKET_ID!;
    this.bucketName = process.env.BACKBLAZE_BUCKET_NAME!;
  }

  private async authorize() {
    if (!this.b2) {
      throw new Error('[B2] Service not initialized - missing credentials');
    }
    const isProd = process.env.NODE_ENV === 'production';
    if (!isProd) console.log('[B2] Step 1: Authorizing with Backblaze...');
    try {
      const response = await this.b2.authorize();
      if (!isProd) {
        console.log('[B2] Authorization successful');
        console.log('[B2] Auth response (redacted):', {
          accountId: !!response.data.accountId,
          apiUrl: !!response.data.apiUrl,
          downloadUrl: !!response.data.downloadUrl,
          hasAuthToken: !!response.data.authorizationToken
        });
      }
      
      this.authToken = response.data.authorizationToken;
      this.downloadUrl = response.data.downloadUrl;
      return response.data;
    } catch (error: any) {
      console.error('[B2] Authorization failed:', error.message);
      if (error.response && !isProd) {
        console.error('[B2] Auth error response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          // data redacted in production
        });
      }
      throw new Error(`B2 Authorization failed: ${error.message}`);
    }
  }

  private async getUploadUrl() {
    const isProd2 = process.env.NODE_ENV === 'production';
    if (!isProd2) console.log('[B2] Step 2: Getting upload URL...');
    
    if (!this.authToken) {
      if (!isProd2) console.log('[B2] No auth token, authorizing first...');
      await this.authorize();
    }

    try {
      if (!isProd2) console.log('[B2] Requesting upload URL for bucket');
      const response = await this.b2.getUploadUrl({
        bucketId: this.bucketId,
      });
      if (!isProd2) {
        console.log('[B2] Got upload URL successfully');
        console.log('[B2] Upload URL response (redacted):', {
          hasUploadUrl: !!response.data.uploadUrl,
          hasAuthToken: !!response.data.authorizationToken
        });
      }
      
      this.uploadUrl = response.data.uploadUrl;
      this.uploadAuthToken = response.data.authorizationToken;
      return response.data;
    } catch (error: any) {
      console.error('[B2] Failed to get upload URL:', error.message);
      if (error.response && !isProd2) {
        console.error('[B2] URL error response:', {
          status: error.response.status,
          statusText: error.response.statusText
        });
      }
      throw new Error(`Failed to get upload URL: ${error.message}`);
    }
  }

  async uploadFile(
    fileName: string,
    fileBuffer: Buffer,
    contentType: string
  ): Promise<B2FileUploadResponse> {
    console.log('[B2] Starting upload process...');
    console.log('[B2] File details:', {
      fileName,
      fileSize: fileBuffer.length,
      contentType: contentType || 'application/octet-stream'
    });

    try {
      // Get upload URL if we don't have one
      if (!this.uploadUrl || !this.uploadAuthToken) {
        console.log('[B2] No upload URL cached, getting new one...');
        await this.getUploadUrl();
      }

      // Upload the file
      console.log('[B2] Step 3: Uploading file...');
      const uploadFileName = `documents/${Date.now()}-${fileName}`;
      console.log('[B2] Full upload path:', uploadFileName);
      
      const response = await this.b2.uploadFile({
        uploadUrl: this.uploadUrl,
        uploadAuthToken: this.uploadAuthToken,
        fileName: uploadFileName,
        data: fileBuffer,
        contentType: contentType || 'application/octet-stream',
      });

      console.log('[B2] File uploaded successfully:', {
        fileId: response.data.fileId,
        fileName: response.data.fileName,
        contentType: response.data.contentType,
        contentLength: response.data.contentLength
      });

      // Construct the public URL
      const fileUrl = `${this.downloadUrl}/file/${this.bucketName}/${response.data.fileName}`;
      console.log('[B2] Public file URL:', fileUrl);

      return {
        fileId: response.data.fileId,
        fileName: response.data.fileName,
        fileUrl: fileUrl,
        contentType: response.data.contentType,
        contentLength: response.data.contentLength,
      };
    } catch (error: any) {
      console.error('[B2] Upload error:', error.message);
      if (error.response) {
        console.error('[B2] Upload error response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      }

      // If upload failed, try getting a new upload URL and retry once
      if (error.response?.status === 401 || error.response?.status === 503) {
        console.log('[B2] Got 401/503 error, refreshing upload URL and retrying...');
        this.uploadUrl = null;
        this.uploadAuthToken = null;
        await this.getUploadUrl();
        
        // Retry the upload
        console.log('[B2] Retrying upload with fresh credentials...');
        const uploadFileName = `documents/${Date.now()}-${fileName}`;
        const response = await this.b2.uploadFile({
          uploadUrl: this.uploadUrl,
          uploadAuthToken: this.uploadAuthToken,
          fileName: uploadFileName,
          data: fileBuffer,
          contentType: contentType || 'application/octet-stream',
        });

        console.log('[B2] Retry successful');
        const fileUrl = `${this.downloadUrl}/file/${this.bucketName}/${response.data.fileName}`;

        return {
          fileId: response.data.fileId,
          fileName: response.data.fileName,
          fileUrl: fileUrl,
          contentType: response.data.contentType,
          contentLength: response.data.contentLength,
        };
      }
      
      console.error('[B2] Upload failed completely');
      throw new Error(`Failed to upload file to Backblaze B2: ${error.message}`);
    }
  }

  async deleteFile(fileName: string): Promise<void> {
    if (process.env.NODE_ENV !== 'production') console.log('[B2] Deleting file:', fileName);
    
    if (!this.authToken) {
      await this.authorize();
    }

    try {
      // First, we need to list the file versions to get the fileId
      const listResponse = await this.b2.listFileVersions({
        bucketId: this.bucketId,
        prefix: fileName,
        maxFileCount: 1
      });

      if (listResponse.data.files.length === 0) {
      if (process.env.NODE_ENV !== 'production') console.log('[B2] File not found:', fileName);
      return;
      }

      const fileId = listResponse.data.files[0].fileId;
      if (process.env.NODE_ENV !== 'production') console.log('[B2] Found file ID:', fileId);

      await this.b2.deleteFileVersion({
        fileId: fileId,
        fileName: fileName,
      });
      
      if (process.env.NODE_ENV !== 'production') console.log('[B2] File deleted successfully');
    } catch (error: any) {
      console.error('[B2] Delete error:', error.message);
      if (error.response) {
        if (process.env.NODE_ENV !== 'production') console.error('[B2] Delete error response');
        
        // If file doesn't exist, consider it successfully deleted
        if (error.response.data?.code === 'file_not_present') {
          if (process.env.NODE_ENV !== 'production') console.log('[B2] File not present in B2, treating as successful deletion');
          return; // Exit successfully
        }
      }
      throw new Error(`Failed to delete file from Backblaze B2: ${error.message}`);
    }
  }

  async listFiles(prefix?: string): Promise<any[]> {
    console.log('[B2] Listing files with prefix:', prefix || 'documents/');
    
    if (!this.authToken) {
      await this.authorize();
    }

    try {
      const response = await this.b2.listFileNames({
        bucketId: this.bucketId,
        prefix: prefix || 'documents/',
        maxFileCount: 1000,
      });
      console.log('[B2] Found', response.data.files.length, 'files');
      return response.data.files;
    } catch (error: any) {
      console.error('[B2] List error:', error.message);
      if (error.response) {
        console.error('[B2] List error response:', error.response.data);
      }
      throw new Error(`Failed to list files from Backblaze B2: ${error.message}`);
    }
  }
}

// Create a singleton instance with lazy initialization
let _backblazeService: BackblazeService | null = null;

export const getBackblazeService = () => {
  if (!_backblazeService) {
    _backblazeService = new BackblazeService();
  }
  return _backblazeService;
};


// Export a singleton instance for convenience
export const backblazeService = getBackblazeService();
