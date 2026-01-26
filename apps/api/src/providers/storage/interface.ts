/**
 * Storage Provider Interface
 * Allows swapping between S3, Azure Blob, Google Cloud Storage, and local filesystem
 */

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  public?: boolean;
}

export interface UploadResult {
  key: string;
  url: string;
  size: number;
}

export interface DownloadResult {
  data: Buffer;
  contentType?: string;
  size: number;
}

export interface ListOptions {
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
}

export interface ListResult {
  items: Array<{
    key: string;
    size: number;
    lastModified: Date;
  }>;
  continuationToken?: string;
  isTruncated: boolean;
}

export interface SignedUrlOptions {
  expiresIn?: number; // seconds, default 3600
  contentType?: string;
}

export interface StorageProvider {
  /**
   * Provider name for logging/debugging
   */
  readonly name: string;

  /**
   * Upload a file
   */
  upload(key: string, data: Buffer | string, options?: UploadOptions): Promise<UploadResult>;

  /**
   * Download a file
   */
  download(key: string): Promise<DownloadResult>;

  /**
   * Delete a file
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a file exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * List files with optional prefix
   */
  list(options?: ListOptions): Promise<ListResult>;

  /**
   * Get a signed URL for temporary access
   */
  getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string>;

  /**
   * Get public URL (if public access is enabled)
   */
  getPublicUrl(key: string): string;

  /**
   * Check if the provider is configured and ready
   */
  isConfigured(): boolean;
}

export type StorageProviderType = 's3' | 'azure' | 'gcs' | 'local';
