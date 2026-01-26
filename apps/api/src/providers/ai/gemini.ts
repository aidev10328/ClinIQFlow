import { AIProvider, ChatMessage, ChatOptions, ChatResponse, EmbeddingResponse } from './interface';

/**
 * Google Gemini Provider Implementation
 * Supports Gemini Pro and embedding models
 */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private embeddingModel: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    this.defaultModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    this.embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key not configured');
    }

    const model = options?.model || this.defaultModel;

    // Convert messages to Gemini format
    const contents = this.convertMessages(messages);

    const response = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: options?.temperature ?? 0.7,
            maxOutputTokens: options?.maxTokens,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text || '';

    return {
      content,
      model,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount || 0,
        completionTokens: data.usageMetadata.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata.totalTokenCount || 0,
      } : undefined,
    };
  }

  async complete(prompt: string, options?: ChatOptions): Promise<string> {
    const response = await this.chat([{ role: 'user', content: prompt }], options);
    return response.content;
  }

  async embed(text: string): Promise<EmbeddingResponse> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key not configured');
    }

    const response = await fetch(
      `${this.baseUrl}/models/${this.embeddingModel}:embedContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: `models/${this.embeddingModel}`,
          content: {
            parts: [{ text }],
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini Embeddings API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      embedding: data.embedding?.values || [],
      model: this.embeddingModel,
    };
  }

  private convertMessages(messages: ChatMessage[]): any[] {
    const contents: any[] = [];
    let systemPrompt = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Gemini doesn't have a system role, prepend to first user message
        systemPrompt = msg.content;
      } else {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        let content = msg.content;

        // Prepend system prompt to first user message
        if (systemPrompt && role === 'user' && contents.length === 0) {
          content = `${systemPrompt}\n\n${content}`;
          systemPrompt = '';
        }

        contents.push({
          role,
          parts: [{ text: content }],
        });
      }
    }

    return contents;
  }
}
