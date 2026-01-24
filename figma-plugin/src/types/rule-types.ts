/**
 * Type definitions for intent rule matching system
 */

export interface IntentRule {
  rule_id: string;
  description: string;
  scope: 'artifact_property' | 'structural' | 'relational' | 'compositional';
  abstraction_level: 'specific' | 'intermediate' | 'general';
  triggering_actions: string[];
  artifact_properties?: string[];
  confidence: number;
  platform_context: {
    platform: string;
    platform_version?: string;
    extraction_method: string;
    api_endpoints?: string[];
    data_source?: string;
    extraction_parameters?: Record<string, any>;
  };
  training_metadata?: {
    suitable_for_training: boolean;
    novelty_score: number;
    pattern_frequency: 'common' | 'uncommon' | 'rare';
  };
}

export interface RuleMatch {
  rule: IntentRule;
  match_score: number;
  matched_actions: string[];
  matched_properties: string[];
  reasoning?: string;
}

export interface MatcherInput {
  trace: Array<{ action: string; target: string; timestamp: number }>;
  artifacts: {
    before: any;
    after: any;
  };
  platform_semantics: {
    action_types: string[];
    property_types: string[];
    element_types: string[];
  };
  platform_metadata: {
    platform: string;
    platform_version?: string;
    extraction_method: string;
    api_endpoints?: string[];
    extraction_parameters?: Record<string, any>;
  };
  matching_config: {
    max_rules: number;
    min_confidence: number;
    require_platform_match: boolean;
  };
  examples?: {
    accepted: Array<{
      rule_id: string;
      description: string;
      dimension?: string;
    }>;
    rejected: Array<{
      rule_id: string;
      description: string;
      dimension?: string;
    }>;
  };
}

export interface MatcherOutput {
  matched_rules: RuleMatch[];
  metadata: {
    total_matched: number;
    trace_length: number;
    platform: string;
  };
}


