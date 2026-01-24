/**
 * Rule matcher interface and OpenRouter implementation
 */

import type { MatcherInput, RuleMatch } from '../types/rule-types';
import type { OpenRouterClient } from '../api/openrouter-client';
import type { PromptLoader } from '../prompts/prompt-loader';

export interface RuleMatcher {
  match(input: MatcherInput): Promise<RuleMatch[]>;
}

export class OpenRouterRuleMatcher implements RuleMatcher {
  private systemPrompt: string | null = null;

  constructor(
    private openRouterClient: OpenRouterClient,
    private promptLoader: PromptLoader
  ) {}

  async match(input: MatcherInput): Promise<RuleMatch[]> {
    // Load prompt if not cached
    if (!this.systemPrompt) {
      this.systemPrompt = await this.promptLoader.loadPrompt('matcher');
    }

    // Build system prompt with few-shot examples if available
    let systemPrompt = this.systemPrompt;
    if (input.examples && (input.examples.accepted.length > 0 || input.examples.rejected.length > 0)) {
      systemPrompt += `\n\n## Examples of Good Suggestions (Accepted by Users):\n`;
      input.examples.accepted.forEach(ex => {
        systemPrompt += `- ${ex.description}${ex.dimension ? ` (dimension: ${ex.dimension})` : ''}\n`;
      });
      
      systemPrompt += `\n## Examples of Bad Suggestions (Rejected by Users):\n`;
      input.examples.rejected.forEach(ex => {
        systemPrompt += `- ${ex.description}${ex.dimension ? ` (dimension: ${ex.dimension})` : ''}\n`;
      });
      
      systemPrompt += `\nPrefer suggesting rules similar to accepted examples. Avoid patterns similar to rejected examples.`;
    }

    const userMessage = JSON.stringify(input, null, 2);

    const response = await this.openRouterClient.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    });

    const content = JSON.parse(response.choices[0].message.content);
    return this.transformMatches(content.matched_rules || []);
  }

  private transformMatches(matchedRules: any[]): RuleMatch[] {
    return matchedRules.map((match: any) => ({
      rule: match.rule,
      match_score: match.match_score || match.rule?.confidence || 0.5,
      matched_actions: match.matched_actions || [],
      matched_properties: match.matched_properties || [],
      reasoning: match.reasoning,
    }));
  }
}


