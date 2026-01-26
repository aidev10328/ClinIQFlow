import { AIProvider, ChatMessage, ChatOptions, ChatResponse, EmbeddingResponse } from './interface';

/**
 * OpenAI Provider Implementation
 * Supports GPT-4, GPT-3.5-turbo, and embedding models
 */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private embeddingModel: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.defaultModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      model: data.model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }

  async complete(prompt: string, options?: ChatOptions): Promise<string> {
    const response = await this.chat([{ role: 'user', content: prompt }], options);
    return response.content;
  }

  async embed(text: string): Promise<EmbeddingResponse> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI Embeddings API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      embedding: data.data?.[0]?.embedding || [],
      model: data.model,
    };
  }
}
