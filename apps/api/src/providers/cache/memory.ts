import { CacheProvider, CacheOptions } from './interface';

interface CacheEntry {
  value: any;
  expiresAt: number | null;
}

/**
 * In-Memory Cache Provider
 * Simple cache implementation for development and single-instance deployments
 * Note: Cache is lost on restart and not shared across instances
 */
export class MemoryCacheProvider implements CacheProvider {
  readonly name = 'memory';
  private cache: Map<string, CacheEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Run cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  isConfigured(): boolean {
    return true; // Always configured
  }

  async get<T = any>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T = any>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const expiresAt = options?.ttl ? Date.now() + options.ttl * 1000 : null;

    this.cache.set(key, {
      value,
      expiresAt,
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async deletePattern(pattern: string): Promise<number> {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);

    let deleted = 0;
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async ttl(key: string): Promise<number> {
    const entry = this.cache.get(key);

    if (!entry) {
      return -2; // Key doesn't exist
    }

    if (!entry.expiresAt) {
      return -1; // No expiration
    }

    const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache stats (for debugging)
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
