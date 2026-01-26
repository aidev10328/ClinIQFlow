import { AIProvider, AIProviderType } from './interface';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import { ClaudeProvider } from './claude';

export * from './interface';
export { OpenAIProvider } from './openai';
export { GeminiProvider } from './gemini';
export { ClaudeProvider } from './claude';

// Singleton instances (created once, reused)
let cachedProvider: AIProvider | null = null;
let cachedProviderType: string | null = null;

/**
 * Get the configured AI provider
 * Provider is determined by AI_PROVIDER env variable
 *
 * @example
 * // .env
 * AI_PROVIDER=openai
 * OPENAI_API_KEY=sk-...
 *
 * // Usage
 * const ai = getAIProvider();
 * const response = await ai.complete('Hello, world!');
 */
export function getAIProvider(): AIProvider {
  const providerType = (process.env.AI_PROVIDER || 'openai') as AIProviderType;

  // Return cached provider if type hasn't changed
  if (cachedProvider && cachedProviderType === providerType) {
    return cachedProvider;
  }

  switch (providerType) {
    case 'openai':
      cachedProvider = new OpenAIProvider();
      break;
    case 'gemini':
      cachedProvider = new GeminiProvider();
      break;
    case 'claude':
      cachedProvider = new ClaudeProvider();
      break;
    default:
      console.warn(`Unknown AI provider: ${providerType}, falling back to OpenAI`);
      cachedProvider = new OpenAIProvider();
  }

  cachedProviderType = providerType;
  return cachedProvider;
}

/**
 * Create a specific AI provider instance
 * Useful when you need multiple providers simultaneously
 */
export function createAIProvider(type: AIProviderType): AIProvider {
  switch (type) {
    case 'openai':
      return new OpenAIProvider();
    case 'gemini':
      return new GeminiProvider();
    case 'claude':
      return new ClaudeProvider();
    default:
      throw new Error(`Unknown AI provider type: ${type}`);
  }
}

/**
 * Check which AI providers are configured
 */
export function getConfiguredProviders(): AIProviderType[] {
  const providers: AIProviderType[] = [];

  if (new OpenAIProvider().isConfigured()) providers.push('openai');
  if (new GeminiProvider().isConfigured()) providers.push('gemini');
  if (new ClaudeProvider().isConfigured()) providers.push('claude');

  return providers;
}
