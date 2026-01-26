import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  StorageProvider,
  UploadOptions,
  UploadResult,
  DownloadResult,
  ListOptions,
  ListResult,
  SignedUrlOptions,
} from './interface';

/**
 * Local Filesystem Storage Provider
 * Useful for development and testing
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private basePath: string;
  private baseUrl: string;

  constructor() {
    this.basePath = process.env.LOCAL_STORAGE_PATH || './uploads';
    this.baseUrl = process.env.LOCAL_STORAGE_URL || '/uploads';

    // Ensure base directory exists
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  isConfigured(): boolean {
    return true; // Always configured for local storage
  }

  private getFullPath(key: string): string {
    // Prevent path traversal attacks
    const sanitizedKey = key.replace(/\.\./g, '').replace(/^\//, '');
    return path.join(this.basePath, sanitizedKey);
  }

  private ensureDirectory(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async upload(key: string, data: Buffer | string, options?: UploadOptions): Promise<UploadResult> {
    const filePath = this.getFullPath(key);
    this.ensureDirectory(filePath);

    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    fs.writeFileSync(filePath, buffer);

    // Store metadata if provided
    if (options?.metadata || options?.contentType) {
      const metaPath = `${filePath}.meta.json`;
      fs.writeFileSync(metaPath, JSON.stringify({
        contentType: options.contentType,
        metadata: options.metadata,
        uploadedAt: new Date().toISOString(),
      }));
    }

    return {
      key,
      url: this.getPublicUrl(key),
      size: buffer.length,
    };
  }

  async download(key: string): Promise<DownloadResult> {
    const filePath = this.getFullPath(key);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${key}`);
    }

    const data = fs.readFileSync(filePath);
    let contentType: string | undefined;

    // Try to read metadata
    const metaPath = `${filePath}.meta.json`;
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        contentType = meta.contentType;
      } catch {
        // Ignore metadata read errors
      }
    }

    return {
      data,
      contentType,
      size: data.length,
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFullPath(key);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Also delete metadata file if it exists
    const metaPath = `${filePath}.meta.json`;
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath);
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFullPath(key);
    return fs.existsSync(filePath);
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const searchPath = options?.prefix
      ? this.getFullPath(options.prefix)
      : this.basePath;

    const items: ListResult['items'] = [];

    const walkDir = (dir: string, baseKey: string = '') => {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.endsWith('.meta.json')) continue; // Skip metadata files

        const fullPath = path.join(dir, entry.name);
        const key = baseKey ? `${baseKey}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          walkDir(fullPath, key);
        } else {
          const stats = fs.statSync(fullPath);
          items.push({
            key,
            size: stats.size,
            lastModified: stats.mtime,
          });
        }

        if (options?.maxKeys && items.length >= options.maxKeys) {
          return;
        }
      }
    };

    walkDir(searchPath, options?.prefix || '');

    return {
      items: items.slice(0, options?.maxKeys),
      isTruncated: options?.maxKeys ? items.length > options.maxKeys : false,
    };
  }

  async getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    // For local storage, generate a simple token-based URL
    const expiresIn = options?.expiresIn || 3600;
    const expires = Date.now() + expiresIn * 1000;
    const token = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'local-storage-secret')
      .update(`${key}:${expires}`)
      .digest('hex');

    return `${this.baseUrl}/${key}?token=${token}&expires=${expires}`;
  }

  getPublicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}
