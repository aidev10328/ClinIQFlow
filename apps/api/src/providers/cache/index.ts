import { CacheProvider, CacheProviderType } from './interface';
import { MemoryCacheProvider } from './memory';
import { RedisCacheProvider } from './redis';

export * from './interface';
export { MemoryCacheProvider } from './memory';
export { RedisCacheProvider } from './redis';

// Singleton instance
let cachedProvider: CacheProvider | null = null;
let cachedProviderType: string | null = null;

/**
 * Get the configured cache provider
 * Provider is determined by CACHE_PROVIDER env variable
 *
 * @example
 * // .env
 * CACHE_PROVIDER=redis
 * REDIS_URL=redis://localhost:6379
 *
 * // Usage
 * const cache = getCacheProvider();
 * await cache.set('user:123', { name: 'John' }, { ttl: 3600 });
 * const user = await cache.get('user:123');
 */
export function getCacheProvider(): CacheProvider {
  const providerType = (process.env.CACHE_PROVIDER || 'memory') as CacheProviderType;

  // Return cached provider if type hasn't changed
  if (cachedProvider && cachedProviderType === providerType) {
    return cachedProvider;
  }

  switch (providerType) {
    case 'redis':
      cachedProvider = new RedisCacheProvider();
      break;
    case 'memory':
      cachedProvider = new MemoryCacheProvider();
      break;
    default:
      console.warn(`Unknown cache provider: ${providerType}, falling back to memory`);
      cachedProvider = new MemoryCacheProvider();
  }

  cachedProviderType = providerType;
  return cachedProvider;
}

/**
 * Create a specific cache provider instance
 */
export function createCacheProvider(type: CacheProviderType): CacheProvider {
  switch (type) {
    case 'redis':
      return new RedisCacheProvider();
    case 'memory':
      return new MemoryCacheProvider();
    default:
      throw new Error(`Unknown cache provider type: ${type}`);
  }
}
