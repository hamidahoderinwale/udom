/**
 * Service for getting rule suggestions
 */

import type { uDOMSnapshot } from '../types/udom';
import type { IntentRule } from '../types/rule-types';
import type { RuleMatcher } from '../matchers/rule-matcher';
import type { SnapshotToMatcherInputTransformer } from '../transformers/snapshot-to-matcher-input';

export interface RuleSuggestionService {
  getSuggestions(
    snapshot: uDOMSnapshot,
    context: any,
    maxSuggestions?: number,
    minConfidence?: number,
    previousSnapshot?: uDOMSnapshot | null
  ): Promise<IntentRule[]>;
}

export class DefaultRuleSuggestionService implements RuleSuggestionService {
  constructor(
    private ruleMatcher: RuleMatcher,
    private transformer: SnapshotToMatcherInputTransformer,
    private defaultMaxSuggestions: number = 3,
    private defaultMinConfidence: number = 0.5
  ) {}

  async getSuggestions(
    snapshot: uDOMSnapshot,
    context: any,
    maxSuggestions: number = this.defaultMaxSuggestions,
    minConfidence: number = this.defaultMinConfidence,
    previousSnapshot?: uDOMSnapshot | null
  ): Promise<IntentRule[]> {
    const input = await this.transformer.transform(snapshot, context, {
      max_rules: maxSuggestions,
      min_confidence: minConfidence,
      require_platform_match: true,
    }, previousSnapshot);

    const matches = await this.ruleMatcher.match(input);

    return matches
      .filter(m => m.match_score >= minConfidence && m.rule.confidence >= minConfidence)
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, maxSuggestions)
      .map(m => m.rule);
  }
}

