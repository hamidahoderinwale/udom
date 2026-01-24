/**
 * Transform uDOM snapshots to rule matcher input format
 */

import type { uDOMSnapshot } from '../types/udom';
import type { MatcherInput } from '../types/rule-types';

export interface TraceBuilder {
  buildTrace(context: any): Array<{ action: string; target: string; timestamp: number }>;
}

export interface PlatformSemanticsExtractor {
  extract(snapshot: uDOMSnapshot): {
    action_types: string[];
    property_types: string[];
    element_types: string[];
  };
}

export interface PlatformMetadataBuilder {
  build(snapshot: uDOMSnapshot): {
    platform: string;
    platform_version?: string;
    extraction_method: string;
    api_endpoints?: string[];
    extraction_parameters?: Record<string, any>;
  };
}

/**
 * Fetch few-shot examples from the server
 */
async function fetchFewShotExamples(
  snapshot: uDOMSnapshot,
  context: any,
  apiUrl: string = 'http://localhost:3000',
  limit: number = 3
): Promise<MatcherInput['examples']> {
  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      platform: 'figma',
    });

    if (context?.user_intent) {
      params.append('user_intent', context.user_intent);
    }

    if (snapshot?.metadata?.artifact_type) {
      params.append('component_type', snapshot.metadata.artifact_type);
    }

    const response = await fetch(`${apiUrl}/preferences/examples?${params.toString()}`);
    
    if (!response.ok) {
      return undefined;
    }

    const examples = await response.json();
    
    return {
      accepted: examples.accepted?.map((ex: any) => ({
        rule_id: ex.rule_id,
        description: ex.description,
        dimension: ex.dimension,
      })) || [],
      rejected: examples.rejected?.map((ex: any) => ({
        rule_id: ex.rule_id,
        description: ex.description,
        dimension: ex.dimension,
      })) || [],
    };
  } catch (error) {
    // Silently fail - examples are optional
    return undefined;
  }
}

export class SnapshotToMatcherInputTransformer {
  constructor(
    private traceBuilder: TraceBuilder,
    private semanticsExtractor: PlatformSemanticsExtractor,
    private metadataBuilder: PlatformMetadataBuilder,
    private preferenceStorageUrl?: string,
    private includeExamples: boolean = true
  ) {}

  async transform(
    snapshot: uDOMSnapshot,
    context: any,
    matchingConfig: MatcherInput['matching_config'],
    previousSnapshot?: uDOMSnapshot | null
  ): Promise<MatcherInput> {
    const trace = this.traceBuilder.buildTrace(context);
    const platformSemantics = this.semanticsExtractor.extract(snapshot);
    const platformMetadata = this.metadataBuilder.build(snapshot);

    // Fetch examples if enabled and storage URL is provided
    let examples: MatcherInput['examples'] = undefined;
    if (this.includeExamples && this.preferenceStorageUrl && !context?.skip_examples) {
      examples = await fetchFewShotExamples(
        snapshot,
        context,
        this.preferenceStorageUrl,
        matchingConfig.max_rules || 3
      );
    }

    return {
      trace,
      artifacts: {
        before: previousSnapshot || snapshot,  // Use previous snapshot if available, otherwise use current
        after: snapshot,
      },
      platform_semantics: platformSemantics,
      platform_metadata: platformMetadata,
      matching_config: matchingConfig,
      examples,
    };
  }
}

