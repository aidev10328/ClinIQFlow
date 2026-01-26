import { StorageProvider, StorageProviderType } from './interface';
import { S3Provider } from './s3';
import { LocalStorageProvider } from './local';

export * from './interface';
export { S3Provider } from './s3';
export { LocalStorageProvider } from './local';

// Singleton instance
let cachedProvider: StorageProvider | null = null;
let cachedProviderType: string | null = null;

/**
 * Get the configured storage provider
 * Provider is determined by STORAGE_PROVIDER env variable
 *
 * @example
 * // .env
 * STORAGE_PROVIDER=s3
 * AWS_S3_BUCKET=my-bucket
 * AWS_ACCESS_KEY_ID=...
 * AWS_SECRET_ACCESS_KEY=...
 *
 * // Usage
 * const storage = getStorageProvider();
 * await storage.upload('files/doc.pdf', buffer);
 */
export function getStorageProvider(): StorageProvider {
  const providerType = (process.env.STORAGE_PROVIDER || 'local') as StorageProviderType;

  // Return cached provider if type hasn't changed
  if (cachedProvider && cachedProviderType === providerType) {
    return cachedProvider;
  }

  switch (providerType) {
    case 's3':
      cachedProvider = new S3Provider();
      break;
    case 'local':
      cachedProvider = new LocalStorageProvider();
      break;
    case 'azure':
      // Azure implementation can be added later
      console.warn('Azure storage not implemented, falling back to local');
      cachedProvider = new LocalStorageProvider();
      break;
    case 'gcs':
      // Google Cloud Storage implementation can be added later
      console.warn('GCS storage not implemented, falling back to local');
      cachedProvider = new LocalStorageProvider();
      break;
    default:
      console.warn(`Unknown storage provider: ${providerType}, falling back to local`);
      cachedProvider = new LocalStorageProvider();
  }

  cachedProviderType = providerType;
  return cachedProvider;
}

/**
 * Create a specific storage provider instance
 */
export function createStorageProvider(type: StorageProviderType): StorageProvider {
  switch (type) {
    case 's3':
      return new S3Provider();
    case 'local':
      return new LocalStorageProvider();
    default:
      throw new Error(`Unknown storage provider type: ${type}`);
  }
}
