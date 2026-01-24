/**
 * Build action traces from Figma interaction context
 */

import type { TraceBuilder } from './snapshot-to-matcher-input';

export class FigmaTraceBuilder implements TraceBuilder {
  buildTrace(context: any): Array<{ action: string; target: string; timestamp: number }> {
    const trace: Array<{ action: string; target: string; timestamp: number }> = [];

    if (context.recent_selections) {
      for (const selection of context.recent_selections.slice(-5)) {
        trace.push({
          action: 'select',
          target: selection.node_id,
          timestamp: selection.timestamp,
        });
      }
    }

    return trace;
  }
}


