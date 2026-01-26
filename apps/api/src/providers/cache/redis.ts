import { CacheProvider, CacheOptions } from './interface';

/**
 * Redis Cache Provider
 * Uses ioredis for Redis connectivity
 * Recommended for production and multi-instance deployments
 */
export class RedisCacheProvider implements CacheProvider {
  readonly name = 'redis';
  private client: any = null;
  private url: string;
  private keyPrefix: string;

  constructor() {
    this.url = process.env.REDIS_URL || 'redis://localhost:6379';
    this.keyPrefix = process.env.REDIS_KEY_PREFIX || '';
  }

  isConfigured(): boolean {
    return !!this.url;
  }

  private async getClient(): Promise<any> {
    if (this.client) {
      return this.client;
    }

    try {
      // Dynamic import to avoid requiring ioredis if not used
      const IORedis = (await import('ioredis')).default;
      this.client = new IORedis(this.url, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      await this.client.connect();
      return this.client;
    } catch (error) {
      throw new Error(`Redis connection failed: ${error}`);
    }
  }

  private prefixKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}:${key}` : key;
  }

  async get<T = any>(key: string): Promise<T | null> {
    const client = await this.getClient();
    const value = await client.get(this.prefixKey(key));

    if (value === null) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async set<T = any>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const client = await this.getClient();
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const prefixedKey = this.prefixKey(key);

    if (options?.ttl) {
      await client.setex(prefixedKey, options.ttl, serialized);
    } else {
      await client.set(prefixedKey, serialized);
    }
  }

  async delete(key: string): Promise<void> {
    const client = await this.getClient();
    await client.del(this.prefixKey(key));
  }

  async exists(key: string): Promise<boolean> {
    const client = await this.getClient();
    const result = await client.exists(this.prefixKey(key));
    return result === 1;
  }

  async deletePattern(pattern: string): Promise<number> {
    const client = await this.getClient();
    const prefixedPattern = this.prefixKey(pattern);

    // Use SCAN to safely iterate over keys
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', prefixedPattern, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await client.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');

    return deleted;
  }

  async clear(): Promise<void> {
    if (this.keyPrefix) {
      // Only clear keys with our prefix
      await this.deletePattern('*');
    } else {
      // Warning: This clears the entire Redis database
      const client = await this.getClient();
      await client.flushdb();
    }
  }

  async ttl(key: string): Promise<number> {
    const client = await this.getClient();
    return client.ttl(this.prefixKey(key));
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }
}
