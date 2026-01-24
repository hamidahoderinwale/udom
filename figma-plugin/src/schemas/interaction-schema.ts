/**
 * Universal Interaction Schema System
 * 
 * Extensible schema for tracking user interactions across different tools and artifact types.
 * Uses composition and inheritance patterns to support tool-specific and content-aware extensions.
 */

// ============================================================================
// BASE SCHEMA - Universal interaction properties
// ============================================================================

export interface BaseInteractionEvent {
  // Core identification
  event_id: string;
  event_type: InteractionEventType;
  timestamp: number;
  
  // Session context
  session_id: string;
  user_id?: string;
  
  // Tool context
  tool: ToolType;
  tool_version: string;
  
  // Artifact context
  artifact_id?: string;
  artifact_type?: string;
  
  // Temporal context
  duration?: number;
  sequence_number?: number;
  
  // Extensibility
  metadata?: Record<string, any>;
  extensions?: Record<string, any>;
}

export type InteractionEventType =
  | 'selection'
  | 'creation'
  | 'modification'
  | 'deletion'
  | 'navigation'
  | 'capture'
  | 'toggle'
  | 'viewport_change'
  | 'focus'
  | 'blur'
  | 'hover'
  | 'click'
  | 'drag'
  | 'drop'
  | 'resize'
  | 'rotate'
  | 'property_change';

export type ToolType = 'figma' | 'sketch' | 'xd' | 'vscode' | 'browser' | 'other';

// ============================================================================
// SPATIAL EXTENSION - For tools with spatial/canvas context
// ============================================================================

export interface SpatialExtension {
  viewport?: {
    zoom: number;
    center: { x: number; y: number };
    bounds: { x: number; y: number; width: number; height: number };
    rotation?: number;
  };
  cursor_position?: { x: number; y: number };
  scroll_position?: { x: number; y: number };
  target_bounds?: { x: number; y: number; width: number; height: number };
}

// ============================================================================
// SELECTION EXTENSION - For selection-based interactions
// ============================================================================

export interface SelectionExtension {
  target: {
    id: string;
    type: string;
    name?: string;
    path?: string[];
  };
  selection_mode?: 'single' | 'multiple' | 'range' | 'deep';
  selected_count?: number;
  previous_selection?: string[];
  selection_method?: 'click' | 'keyboard' | 'api' | 'search';
}

// ============================================================================
// MODIFICATION EXTENSION - For content changes
// ============================================================================

export interface ModificationExtension {
  change_type: 'property' | 'structure' | 'style' | 'content' | 'layout';
  changed_properties?: Array<{
    property: string;
    old_value: any;
    new_value: any;
  }>;
  scope?: 'single' | 'multiple' | 'recursive';
  undo_available?: boolean;
}

// ============================================================================
// TEMPORAL EXTENSION - For understanding interaction patterns
// ============================================================================

export interface TemporalExtension {
  time_since_last_interaction?: number;
  interaction_velocity?: number; // interactions per minute
  idle_time?: number;
  time_of_day?: string;
  day_of_week?: number;
}

// ============================================================================
// BEHAVIORAL EXTENSION - For ML/analytics
// ============================================================================

export interface BehavioralExtension {
  interaction_count?: number;
  frequency?: Record<string, number>;
  patterns?: Array<{
    pattern_type: string;
    confidence: number;
  }>;
  user_expertise?: 'beginner' | 'intermediate' | 'expert';
  task_type?: string;
}

// ============================================================================
// TOOL-SPECIFIC SCHEMAS
// ============================================================================

// Figma-specific interaction data
export interface FigmaInteractionExtension {
  node?: {
    id: string;
    type: string;
    name: string;
    locked?: boolean;
    visible?: boolean;
    plugin_data?: Record<string, any>;
  };
  page?: {
    id: string;
    name: string;
  };
  auto_layout?: {
    mode: string;
    direction?: string;
    spacing?: number;
  };
  constraints?: {
    horizontal: string;
    vertical: string;
  };
  component_info?: {
    is_component: boolean;
    is_instance: boolean;
    main_component_id?: string;
    has_variants?: boolean;
  };
}

// Code editor specific (VS Code, etc.)
export interface CodeEditorInteractionExtension {
  file?: {
    path: string;
    language: string;
    line_count: number;
  };
  cursor?: {
    line: number;
    column: number;
  };
  selection?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
    text?: string;
  };
  edit_type?: 'insert' | 'delete' | 'replace' | 'format';
}

// Browser/web specific
export interface BrowserInteractionExtension {
  dom?: {
    tag: string;
    id?: string;
    classes?: string[];
    xpath?: string;
  };
  page?: {
    url: string;
    title: string;
  };
  device?: {
    type: 'desktop' | 'mobile' | 'tablet';
    viewport: { width: number; height: number };
  };
}

// ============================================================================
// CONTENT-AWARE EXTENSIONS (based on what's being interacted with)
// ============================================================================

// Text content interactions
export interface TextInteractionExtension {
  text_content?: {
    content: string;
    length: number;
    language?: string;
  };
  typography?: {
    font_family: string;
    font_size: number;
    font_weight: string;
    line_height: number;
  };
  formatting?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    alignment?: string;
  };
}

// Vector/graphic interactions
export interface VectorInteractionExtension {
  vector_data?: {
    path_count: number;
    has_curves: boolean;
    complexity_score?: number;
  };
  fill?: {
    type: string;
    color?: string;
    gradient?: any;
  };
  stroke?: {
    weight: number;
    color?: string;
    style?: string;
  };
}

// Image interactions
export interface ImageInteractionExtension {
  image_data?: {
    url?: string;
    hash?: string;
    dimensions: { width: number; height: number };
    format?: string;
    size_bytes?: number;
  };
  filters?: Array<{
    type: string;
    value: any;
  }>;
}

// ============================================================================
// COMPOSITE INTERACTION EVENT (combines all extensions)
// ============================================================================

export interface CompositeInteractionEvent extends BaseInteractionEvent {
  // Core extensions
  spatial?: SpatialExtension;
  selection?: SelectionExtension;
  modification?: ModificationExtension;
  temporal?: TemporalExtension;
  behavioral?: BehavioralExtension;
  
  // Tool-specific extensions
  figma?: FigmaInteractionExtension;
  code_editor?: CodeEditorInteractionExtension;
  browser?: BrowserInteractionExtension;
  
  // Content-aware extensions
  text?: TextInteractionExtension;
  vector?: VectorInteractionExtension;
  image?: ImageInteractionExtension;
}

// ============================================================================
// SCHEMA REGISTRY - Maps tool/artifact types to required extensions
// ============================================================================

export interface SchemaDefinition {
  base: boolean;
  required_extensions: string[];
  optional_extensions: string[];
  tool_extension?: string;
  content_extensions?: string[];
}

export const SCHEMA_REGISTRY: Record<string, SchemaDefinition> = {
  // Figma schemas
  'figma:selection': {
    base: true,
    required_extensions: ['spatial', 'selection', 'temporal'],
    optional_extensions: ['behavioral'],
    tool_extension: 'figma',
    content_extensions: [],
  },
  'figma:text_selection': {
    base: true,
    required_extensions: ['spatial', 'selection', 'temporal'],
    optional_extensions: ['behavioral'],
    tool_extension: 'figma',
    content_extensions: ['text'],
  },
  'figma:modification': {
    base: true,
    required_extensions: ['spatial', 'modification', 'temporal'],
    optional_extensions: ['behavioral', 'selection'],
    tool_extension: 'figma',
    content_extensions: [],
  },
  'figma:vector_modification': {
    base: true,
    required_extensions: ['spatial', 'modification', 'temporal'],
    optional_extensions: ['behavioral', 'selection'],
    tool_extension: 'figma',
    content_extensions: ['vector'],
  },
  
  // Code editor schemas
  'vscode:selection': {
    base: true,
    required_extensions: ['selection', 'temporal'],
    optional_extensions: ['behavioral'],
    tool_extension: 'code_editor',
    content_extensions: [],
  },
  'vscode:edit': {
    base: true,
    required_extensions: ['modification', 'temporal'],
    optional_extensions: ['behavioral', 'selection'],
    tool_extension: 'code_editor',
    content_extensions: [],
  },
  
  // Browser schemas
  'browser:click': {
    base: true,
    required_extensions: ['selection', 'temporal'],
    optional_extensions: ['behavioral', 'spatial'],
    tool_extension: 'browser',
    content_extensions: [],
  },
};

// ============================================================================
// SCHEMA RESOLVER - Determines which extensions to use
// ============================================================================

export class InteractionSchemaResolver {
  /**
   * Resolve schema based on tool, event type, and artifact type
   */
  static resolve(
    tool: ToolType,
    eventType: InteractionEventType,
    artifactType?: string
  ): SchemaDefinition {
    // Try specific schema
    const specificKey = `${tool}:${eventType}`;
    if (SCHEMA_REGISTRY[specificKey]) {
      return SCHEMA_REGISTRY[specificKey];
    }
    
    // Try with artifact type
    if (artifactType) {
      const artifactKey = `${tool}:${artifactType}_${eventType}`;
      if (SCHEMA_REGISTRY[artifactKey]) {
        return SCHEMA_REGISTRY[artifactKey];
      }
    }
    
    // Return default schema
    return {
      base: true,
      required_extensions: ['temporal'],
      optional_extensions: ['spatial', 'selection', 'behavioral'],
      tool_extension: tool,
      content_extensions: [],
    };
  }
  
  /**
   * Validate that an event has required extensions
   */
  static validate(event: CompositeInteractionEvent, schema: SchemaDefinition): boolean {
    for (const ext of schema.required_extensions) {
      if (!(ext in event)) {
        return false;
      }
    }
    return true;
  }
  
  /**
   * Get extension keys for a schema
   */
  static getExtensionKeys(schema: SchemaDefinition): string[] {
    const keys = [...schema.required_extensions, ...schema.optional_extensions];
    if (schema.tool_extension) keys.push(schema.tool_extension);
    if (schema.content_extensions) keys.push(...schema.content_extensions);
    return [...new Set(keys)];
  }
}

// ============================================================================
// SCHEMA BUILDER - Constructs events with proper extensions
// ============================================================================

export class InteractionEventBuilder {
  private event: Partial<CompositeInteractionEvent>;
  private schema: SchemaDefinition;
  
  constructor(
    tool: ToolType,
    eventType: InteractionEventType,
    artifactType?: string
  ) {
    this.schema = InteractionSchemaResolver.resolve(tool, eventType, artifactType);
    this.event = {
      event_id: this.generateEventId(),
      event_type: eventType,
      timestamp: Date.now(),
      tool,
      artifact_type: artifactType,
    };
  }
  
  // Base properties
  setSessionId(sessionId: string): this {
    this.event.session_id = sessionId;
    return this;
  }
  
  setUserId(userId: string): this {
    this.event.user_id = userId;
    return this;
  }
  
  setToolVersion(version: string): this {
    this.event.tool_version = version;
    return this;
  }
  
  setArtifactId(artifactId: string): this {
    this.event.artifact_id = artifactId;
    return this;
  }
  
  // Extension setters
  setSpatial(spatial: SpatialExtension): this {
    this.event.spatial = spatial;
    return this;
  }
  
  setSelection(selection: SelectionExtension): this {
    this.event.selection = selection;
    return this;
  }
  
  setModification(modification: ModificationExtension): this {
    this.event.modification = modification;
    return this;
  }
  
  setTemporal(temporal: TemporalExtension): this {
    this.event.temporal = temporal;
    return this;
  }
  
  setBehavioral(behavioral: BehavioralExtension): this {
    this.event.behavioral = behavioral;
    return this;
  }
  
  // Tool-specific extensions
  setFigmaExtension(figma: FigmaInteractionExtension): this {
    this.event.figma = figma;
    return this;
  }
  
  setCodeEditorExtension(codeEditor: CodeEditorInteractionExtension): this {
    this.event.code_editor = codeEditor;
    return this;
  }
  
  setBrowserExtension(browser: BrowserInteractionExtension): this {
    this.event.browser = browser;
    return this;
  }
  
  // Content-aware extensions
  setTextExtension(text: TextInteractionExtension): this {
    this.event.text = text;
    return this;
  }
  
  setVectorExtension(vector: VectorInteractionExtension): this {
    this.event.vector = vector;
    return this;
  }
  
  setImageExtension(image: ImageInteractionExtension): this {
    this.event.image = image;
    return this;
  }
  
  // Generic extension setter
  setExtension(key: string, value: any): this {
    if (!this.event.extensions) {
      this.event.extensions = {};
    }
    this.event.extensions[key] = value;
    return this;
  }
  
  // Build and validate
  build(): CompositeInteractionEvent {
    const event = this.event as CompositeInteractionEvent;
    
    if (!InteractionSchemaResolver.validate(event, this.schema)) {
      throw new Error('Event does not satisfy schema requirements');
    }
    
    return event;
  }
  
  // Build without validation (for partial events)
  buildPartial(): CompositeInteractionEvent {
    return this.event as CompositeInteractionEvent;
  }
  
  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// ============================================================================
// CONVENIENCE FACTORY FUNCTIONS
// ============================================================================

export class InteractionEventFactory {
  /**
   * Create a Figma selection event
   */
  static createFigmaSelection(
    sessionId: string,
    node: SceneNode,
    viewport: SpatialExtension['viewport']
  ): CompositeInteractionEvent {
    return new InteractionEventBuilder('figma', 'selection')
      .setSessionId(sessionId)
      .setToolVersion('latest')
      .setArtifactId(node.id)
      .setSpatial({ viewport })
      .setSelection({
        target: {
          id: node.id,
          type: node.type,
          name: node.name,
        },
        selection_mode: 'single',
        selection_method: 'click',
      })
      .setTemporal({
        time_since_last_interaction: 0,
      })
      .setFigmaExtension({
        node: {
          id: node.id,
          type: node.type,
          name: node.name,
          locked: node.locked,
          visible: node.visible,
        },
        page: {
          id: figma.currentPage.id,
          name: figma.currentPage.name,
        },
      })
      .build();
  }
  
  /**
   * Create a Figma text interaction event
   */
  static createFigmaTextInteraction(
    sessionId: string,
    textNode: TextNode,
    viewport: SpatialExtension['viewport']
  ): CompositeInteractionEvent {
    const fontName = textNode.fontName !== figma.mixed ? textNode.fontName : null;
    
    return new InteractionEventBuilder('figma', 'selection', 'text')
      .setSessionId(sessionId)
      .setToolVersion('latest')
      .setArtifactId(textNode.id)
      .setSpatial({ viewport })
      .setSelection({
        target: {
          id: textNode.id,
          type: textNode.type,
          name: textNode.name,
        },
        selection_mode: 'single',
      })
      .setTemporal({})
      .setFigmaExtension({
        node: {
          id: textNode.id,
          type: textNode.type,
          name: textNode.name,
        },
        page: {
          id: figma.currentPage.id,
          name: figma.currentPage.name,
        },
      })
      .setTextExtension({
        text_content: {
          content: textNode.characters,
          length: textNode.characters.length,
        },
        typography: fontName ? {
          font_family: fontName.family,
          font_size: typeof textNode.fontSize === 'number' ? textNode.fontSize : 16,
          font_weight: fontName.style,
          line_height: typeof textNode.lineHeight === 'object' && 'value' in textNode.lineHeight 
            ? textNode.lineHeight.value 
            : 1.2,
        } : undefined,
      })
      .build();
  }
}

// ============================================================================
// SCHEMA VERSIONING - For evolution over time
// ============================================================================

export interface SchemaVersion {
  version: string;
  released: string;
  changes: string[];
  migration?: (event: any) => CompositeInteractionEvent;
}

export const SCHEMA_VERSIONS: SchemaVersion[] = [
  {
    version: '1.0.0',
    released: '2026-01-22',
    changes: ['Initial schema with base + spatial + selection + temporal extensions'],
  },
  {
    version: '1.1.0',
    released: '2026-01-22',
    changes: [
      'Added tool-specific extensions (Figma, VS Code, Browser)',
      'Added content-aware extensions (Text, Vector, Image)',
      'Added schema registry and resolver',
    ],
  },
];

export const CURRENT_SCHEMA_VERSION = '1.1.0';

