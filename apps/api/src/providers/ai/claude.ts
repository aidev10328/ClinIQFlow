import { AIProvider, ChatMessage, ChatOptions, ChatResponse, EmbeddingResponse } from './interface';

/**
 * Anthropic Claude Provider Implementation
 * Supports Claude 3 models
 */
export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
    this.baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';
    this.defaultModel = process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (!this.isConfigured()) {
      throw new Error('Anthropic API key not configured');
    }

    // Extract system message if present
    let systemPrompt: string | undefined;
    const chatMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else {
        chatMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || 4096,
        system: systemPrompt,
        messages: chatMessages,
        temperature: options?.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    return {
      content,
      model: data.model,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      } : undefined,
    };
  }

  async complete(prompt: string, options?: ChatOptions): Promise<string> {
    const response = await this.chat([{ role: 'user', content: prompt }], options);
    return response.content;
  }

  async embed(text: string): Promise<EmbeddingResponse> {
    // Claude doesn't have native embeddings API
    // For embeddings with Claude, users should use a separate embedding provider
    // or use Voyage AI (Anthropic's recommended embedding partner)
    throw new Error(
      'Claude does not provide native embeddings. ' +
      'Consider using OpenAI embeddings or Voyage AI for vector search with Claude.'
    );
  }
}
