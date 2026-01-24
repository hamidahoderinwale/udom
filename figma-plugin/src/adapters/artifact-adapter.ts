import { extractStructure } from '../extractors/structure-extractor';
import { extractCompositionRules } from '../extractors/composition-extractor';
import { generateStableId } from '../utils/stable-id';
import { generateUUID } from '../utils/uuid';
import { generateImageHash } from '../utils/image-hash';
import { dbClient } from '../api/db-client';
import { DiffComputer } from '../utils/diff-computer';
import type { uDOMSnapshot, uDOMRelation, Provenance, Context, Intent, RenderingManifest } from '../types/udom';
import type { InteractionAdapter } from './interaction-adapter';

const SCHEMA_VERSION = '1.0.0';
const EXTRACTOR_VERSION = 'figma-adapter-v1.1.0';

export class ArtifactAdapter {
  private readonly sessionId: string;
  private interactionAdapter?: InteractionAdapter;
  private captureCount: number = 0;
  private previousSnapshots: Map<string, uDOMSnapshot> = new Map(); // artifact_id -> previous snapshot
  private readonly MAX_CACHED_SNAPSHOTS = 50; // Limit memory usage
  private diffComputer: DiffComputer;

  constructor(interactionAdapter?: InteractionAdapter) {
    this.sessionId = this.generateSessionId();
    this.interactionAdapter = interactionAdapter;
    this.diffComputer = new DiffComputer();
  }

  async captureSnapshot(node: SceneNode, isAuto: boolean = false, userIntent?: string, actionId?: string | null): Promise<{ snapshot: uDOMSnapshot; previousSnapshot: uDOMSnapshot | null }> {
    // Capture screenshot first
    const screenshot = await this.captureScreenshot(node);
    
    this.captureCount++;
    
    // Track the capture in interaction adapter
    if (this.interactionAdapter) {
      this.interactionAdapter.trackCapture(node, isAuto);
    }
    
    const artifactId = this.buildArtifactId(node);
    
    // Get previous snapshot for this artifact (before storing new one)
    // This enables before/after comparison for rule matching and change detection
    let previousSnapshot: uDOMSnapshot | null = this.previousSnapshots.get(artifactId) || null;
    
    const [elements, stableId, compositionRules] = await Promise.all([
      extractStructure(node),
      generateStableId(node),
      Promise.resolve(extractCompositionRules(node)),
    ]);

    // Build snapshot with previous snapshot context for intent inference
    const snapshot = await this.buildSnapshot(node, elements, stableId, compositionRules, isAuto, screenshot, previousSnapshot, userIntent);
    
    // If no previous snapshot in memory, try to fetch from database
    // This handles cases where plugin was restarted or artifact was captured before
    if (!previousSnapshot) {
      try {
        const previousSnapshots = await dbClient.querySnapshots({
          artifact_id: artifactId,
          timestamp_to: snapshot.metadata.timestamp - 1, // Before current timestamp
        });
        if (previousSnapshots.length > 0) {
          // Get the most recent previous snapshot (database returns DESC order)
          previousSnapshot = previousSnapshots[0];
          // Update intent with actual previous snapshot
          if (snapshot.observations.intent) {
            snapshot.observations.intent.previous_snapshot_id = previousSnapshot.metadata.snapshot_id;
          }
        }
      } catch (error) {
        // Silently handle - previous snapshot is optional for first capture
      }
    }

    try {
      await dbClient.storeSnapshot(snapshot);
      
      // Compute and store diff if previous snapshot exists
      if (previousSnapshot) {
        try {
          const diff = this.diffComputer.computeDiff(previousSnapshot, snapshot);
          
          // Store diff via API, linking to preference action if provided
          await fetch('http://localhost:3000/changes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              diff,
              action_id: actionId || null, // Link to preference event if available
            }),
          }).catch(err => {
            // Silently handle - diff storage is optional enhancement
          });
          
          // Update intent with inferred intent and change summary
          if (snapshot.observations.intent) {
            snapshot.observations.intent.change_summary = this.generateChangeSummaryFromDiff(diff);
            
            // Infer intent from diff if not already set
            if (!snapshot.observations.intent.inferred_intent) {
              const inferred = this.inferIntentFromChanges(previousSnapshot, snapshot);
              if (inferred) {
                snapshot.observations.intent.inferred_intent = inferred;
              }
            }
          }
        } catch (error) {
          // Silently handle - diff computation is optional
        }
      }
      
      // Store current snapshot as previous for next capture
      this.previousSnapshots.set(artifactId, snapshot);
      
      // Limit memory usage by keeping only recent snapshots
      if (this.previousSnapshots.size > this.MAX_CACHED_SNAPSHOTS) {
        // Remove oldest entry (Map maintains insertion order)
        const firstKey = this.previousSnapshots.keys().next().value;
        if (firstKey) {
          this.previousSnapshots.delete(firstKey);
        }
      }
      
      return { snapshot, previousSnapshot };
    } catch (error) {
      throw error;
    }
  }

  private async captureScreenshot(node: SceneNode): Promise<{ data: string; hash: string; width: number; height: number } | null> {
    try {
      // TEXT nodes and some other types don't support exportAsync directly
      // Try to find an exportable parent (FRAME, COMPONENT, INSTANCE) if needed
      let exportNode: SceneNode = node;
      
      if (node.type === 'TEXT' || !('exportAsync' in node)) {
        // Try to find a parent frame or component that can be exported
        let parent: BaseNode | null = node.parent;
        let foundParent = false;
        
        while (parent && parent.type !== 'PAGE' && parent.type !== 'DOCUMENT') {
          if (parent.type === 'FRAME' || parent.type === 'COMPONENT' || parent.type === 'INSTANCE' || parent.type === 'GROUP') {
            if ('exportAsync' in parent) {
              exportNode = parent as SceneNode;
              foundParent = true;
              break;
            }
          }
          parent = parent.parent;
        }
        
        if (!foundParent || !('exportAsync' in exportNode)) {
          return null;
        }
      }

      if (!('exportAsync' in exportNode)) {
        return null;
      }

      // Export as PNG at 2x resolution
      const imageData = await exportNode.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
      
      if (!imageData || imageData.length === 0) {
        return null;
      }
      
      // Convert to base64
      const base64 = figma.base64Encode(imageData);
      const dataUrl = `data:image/png;base64,${base64}`;
      
      // Generate hash for deduplication (with fallback if crypto API not available)
      let hash: string;
      try {
        hash = await generateImageHash(imageData);
      } catch (hashError) {
        // Fallback: simple hash based on data length and first few bytes
        const sample = Array.from(imageData.slice(0, 100));
        hash = `${imageData.length}_${sample.join('')}`.substring(0, 16);
      }
      
      return {
        data: dataUrl,
        hash: hash,
        width: exportNode.width * 2,
        height: exportNode.height * 2
      };
    } catch (error) {
      return null;
    }
  }

  private async buildSnapshot(
    node: SceneNode,
    elements: any[],
    stableId: string,
    compositionRules: any,
    isAuto: boolean = false,
    screenshot: { data: string; hash: string; width: number; height: number } | null = null,
    previousSnapshot: uDOMSnapshot | null = null,
    userIntent?: string
  ): Promise<uDOMSnapshot> {
    const snapshot: uDOMSnapshot = {
      metadata: {
        snapshot_id: generateUUID(),
        artifact_id: this.buildArtifactId(node),
        artifact_type: 'figma_component',
        timestamp: Date.now(),
        content_hash: stableId,
        schema_version: SCHEMA_VERSION,
      },
      elements,
      relations: this.extractRelations(node),
      observations: {
        provenance: this.buildProvenance(),
        context: this.buildContext(node),
        intent: this.buildIntent(isAuto, previousSnapshot, userIntent, null), // Will be updated after snapshot is built
      },
    };

    if (compositionRules) {
      snapshot.composition_rules = compositionRules;
    }

    // Add rendering manifest with screenshot if available
    if (screenshot) {
      snapshot.rendering_manifest = {
        viewport: {
          width: node.width,
          height: node.height,
          dpr: 2,
          scale: 1,
          coordinate_system: 'canvas'
        },
        assets: {
          images: [{
            id: `screenshot_${snapshot.metadata.snapshot_id}`,
            url: screenshot.data,
            hash: screenshot.hash,
            dimensions: { width: screenshot.width, height: screenshot.height },
            format: 'png'
          }]
        }
      };
    }

    return snapshot;
  }

  private buildArtifactId(node: SceneNode): string {
    return `figma://file/${figma.fileKey}/node/${node.id}`;
  }

  private buildProvenance(): Provenance {
    return {
      user_id: figma.currentUser?.id || 'anonymous',
      user_name: figma.currentUser?.name || 'Unknown',
      session_id: this.sessionId,
      tool: 'figma',
      tool_version: 'latest',
      extraction_method: 'figma_plugin_api',
      extracted_at: Date.now(),
      extractor_version: EXTRACTOR_VERSION,
      extraction_quality: 'complete',
    };
  }

  private extractRelations(node: SceneNode): uDOMRelation[] {
    const relations: uDOMRelation[] = [];

    const traverse = (n: SceneNode): void => {
      if ('children' in n) {
        const children = (n as ChildrenMixin).children;
        
        children.forEach((child, index) => {
          relations.push({
            type: 'parent_child',
            from: n.id,
            to: child.id,
            properties: { order: index },
          });

          if (index > 0) {
            relations.push({
              type: 'sibling',
              from: children[index - 1].id,
              to: child.id,
              properties: {},
            });
          }

          traverse(child);
        });
      }
    };

    traverse(node);
    return relations;
  }

  private buildContext(node: SceneNode): Context {
    const context: Context = {
      file_name: figma.root.name,
      page_name: figma.currentPage.name,
      workspace_id: figma.fileKey || 'unknown',
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

    if (this.interactionAdapter) {
      // Get nearby elements
      context.nearby_elements = this.interactionAdapter.getNearbyNodes(node, 500);
      
      // Get tags
      context.tags = this.interactionAdapter.getNodeTags(node);
      
      // Get interaction history
      const interactionContext = this.interactionAdapter.getContext();
      context.interaction_history = {
        ...interactionContext,
        most_frequent_nodes: this.interactionAdapter.getMostFrequentNodes(5),
        session_stats: this.interactionAdapter.getSessionStats(),
      };
    }

    return context;
  }

  private buildIntent(isAuto: boolean, previousSnapshot: uDOMSnapshot | null = null, userIntent?: string): Intent {
    const intent: Intent = {
      source: 'figma_plugin',
      change_type: 'capture',
      scope: 'component',
      motivation: isAuto ? 'automated_tracking' : 'explicit_capture',
      trigger: isAuto ? 'auto_capture' : 'manual_capture',
      capture_number: this.captureCount,
    };

    // Add user intent if provided
    if (userIntent) {
      intent.user_intent = userIntent;
    }

    // Link to previous snapshot if available
    // Note: Inferred intent will be computed after snapshot is built (when we have both snapshots)
    if (previousSnapshot) {
      intent.previous_snapshot_id = previousSnapshot.metadata.snapshot_id;
    }

    return intent;
  }

  private inferIntentFromChanges(previousSnapshot: uDOMSnapshot, currentSnapshot: uDOMSnapshot): Intent['inferred_intent'] | null {
    if (!previousSnapshot || !currentSnapshot) {
      return null;
    }

    try {
      // Compute diff to analyze changes
      const diff = this.diffComputer.computeDiff(previousSnapshot, currentSnapshot);
      
      // Determine action type based on change patterns
      const actionType = this.inferActionType(diff);
      
      // Determine focus area based on property changes
      const focusArea = this.inferFocusArea(diff);
      
      // Calculate confidence based on change clarity
      const confidence = this.calculateConfidence(diff);
      
      if (actionType && focusArea) {
        return {
          action_type: actionType,
          focus_area: focusArea,
          confidence,
        };
      }
    } catch (error) {
      console.warn('[ArtifactAdapter] Error inferring intent:', error);
    }
    
    return null;
  }

  private inferActionType(diff: any): 'create' | 'modify' | 'refine' | 'explore' | null {
    const { summary } = diff;
    
    // Create: Many new elements added
    if (summary.added_count > summary.modified_count && summary.added_count > 2) {
      return 'create';
    }
    
    // Refine: Many property changes, few structural changes
    if (summary.total_property_changes > summary.added_count + summary.removed_count && summary.total_property_changes > 3) {
      return 'refine';
    }
    
    // Modify: Mix of additions, removals, and modifications
    if (summary.modified_count > 0 || summary.added_count > 0 || summary.removed_count > 0) {
      return 'modify';
    }
    
    // Explore: Minimal changes, likely just viewing/selecting
    if (summary.total_property_changes <= 1) {
      return 'explore';
    }
    
    return null;
  }

  private inferFocusArea(diff: any): 'spacing' | 'typography' | 'color' | 'layout' | 'hierarchy' | 'interaction' | null {
    const propertyChanges = diff.element_changes?.flatMap((change: any) => change.property_changes || []) || [];
    
    // Count property types
    const propertyTypes = {
      spacing: 0,
      typography: 0,
      color: 0,
      layout: 0,
      hierarchy: 0,
      interaction: 0,
    };
    
    for (const change of propertyChanges) {
      const path = change.path.toLowerCase();
      const prop = change.property?.toLowerCase() || '';
      
      // Spacing
      if (path.includes('spacing') || path.includes('padding') || path.includes('margin') || 
          path.includes('gap') || prop.includes('spacing') || prop.includes('padding') || prop.includes('margin')) {
        propertyTypes.spacing++;
      }
      
      // Typography
      if (path.includes('font') || path.includes('text') || path.includes('typography') ||
          prop.includes('font') || prop.includes('text') || prop.includes('typography') ||
          prop.includes('size') || prop.includes('weight') || prop.includes('lineheight')) {
        propertyTypes.typography++;
      }
      
      // Color
      if (path.includes('color') || path.includes('fill') || path.includes('stroke') ||
          prop.includes('color') || prop.includes('fill') || prop.includes('stroke') ||
          prop.includes('rgb') || prop.includes('hex')) {
        propertyTypes.color++;
      }
      
      // Layout
      if (path.includes('layout') || path.includes('position') || path.includes('align') ||
          prop.includes('layout') || prop.includes('position') || prop.includes('align') ||
          prop.includes('x') || prop.includes('y') || prop.includes('width') || prop.includes('height')) {
        propertyTypes.layout++;
      }
      
      // Hierarchy
      if (path.includes('z') || path.includes('order') || path.includes('layer') ||
          prop.includes('zindex') || prop.includes('order') || prop.includes('layer')) {
        propertyTypes.hierarchy++;
      }
      
      // Interaction
      if (path.includes('interaction') || path.includes('hover') || path.includes('pressed') ||
          prop.includes('interaction') || prop.includes('hover') || prop.includes('pressed')) {
        propertyTypes.interaction++;
      }
    }
    
    // Return focus area with highest count
    const maxCount = Math.max(...Object.values(propertyTypes));
    if (maxCount === 0) {
      // Fallback: check element types for structural hints
      const addedTypes = diff.element_changes
        ?.filter((c: any) => c.change_type === 'added')
        .map((c: any) => c.element_type?.toLowerCase()) || [];
      
      if (addedTypes.some((t: string) => t?.includes('text'))) {
        return 'typography';
      }
      if (addedTypes.some((t: string) => t?.includes('frame') || t?.includes('group'))) {
        return 'layout';
      }
      
      return 'layout'; // Default fallback
    }
    
    const focusArea = Object.entries(propertyTypes).find(([_, count]) => count === maxCount)?.[0];
    return focusArea as any || null;
  }

  private calculateConfidence(diff: any): number {
    const { summary } = diff;
    let confidence = 0.5; // Base confidence
    
    // More changes = higher confidence (clearer intent)
    const totalChanges = summary.added_count + summary.removed_count + summary.modified_count;
    if (totalChanges > 0) {
      confidence += Math.min(0.2, totalChanges * 0.05);
    }
    
    // Property changes indicate specific intent
    if (summary.total_property_changes > 0) {
      confidence += Math.min(0.2, summary.total_property_changes * 0.03);
    }
    
    // Clear focus area (one dominant property type) increases confidence
    const propertyChanges = diff.element_changes?.flatMap((change: any) => change.property_changes || []) || [];
    if (propertyChanges.length > 0) {
      const propertyTypes = new Set(propertyChanges.map((c: any) => {
        const path = c.path.toLowerCase();
        if (path.includes('spacing') || path.includes('padding') || path.includes('margin')) return 'spacing';
        if (path.includes('font') || path.includes('text') || path.includes('typography')) return 'typography';
        if (path.includes('color') || path.includes('fill') || path.includes('stroke')) return 'color';
        if (path.includes('layout') || path.includes('position') || path.includes('align')) return 'layout';
        return 'other';
      }));
      
      // Single focus area = higher confidence
      if (propertyTypes.size === 1) {
        confidence += 0.1;
      }
    }
    
    return Math.min(0.95, Math.max(0.3, confidence));
  }

  private generateChangeSummary(previousSnapshot: uDOMSnapshot): string {
    // Generate a text summary of changes
    // For now, return a simple message
    return `Snapshot captured after previous state at ${new Date(previousSnapshot.metadata.timestamp).toISOString()}`;
  }

  private generateChangeSummaryFromDiff(diff: any): string {
    const { summary } = diff;
    const parts: string[] = [];
    
    if (summary.added_count > 0) parts.push(`${summary.added_count} added`);
    if (summary.removed_count > 0) parts.push(`${summary.removed_count} removed`);
    if (summary.modified_count > 0) parts.push(`${summary.modified_count} modified`);
    if (summary.total_property_changes > 0) parts.push(`${summary.total_property_changes} property changes`);
    
    return parts.length > 0 
      ? `Changes: ${parts.join(', ')}`
      : 'No changes detected';
  }

  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `session_${timestamp}_${random}`;
  }
}


