import { randomUUID } from 'crypto';

export interface CachedFile {
  headers: string[];
  rows: Record<string, any>[];
  uploadedAt: number;
}

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FILES = 20;

const cache = new Map<string, CachedFile>();

export function storeFile(headers: string[], rows: Record<string, any>[]): string {
  // Evict expired entries
  cleanup();

  // Evict oldest if at capacity
  if (cache.size >= MAX_FILES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].uploadedAt - b[1].uploadedAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }

  const id = randomUUID();
  cache.set(id, { headers, rows, uploadedAt: Date.now() });
  return id;
}

export function getFile(id: string): CachedFile | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.uploadedAt > TTL_MS) {
    cache.delete(id);
    return null;
  }
  return entry;
}

export function deleteFile(id: string): void {
  cache.delete(id);
}

function cleanup(): void {
  const now = Date.now();
  for (const [id, entry] of cache.entries()) {
    if (now - entry.uploadedAt > TTL_MS) {
      cache.delete(id);
    }
  }
}
