/**
 * OpenRouter API client
 */

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
}

export interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class OpenRouterClient {
  private config: OpenRouterConfig;
  private baseUrl: string;

  constructor(config: OpenRouterConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1/chat/completions';
  }

  async chat(request: Omit<OpenRouterRequest, 'model'>): Promise<OpenRouterResponse> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'HTTP-Referer': 'https://github.com/hamidahoderinwale/udom',
        'X-Title': 'Taste Intent Rule System',
      },
      body: JSON.stringify({
        ...request,
        model: this.config.model,
      }),
    });

    if (!response.ok) {
      let errorMessage = `OpenRouter API error: ${response.status}`;
      try {
        const errorText = await response.text();
        errorMessage += ` - ${errorText}`;
      } catch {
        // Ignore error reading response
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  updateConfig(config: Partial<OpenRouterConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

