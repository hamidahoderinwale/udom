/**
 * Load system prompts from JSON database
 */

export interface PromptConfig {
  name: string;
  version: string;
  prompt_text: string;
  metadata?: Record<string, any>;
}

export class PromptLoader {
  private promptCache: Map<string, PromptConfig> = new Map();
  private promptsUrl: string;

  constructor(promptsUrl: string = 'http://localhost:3000/api/prompts') {
    this.promptsUrl = promptsUrl;
  }

  async loadPrompt(name: string, version?: string): Promise<string> {
    const cacheKey = version ? `${name}:${version}` : name;
    
    if (this.promptCache.has(cacheKey)) {
      return this.promptCache.get(cacheKey)!.prompt_text;
    }

    try {
      const url = version 
        ? `${this.promptsUrl}/${name}?version=${version}`
        : `${this.promptsUrl}/${name}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to load prompt ${name}: ${response.statusText}`);
      }

      const config: PromptConfig = await response.json();
      this.promptCache.set(cacheKey, config);
      
      return config.prompt_text;
    } catch (error) {
      // Silently fallback to default prompt if network error
      if (error instanceof Error && (error.message.includes('fetch') || error.message.includes('network'))) {
        // Network errors are expected in offline scenarios
        return this.getDefaultPrompt(name);
      }
      return this.getDefaultPrompt(name);
    }
  }

  private getDefaultPrompt(name: string): string {
    // Fallback prompts if database is unavailable
    const defaults: Record<string, string> = {
      'matcher': `You are an intent rule matcher. Your role is to identify which intent rules from a knowledge base match a given action trace and artifact snapshot.

## Output Requirements

Output a JSON object with the following structure:

{
  "matched_rules": [
    {
      "rule": {
        "rule_id": "string",
        "description": "string",
        "scope": "string",
        "abstraction_level": "string",
        "triggering_actions": ["string"],
        "confidence": 0.0-1.0,
        "platform_context": {...}
      },
      "match_score": 0.0-1.0,
      "matched_actions": ["string"],
      "matched_properties": ["string"],
      "reasoning": "brief explanation"
    }
  ],
  "metadata": {
    "total_matched": 0,
    "trace_length": 0,
    "platform": "string"
  }
}`,
    };

    return defaults[name] || '';
  }
}

