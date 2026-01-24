/**
 * Build Figma-specific platform metadata
 */

import type { uDOMSnapshot } from '../types/udom';
import type { PlatformMetadataBuilder } from './snapshot-to-matcher-input';

export class FigmaMetadataBuilder implements PlatformMetadataBuilder {
  build(snapshot: uDOMSnapshot): {
    platform: string;
    platform_version?: string;
    extraction_method: string;
    api_endpoints?: string[];
    extraction_parameters?: Record<string, any>;
  } {
    return {
      platform: 'figma',
      platform_version: snapshot.observations.provenance.tool_version || '1.0.0',
      extraction_method: 'plugin_api',
      api_endpoints: ['https://www.figma.com/plugin-docs/api/'],
      extraction_parameters: {
        schema_version: snapshot.metadata.schema_version,
        extractor_version: snapshot.observations.provenance.extractor_version,
      },
    };
  }
}


