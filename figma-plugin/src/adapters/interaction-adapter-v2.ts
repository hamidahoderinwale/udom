/**
 * Schema-Aware Interaction Adapter (v2)
 * 
 * Uses the extensible interaction schema system to track user behavior
 * with proper tool-specific and content-aware extensions.
 */

import {
  CompositeInteractionEvent,
  InteractionEventBuilder,
  InteractionEventFactory,
  InteractionSchemaResolver,
  SpatialExtension,
  TemporalExtension,
  BehavioralExtension,
  FigmaInteractionExtension,
  TextInteractionExtension,
  VectorInteractionExtension,
  CURRENT_SCHEMA_VERSION,
} from '../schemas/interaction-schema';

export interface InteractionContext {
  recent_events: CompositeInteractionEvent[];
  event_frequency: Record<string, number>;
  average_time_between_events: number;
  total_events: number;
  session_stats: {
    duration: number;
    events_per_minute: number;
    most_common_event_type: string;
  };
}

export class SchemaAwareInteractionAdapter {
  private events: CompositeInteractionEvent[] = [];
  private eventFrequency: Map<string, number> = new Map();
  private lastEventTime: number = 0;
  private timeBetweenEvents: number[] = [];
  private readonly sessionId: string;
  private readonly sessionStart: number;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || this.generateSessionId();
    this.sessionStart = Date.now();
  }

  // ============================================================================
  // FIGMA-SPECIFIC EVENT TRACKING
  // ============================================================================

  /**
   * Track Figma selection with full schema support
   */
  trackFigmaSelection(node: SceneNode): CompositeInteractionEvent {
    const event = this.buildFigmaEvent(node, 'selection');
    this.recordEvent(event);
    return event;
  }

  /**
   * Track Figma text node interaction
   */
  trackFigmaTextSelection(textNode: TextNode): CompositeInteractionEvent {
    const event = this.buildFigmaTextEvent(textNode);
    this.recordEvent(event);
    return event;
  }

  /**
   * Track Figma vector node interaction
   */
  trackFigmaVectorSelection(vectorNode: SceneNode): CompositeInteractionEvent {
    const event = this.buildFigmaVectorEvent(vectorNode);
    this.recordEvent(event);
    return event;
  }

  /**
   * Track property modification
   */
  trackFigmaModification(
    node: SceneNode,
    changedProperties: Array<{ property: string; old_value: any; new_value: any }>
  ): CompositeInteractionEvent {
    const event = new InteractionEventBuilder('figma', 'modification')
      .setSessionId(this.sessionId)
      .setToolVersion('latest')
      .setArtifactId(node.id)
      .setSpatial(this.captureSpatial())
      .setModification({
        change_type: 'property',
        changed_properties: changedProperties,
        scope: 'single',
      })
      .setTemporal(this.captureTemporal())
      .setBehavioral(this.captureBehavioral())
      .setFigmaExtension(this.captureFigmaExtension(node))
      .build();

    this.recordEvent(event);
    return event;
  }

  /**
   * Track viewport change
   */
  trackViewportChange(): CompositeInteractionEvent {
    const event = new InteractionEventBuilder('figma', 'viewport_change')
      .setSessionId(this.sessionId)
      .setToolVersion('latest')
      .setSpatial(this.captureSpatial())
      .setTemporal(this.captureTemporal())
      .build();

    this.recordEvent(event);
    return event;
  }

  /**
   * Track capture action
   */
  trackCapture(node: SceneNode, isAuto: boolean): CompositeInteractionEvent {
    const event = new InteractionEventBuilder('figma', 'capture')
      .setSessionId(this.sessionId)
      .setToolVersion('latest')
      .setArtifactId(node.id)
      .setSpatial(this.captureSpatial())
      .setSelection({
        target: {
          id: node.id,
          type: node.type,
          name: node.name,
        },
        selection_mode: 'single',
      })
      .setTemporal(this.captureTemporal())
      .setBehavioral(this.captureBehavioral())
      .setFigmaExtension(this.captureFigmaExtension(node))
      .setExtension('capture_mode', isAuto ? 'automatic' : 'manual')
      .build();

    this.recordEvent(event);
    return event;
  }

  /**
   * Track toggle action (auto-capture on/off)
   */
  trackToggle(enabled: boolean): CompositeInteractionEvent {
    const event = new InteractionEventBuilder('figma', 'toggle')
      .setSessionId(this.sessionId)
      .setToolVersion('latest')
      .setTemporal(this.captureTemporal())
      .setBehavioral(this.captureBehavioral())
      .setExtension('toggle_state', enabled)
      .setExtension('toggle_type', 'auto_capture')
      .build();

    this.recordEvent(event);
    return event;
  }

  // ============================================================================
  // EVENT BUILDERS
  // ============================================================================

  private buildFigmaEvent(node: SceneNode, eventType: 'selection' | 'focus'): CompositeInteractionEvent {
    // Determine artifact type based on node content
    let artifactType: string | undefined;
    if (node.type === 'TEXT') artifactType = 'text';
    else if (node.type === 'VECTOR' || node.type === 'LINE' || node.type === 'ELLIPSE') artifactType = 'vector';
    else if (node.type === 'RECTANGLE' && 'fills' in node) {
      const fills = node.fills as readonly Paint[];
      if (fills.some(f => f.type === 'IMAGE')) artifactType = 'image';
    }

    const builder = new InteractionEventBuilder('figma', eventType, artifactType)
      .setSessionId(this.sessionId)
      .setToolVersion('latest')
      .setArtifactId(node.id)
      .setSpatial(this.captureSpatial())
      .setSelection({
        target: {
          id: node.id,
          type: node.type,
          name: node.name,
        },
        selection_mode: 'single',
        selection_method: 'click',
      })
      .setTemporal(this.captureTemporal())
      .setBehavioral(this.captureBehavioral())
      .setFigmaExtension(this.captureFigmaExtension(node));

    return builder.build();
  }

  private buildFigmaTextEvent(textNode: TextNode): CompositeInteractionEvent {
    const fontName = textNode.fontName !== figma.mixed ? textNode.fontName : null;

    return InteractionEventFactory.createFigmaTextInteraction(
      this.sessionId,
      textNode,
      this.captureSpatial().viewport!
    );
  }

  private buildFigmaVectorEvent(vectorNode: SceneNode): CompositeInteractionEvent {
    const builder = new InteractionEventBuilder('figma', 'selection', 'vector')
      .setSessionId(this.sessionId)
      .setToolVersion('latest')
      .setArtifactId(vectorNode.id)
      .setSpatial(this.captureSpatial())
      .setSelection({
        target: {
          id: vectorNode.id,
          type: vectorNode.type,
          name: vectorNode.name,
        },
        selection_mode: 'single',
      })
      .setTemporal(this.captureTemporal())
      .setBehavioral(this.captureBehavioral())
      .setFigmaExtension(this.captureFigmaExtension(vectorNode));

    // Add vector-specific data
    if ('fills' in vectorNode) {
      const fills = vectorNode.fills as readonly Paint[];
      const fill = fills[0];
      
      builder.setVectorExtension({
        vector_data: {
          path_count: 1, // Simplified
          has_curves: true,
        },
        fill: fill ? {
          type: fill.type,
          color: fill.type === 'SOLID' ? this.rgbToHex((fill as SolidPaint).color) : undefined,
        } : undefined,
      });
    }

    return builder.build();
  }

  // ============================================================================
  // EXTENSION CAPTURE HELPERS
  // ============================================================================

  private captureSpatial(): SpatialExtension {
    return {
      viewport: {
        zoom: figma.viewport.zoom,
        center: {
          x: figma.viewport.center.x,
          y: figma.viewport.center.y,
        },
        bounds: {
          x: figma.viewport.bounds.x,
          y: figma.viewport.bounds.y,
          width: figma.viewport.bounds.width,
          height: figma.viewport.bounds.height,
        },
      },
    };
  }

  private captureTemporal(): TemporalExtension {
    const now = Date.now();
    const timeSinceLast = this.lastEventTime > 0 ? now - this.lastEventTime : undefined;

    return {
      time_since_last_interaction: timeSinceLast,
      interaction_velocity: this.calculateVelocity(),
      time_of_day: new Date(now).toLocaleTimeString(),
      day_of_week: new Date(now).getDay(),
    };
  }

  private captureBehavioral(): BehavioralExtension {
    const eventCounts: Record<string, number> = {};
    this.events.forEach(e => {
      eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1;
    });

    return {
      interaction_count: this.events.length,
      frequency: eventCounts,
      user_expertise: this.inferExpertise(),
    };
  }

  private captureFigmaExtension(node: SceneNode): FigmaInteractionExtension {
    const extension: FigmaInteractionExtension = {
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
    };

    // Add auto-layout info if applicable
    if ('layoutMode' in node && node.layoutMode !== 'NONE') {
      extension.auto_layout = {
        mode: node.layoutMode,
        direction: node.layoutMode,
        spacing: (node as FrameNode).itemSpacing,
      };
    }

    // Add component info if applicable
    if (node.type === 'COMPONENT' || node.type === 'INSTANCE') {
      extension.component_info = {
        is_component: node.type === 'COMPONENT',
        is_instance: node.type === 'INSTANCE',
        main_component_id: node.type === 'INSTANCE' ? (node as InstanceNode).mainComponent?.id : undefined,
      };
    }

    return extension;
  }

  // ============================================================================
  // CONTEXT & ANALYTICS
  // ============================================================================

  getContext(): InteractionContext {
    const avgTime =
      this.timeBetweenEvents.length > 0
        ? this.timeBetweenEvents.reduce((a, b) => a + b, 0) / this.timeBetweenEvents.length
        : 0;

    const eventCounts: Record<string, number> = {};
    this.events.forEach(e => {
      eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1;
    });

    const mostCommon = Object.entries(eventCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      recent_events: this.events.slice(-10),
      event_frequency: eventCounts,
      average_time_between_events: Math.round(avgTime),
      total_events: this.events.length,
      session_stats: {
        duration: Date.now() - this.sessionStart,
        events_per_minute: this.calculateEventsPerMinute(),
        most_common_event_type: mostCommon ? mostCommon[0] : 'none',
      },
    };
  }

  getRecentEvents(limit: number = 10): CompositeInteractionEvent[] {
    return this.events.slice(-limit);
  }

  getEventsByType(eventType: string): CompositeInteractionEvent[] {
    return this.events.filter(e => e.event_type === eventType);
  }

  getSessionStats() {
    const duration = Date.now() - this.sessionStart;
    return {
      session_id: this.sessionId,
      duration,
      total_events: this.events.length,
      events_per_minute: this.calculateEventsPerMinute(),
      schema_version: CURRENT_SCHEMA_VERSION,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private recordEvent(event: CompositeInteractionEvent): void {
    this.events.push(event);

    // Update frequency
    const count = this.eventFrequency.get(event.event_type) || 0;
    this.eventFrequency.set(event.event_type, count + 1);

    // Update temporal tracking
    if (this.lastEventTime > 0) {
      const timeDiff = event.timestamp - this.lastEventTime;
      this.timeBetweenEvents.push(timeDiff);
    }
    this.lastEventTime = event.timestamp;

    // Keep only last 100 events
    if (this.events.length > 100) {
      this.events = this.events.slice(-100);
    }
  }

  private calculateVelocity(): number {
    if (this.events.length < 2) return 0;
    const duration = (Date.now() - this.sessionStart) / 60000; // minutes
    return duration > 0 ? this.events.length / duration : 0;
  }

  private calculateEventsPerMinute(): number {
    const duration = (Date.now() - this.sessionStart) / 60000;
    return duration > 0 ? this.events.length / duration : 0;
  }

  private inferExpertise(): 'beginner' | 'intermediate' | 'expert' {
    const epm = this.calculateEventsPerMinute();
    if (epm > 20) return 'expert';
    if (epm > 10) return 'intermediate';
    return 'beginner';
  }

  private rgbToHex(color: RGB): string {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  reset(): void {
    this.events = [];
    this.eventFrequency.clear();
    this.lastEventTime = 0;
    this.timeBetweenEvents = [];
  }
}


