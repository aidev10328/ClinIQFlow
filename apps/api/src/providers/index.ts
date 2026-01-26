/**
 * Provider Abstraction Layer
 *
 * This module provides a unified interface for external services,
 * allowing you to swap implementations via environment variables.
 *
 * Supported Providers:
 *
 * AI (AI_PROVIDER):
 *   - openai: OpenAI GPT models (default)
 *   - gemini: Google Gemini models
 *   - claude: Anthropic Claude models
 *
 * Storage (STORAGE_PROVIDER):
 *   - local: Local filesystem (default)
 *   - s3: AWS S3 or compatible (MinIO, etc.)
 *
 * Email (EMAIL_PROVIDER):
 *   - console: Console logging (default, for development)
 *   - sendgrid: SendGrid email service
 *
 * Cache (CACHE_PROVIDER):
 *   - memory: In-memory cache (default)
 *   - redis: Redis cache
 *
 * @example
 * // Import and use providers
 * import { getAIProvider, getStorageProvider, getCacheProvider, getEmailProvider } from './providers';
 *
 * // AI
 * const ai = getAIProvider();
 * const response = await ai.chat([{ role: 'user', content: 'Hello!' }]);
 *
 * // Storage
 * const storage = getStorageProvider();
 * await storage.put('uploads/file.txt', buffer);
 *
 * // Cache
 * const cache = getCacheProvider();
 * await cache.set('key', 'value', { ttl: 3600 });
 *
 * // Email
 * const email = getEmailProvider();
 * await email.send({ to: 'user@example.com', subject: 'Hi', html: '<p>Hello</p>' });
 */

// AI Providers
export {
  getAIProvider,
  createAIProvider,
  AIProvider,
  AIProviderType,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  EmbeddingOptions,
} from './ai';

// Storage Providers
export {
  getStorageProvider,
  createStorageProvider,
  StorageProvider,
  StorageProviderType,
  StorageObject,
  StorageOptions,
  ListOptions,
  ListResult,
} from './storage';

// Email Providers
export {
  getEmailProvider,
  createEmailProvider,
  EmailProvider,
  EmailProviderType,
  EmailMessage,
  EmailResult,
} from './email';

// Cache Providers
export {
  getCacheProvider,
  createCacheProvider,
  CacheProvider,
  CacheProviderType,
  CacheOptions,
} from './cache';
