/**
 * Systematically derive fidelity_target from extraction_method and artifact_type
 * 
 * This replaces manual fidelity_target assignment with a deterministic mapping
 * based on what the extraction method can actually capture.
 */

export type FidelityTarget = 'wireframe' | 'high-fidelity' | 'pixel-perfect' | 'structural-only';

export interface FidelityMapping {
  extraction_method: string;
  artifact_type: string;
  fidelity_target: FidelityTarget;
  reasoning: string;
}

/**
 * Derive fidelity target from extraction method and artifact type
 */
export function deriveFidelityTarget(
  extraction_method: string,
  artifact_type: string
): FidelityTarget {
  // Native API access → pixel-perfect
  if (extraction_method === 'figma_plugin_api' && artifact_type === 'figma_component') {
    return 'pixel-perfect';
  }
  
  if (extraction_method === 'sketch_file_parser' && artifact_type === 'sketch_artboard') {
    return 'pixel-perfect';
  }

  // AST parsers → structural-only (no visual)
  if (extraction_method === 'babel_ast_parser' && artifact_type === 'react_component') {
    return 'structural-only';
  }

  if (extraction_method === 'typescript_compiler_api' && artifact_type === 'react_component') {
    return 'structural-only';
  }

  // DOM traversal with computed styles → high-fidelity
  if (extraction_method === 'dom_traversal' && artifact_type === 'html_dom') {
    return 'high-fidelity';
  }

  if (extraction_method === 'puppeteer_dom' && artifact_type === 'html_dom') {
    return 'high-fidelity';
  }

  // REST APIs → high-fidelity (may miss some plugin-level details)
  if (extraction_method === 'figma_rest_api' && artifact_type === 'figma_component') {
    return 'high-fidelity';
  }

  // Vision models → wireframe (inferred structure)
  if (extraction_method === 'vision_model_detection' && artifact_type.startsWith('figma_')) {
    return 'wireframe';
  }

  if (extraction_method === 'screenshot_analysis' && artifact_type === 'html_dom') {
    return 'wireframe';
  }

  // OCR → wireframe (text only, inferred layout)
  if (extraction_method === 'ocr' && artifact_type === 'pdf_page') {
    return 'wireframe';
  }

  // Default: infer from extraction method characteristics
  if (extraction_method.includes('api') || extraction_method.includes('parser')) {
    return 'high-fidelity';
  }

  if (extraction_method.includes('vision') || extraction_method.includes('ocr') || extraction_method.includes('screenshot')) {
    return 'wireframe';
  }

  if (extraction_method.includes('ast') || extraction_method.includes('compiler')) {
    return 'structural-only';
  }

  // Fallback
  return 'high-fidelity';
}

/**
 * Get fidelity mapping with reasoning
 */
export function getFidelityMapping(
  extraction_method: string,
  artifact_type: string
): FidelityMapping {
  const fidelity_target = deriveFidelityTarget(extraction_method, artifact_type);
  
  const reasoning = getReasoning(extraction_method, artifact_type, fidelity_target);
  
  return {
    extraction_method,
    artifact_type,
    fidelity_target,
    reasoning,
  };
}

function getReasoning(
  extraction_method: string,
  artifact_type: string,
  fidelity_target: FidelityTarget
): string {
  const reasons: Record<string, string> = {
    'pixel-perfect': 'Native API provides complete access to all properties, enabling pixel-perfect reconstruction',
    'high-fidelity': 'API/parser captures most properties with minor gaps, enabling high-quality reconstruction',
    'wireframe': 'Visual analysis infers structure and layout, suitable for wireframe-level reconstruction',
    'structural-only': 'AST/compiler provides structural information only, no visual properties available',
  };

  return reasons[fidelity_target] || 'Fidelity derived from extraction method capabilities';
}

/**
 * Mapping table for reference/documentation
 */
export const FIDELITY_MAPPING_TABLE: FidelityMapping[] = [
  {
    extraction_method: 'figma_plugin_api',
    artifact_type: 'figma_component',
    fidelity_target: 'pixel-perfect',
    reasoning: 'Full native API access to all Figma properties',
  },
  {
    extraction_method: 'figma_rest_api',
    artifact_type: 'figma_component',
    fidelity_target: 'high-fidelity',
    reasoning: 'REST API captures most properties but may miss plugin-level details',
  },
  {
    extraction_method: 'babel_ast_parser',
    artifact_type: 'react_component',
    fidelity_target: 'structural-only',
    reasoning: 'AST provides code structure only, no visual/rendering information',
  },
  {
    extraction_method: 'dom_traversal',
    artifact_type: 'html_dom',
    fidelity_target: 'high-fidelity',
    reasoning: 'DOM + computed styles provide accurate visual representation',
  },
  {
    extraction_method: 'vision_model_detection',
    artifact_type: 'figma_component',
    fidelity_target: 'wireframe',
    reasoning: 'Visual analysis infers structure from screenshots',
  },
  {
    extraction_method: 'ocr',
    artifact_type: 'pdf_page',
    fidelity_target: 'wireframe',
    reasoning: 'Text extraction with inferred layout, no native structure',
  },
];



