/**
 * Cache Provider Interface
 * Allows swapping between Redis, Memcached, and in-memory caching
 */

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
}

export interface CacheProvider {
  /**
   * Provider name for logging/debugging
   */
  readonly name: string;

  /**
   * Get a value from cache
   */
  get<T = any>(key: string): Promise<T | null>;

  /**
   * Set a value in cache
   */
  set<T = any>(key: string, value: T, options?: CacheOptions): Promise<void>;

  /**
   * Delete a value from cache
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a key exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Delete all keys matching a pattern (if supported)
   */
  deletePattern?(pattern: string): Promise<number>;

  /**
   * Clear all cache (use with caution)
   */
  clear(): Promise<void>;

  /**
   * Get remaining TTL for a key (in seconds)
   */
  ttl?(key: string): Promise<number>;

  /**
   * Check if the provider is configured and ready
   */
  isConfigured(): boolean;

  /**
   * Close the connection (for cleanup)
   */
  close?(): Promise<void>;
}

export type CacheProviderType = 'redis' | 'memory';
