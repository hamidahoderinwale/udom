/**
 * Factory for creating rule system components
 */

import { OpenRouterClient } from '../api/openrouter-client';
import { OpenRouterRuleMatcher } from '../matchers/rule-matcher';
import { DefaultRuleSuggestionService } from '../services/rule-suggestion-service';
import { SnapshotToMatcherInputTransformer } from '../transformers/snapshot-to-matcher-input';
import { FigmaSemanticsExtractor } from '../transformers/figma-semantics-extractor';
import { FigmaMetadataBuilder } from '../transformers/figma-metadata-builder';
import { FigmaTraceBuilder } from '../transformers/figma-trace-builder';
import { DefaultPreferenceTracker } from '../trackers/preference-tracker';
import { HttpPreferenceStorage } from '../storage/http-preference-storage';
import { PromptLoader } from '../prompts/prompt-loader';
import type { RuleSuggestionService } from '../services/rule-suggestion-service';
import type { PreferenceTracker } from '../trackers/preference-tracker';

export interface RuleSystemConfig {
  openRouter: {
    apiKey: string;
    model: string;
  };
  preferenceStorageUrl?: string;
  promptsUrl?: string;
  sessionId?: string;
}

export class RuleSystemFactory {
  static createRuleSuggestionService(config: RuleSystemConfig): RuleSuggestionService {
    const openRouterClient = new OpenRouterClient({
      apiKey: config.openRouter.apiKey,
      model: config.openRouter.model,
    });

    const promptLoader = new PromptLoader(config.promptsUrl);
    const ruleMatcher = new OpenRouterRuleMatcher(openRouterClient, promptLoader);
    
    const semanticsExtractor = new FigmaSemanticsExtractor();
    const metadataBuilder = new FigmaMetadataBuilder();
    const traceBuilder = new FigmaTraceBuilder();
    
    const transformer = new SnapshotToMatcherInputTransformer(
      traceBuilder,
      semanticsExtractor,
      metadataBuilder,
      config.preferenceStorageUrl,
      true // includeExamples - enable by default
    );

    return new DefaultRuleSuggestionService(ruleMatcher, transformer);
  }

  static createPreferenceTracker(config: RuleSystemConfig): PreferenceTracker {
    const storage = new HttpPreferenceStorage(config.preferenceStorageUrl);
    return new DefaultPreferenceTracker(storage, config.sessionId);
  }
}


