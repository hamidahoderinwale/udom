/**
 * uDOM type definitions
 */

export interface uDOMSnapshot {
  metadata: {
    snapshot_id: string;
    artifact_id: string;
    artifact_type: string;
    timestamp: number;
    content_hash: string;
    schema_version: string;
  };
  elements: uDOMElement[];
  relations: uDOMRelation[];
  observations: {
    provenance: Provenance;
    intent?: Intent;
    context?: Context;
  };
  composition_rules?: CompositionRules;
  rendering_manifest?: RenderingManifest;
}

export interface uDOMElement {
  id: string;
  stable_id: string;
  type: string;
  semantic_type: string;
  properties: Record<string, any>;
  spatial?: Spatial;
  visual?: Visual;
  text?: Text;
  vector?: Vector;
  composition?: Composition;
  states?: States;
}

export interface uDOMRelation {
  type: string;
  from: string;
  to: string;
  properties?: Record<string, any>;
}

export interface Provenance {
  user_id?: string;
  user_name?: string;
  session_id: string;
  tool: string;
  tool_version: string;
  extraction_method: string;
  extracted_at: number;
  extractor_version: string;
  extraction_quality: string;
}

export interface Intent {
  source?: string;
  change_type?: string;
  scope?: string;
  motivation?: string;
  trigger?: 'auto_capture' | 'manual_capture' | 'selection_change' | 'user_request';
  capture_number?: number;
  user_intent?: string; // User-provided intent text
  inferred_intent?: {
    action_type: 'create' | 'modify' | 'refine' | 'explore';
    focus_area: 'spacing' | 'typography' | 'color' | 'layout' | 'hierarchy' | 'interaction';
    confidence: number;
  };
  previous_snapshot_id?: string; // Link to previous state
  change_summary?: string; // Text summary of changes
}

export interface Context {
  file_name?: string;
  file_path?: string;
  page_name?: string;
  nearby_elements?: string[];
  tags?: string[];
  workspace_id?: string;
  viewport?: {
    zoom: number;
    center: { x: number; y: number };
    bounds: { x: number; y: number; width: number; height: number };
  };
  interaction_history?: {
    recent_selections: Array<{
      node_id: string;
      node_name: string;
      timestamp: number;
      duration?: number;
    }>;
    selection_frequency: Record<string, number>;
    average_time_between_selections: number;
    total_selections: number;
    most_frequent_nodes?: Array<{ node_id: string; count: number }>;
    session_stats?: {
      duration: number;
      total_interactions: number;
      captures_per_minute: number;
    };
  };
}

export interface Spatial {
  absolute?: {
    coordinate_system: string;
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  relative?: {
    layout_mode: string;
    flex?: {
      direction: string;
      align: string;
      justify: string;
    };
  };
  semantic?: {
    depth: number;
    path: string;
    document_order: number;
  };
  visual?: {
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
}

export interface Visual {
  background?: {
    type: string;
    color: string;
  };
  border_radius?: {
    tl: number;
    tr: number;
    br: number;
    bl: number;
  };
  shadow?: Array<{
    x: number;
    y: number;
    blur: number;
    color: string;
  }>;
}

export interface Text {
  content: string;
  font_family: string;
  font_size: number;
  font_weight: string;
  line_height: number;
}

export interface Vector {
  path_data?: string;
  svg_data?: string;
  viewBox?: string;
}

export interface Composition {
  children: string[];
  layout_mode?: string;
}

export interface States {
  default?: Record<string, any>;
  hover?: Record<string, any>;
  active?: Record<string, any>;
  disabled?: Record<string, any>;
}

export interface CompositionRules {
  hierarchy?: {
    max_nesting_depth?: number;
    nesting_strategy?: string;
    indent_increment?: number;
    parent_child_rules?: {
      containment?: string;
      z_ordering?: string;
    };
  };
  spacing?: {
    vertical_rhythm?: {
      base_unit: number;
      scale: number[];
      apply_to: string[];
    };
    horizontal_rhythm?: {
      base_unit: number;
      grid_columns?: number;
      gutter?: number;
    };
  };
  visual_hierarchy?: {
    emphasis_levels: number;
    primary_axis: string;
    rules: Array<{
      level: number;
      size_range?: { min: number; max: number };
      weight_range?: { min: number; max: number };
      color_prominence?: number;
    }>;
  };
  constraints?: {
    min_touch_target?: number;
    max_line_length?: number;
    aspect_ratio_lock?: boolean;
    snap_to_grid?: boolean;
    responsive_breakpoints?: number[];
  };
}

export interface RenderingManifest {
  viewport?: {
    width: number;
    height: number;
    dpr: number;
    scale: number;
    coordinate_system: string;
  };
  render_layers?: Array<{
    id: string;
    type: string;
    z_index: number;
    blend_mode: string;
    opacity: number;
    elements: string[];
  }>;
  assets?: {
    images?: Array<{
      id: string;
      url: string;
      hash: string;
      dimensions: { width: number; height: number };
      format: string;
    }>;
    vectors?: Array<{
      id: string;
      svg_data: string;
      viewBox: string;
      hash?: string;
    }>;
    fonts?: Array<{
      family: string;
      weights: number[];
      source: string;
      url?: string;
    }>;
  };
  quality?: {
    include_interactions?: boolean;
    include_animations?: boolean;
    text_rendering?: string;
  };
}

