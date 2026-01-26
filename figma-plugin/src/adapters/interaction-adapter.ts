/**
 * Interaction Adapter - Tracks user behavior and context
 */

export interface InteractionEvent {
  type: 'selection' | 'viewport_change' | 'capture' | 'toggle';
  timestamp: number;
  node_id?: string;
  node_name?: string;
  viewport?: {
    zoom: number;
    center: { x: number; y: number };
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  metadata?: Record<string, any>;
}

export interface InteractionContext {
  recent_selections: Array<{
    node_id: string;
    node_name: string;
    timestamp: number;
    duration?: number;
  }>;
  selection_frequency: Record<string, number>;
  average_time_between_selections: number;
  total_selections: number;
  viewport_changes: number;
  capture_count: number;
}

export class InteractionAdapter {
  private interactions: InteractionEvent[] = [];
  private selectionHistory: Map<string, number> = new Map();
  private lastSelectionTime: number = 0;
  private timeBetweenSelections: number[] = [];
  private captureCount: number = 0;

  trackSelection(node: SceneNode): void {
    const now = Date.now();

    // Track time between selections
    if (this.lastSelectionTime > 0) {
      const timeDiff = now - this.lastSelectionTime;
      this.timeBetweenSelections.push(timeDiff);
    }
    this.lastSelectionTime = now;

    // Update frequency map
    const count = this.selectionHistory.get(node.id) || 0;
    this.selectionHistory.set(node.id, count + 1);

    // Record interaction event
    this.interactions.push({
      type: 'selection',
      timestamp: now,
      node_id: node.id,
      node_name: node.name,
      viewport: this.captureViewport(),
    });

    // Keep only last 100 interactions to prevent memory issues
    if (this.interactions.length > 100) {
      this.interactions = this.interactions.slice(-100);
    }
  }

  trackViewportChange(): void {
    this.interactions.push({
      type: 'viewport_change',
      timestamp: Date.now(),
      viewport: this.captureViewport(),
    });
  }

  trackCapture(node: SceneNode, isAuto: boolean): void {
    this.captureCount++;
    this.interactions.push({
      type: 'capture',
      timestamp: Date.now(),
      node_id: node.id,
      node_name: node.name,
      viewport: this.captureViewport(),
      metadata: {
        auto: isAuto,
        capture_number: this.captureCount,
      },
    });
  }

  trackToggle(enabled: boolean): void {
    this.interactions.push({
      type: 'toggle',
      timestamp: Date.now(),
      metadata: { auto_capture_enabled: enabled },
    });
  }

  getContext(): InteractionContext {
    const recentSelections = this.interactions
      .filter(i => i.type === 'selection')
      .slice(-10)
      .map((i, idx, arr) => ({
        node_id: i.node_id!,
        node_name: i.node_name!,
        timestamp: i.timestamp,
        duration: idx < arr.length - 1 ? arr[idx + 1].timestamp - i.timestamp : undefined,
      }));

    const frequency: Record<string, number> = {};
    this.selectionHistory.forEach((count, nodeId) => {
      frequency[nodeId] = count;
    });

    const avgTime =
      this.timeBetweenSelections.length > 0
        ? this.timeBetweenSelections.reduce((a, b) => a + b, 0) / this.timeBetweenSelections.length
        : 0;

    return {
      recent_selections: recentSelections,
      selection_frequency: frequency,
      average_time_between_selections: Math.round(avgTime),
      total_selections: this.interactions.filter(i => i.type === 'selection').length,
      viewport_changes: this.interactions.filter(i => i.type === 'viewport_change').length,
      capture_count: this.captureCount,
    };
  }

  getRecentHistory(limit: number = 10): InteractionEvent[] {
    return this.interactions.slice(-limit);
  }

  getNearbyNodes(node: SceneNode, radius: number = 500): string[] {
    const nearby: string[] = [];
    const nodeBounds = {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    };

    const page = figma.currentPage;
    
    function traverse(n: SceneNode) {
      if (n.id === node.id) return;

      const distance = Math.sqrt(
        Math.pow(n.x - nodeBounds.x, 2) + Math.pow(n.y - nodeBounds.y, 2)
      );

      if (distance <= radius) {
        nearby.push(n.id);
      }

      if ('children' in n) {
        n.children.forEach(traverse);
      }
    }

    if ('children' in page) {
      page.children.forEach(traverse);
    }

    return nearby.slice(0, 20); // Limit to 20 nearby nodes
  }

  getNodeTags(node: SceneNode): string[] {
    const tags: string[] = [];
    const name = node.name.toLowerCase();

    // Extract tags from naming patterns
    if (name.includes('button')) tags.push('button');
    if (name.includes('card')) tags.push('card');
    if (name.includes('modal')) tags.push('modal');
    if (name.includes('nav')) tags.push('navigation');
    if (name.includes('hero')) tags.push('hero');
    if (name.includes('footer')) tags.push('footer');
    if (name.includes('header')) tags.push('header');
    if (name.includes('form')) tags.push('form');
    if (name.includes('input')) tags.push('input');

    // Extract tags from node type
    if (node.type === 'COMPONENT') tags.push('component');
    if (node.type === 'INSTANCE') tags.push('instance');
    if (node.type === 'FRAME') tags.push('frame');

    // Extract tags from auto-layout
    if ('layoutMode' in node && node.layoutMode !== 'NONE') {
      tags.push('auto-layout');
      tags.push(node.layoutMode === 'HORIZONTAL' ? 'horizontal' : 'vertical');
    }

    return [...new Set(tags)]; // Remove duplicates
  }

  getMostFrequentNodes(limit: number = 5): Array<{ node_id: string; count: number }> {
    return Array.from(this.selectionHistory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([node_id, count]) => ({ node_id, count }));
  }

  getSessionStats(): {
    duration: number;
    total_interactions: number;
    captures_per_minute: number;
  } {
    if (this.interactions.length === 0) {
      return {
        duration: 0,
        total_interactions: 0,
        captures_per_minute: 0,
      };
    }

    const firstInteraction = this.interactions[0].timestamp;
    const lastInteraction = this.interactions[this.interactions.length - 1].timestamp;
    const duration = lastInteraction - firstInteraction;
    const durationMinutes = duration / 60000;

    return {
      duration,
      total_interactions: this.interactions.length,
      captures_per_minute: durationMinutes > 0 ? this.captureCount / durationMinutes : 0,
    };
  }

  private captureViewport(): InteractionEvent['viewport'] {
    return {
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
    };
  }

  reset(): void {
    this.interactions = [];
    this.selectionHistory.clear();
    this.lastSelectionTime = 0;
    this.timeBetweenSelections = [];
    this.captureCount = 0;
  }
}



