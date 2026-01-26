/**
 * AI Provider Interface
 * Allows swapping between OpenAI, Gemini, Claude, and other LLM providers
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
}

export interface AIProvider {
  /**
   * Provider name for logging/debugging
   */
  readonly name: string;

  /**
   * Send a chat completion request
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /**
   * Simple text completion (convenience method)
   */
  complete(prompt: string, options?: ChatOptions): Promise<string>;

  /**
   * Generate embeddings for text (for vector search)
   */
  embed(text: string): Promise<EmbeddingResponse>;

  /**
   * Check if the provider is configured and ready
   */
  isConfigured(): boolean;
}

export type AIProviderType = 'openai' | 'gemini' | 'claude' | 'ollama';
