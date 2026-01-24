import { generateUUID } from '../utils/uuid';
import { Intent } from '../types/udom';

export interface ProcedureEvent {
  event_id: string;
  event_type: string;
  timestamp: number;
  target_stable_id: string;
  parameters: Record<string, any>;
  session_id: string;
  intent?: Intent; // Optional intent/summary data
  action_summary?: string; // Text summary of the action
}

interface CaptureEventInput {
  type: string;
  target: any;
  intent?: Intent; // Optional intent data from snapshot
  action_summary?: string; // Optional text summary of the action
}

export interface MCPNotification {
  method: 'notifications/procedure_event';
  params: {
    event: {
      event_type: string;
      timestamp: number;
      agent_id?: string;
      data: {
        snapshot_id?: string;
        action_type?: string;
        preference_type?: string;
        rule_id?: string;
        event_id: string;
        session_id: string;
        action_summary?: string;
        intent?: Intent;
        [key: string]: any;
      };
    };
  };
}

export class ProceduralAdapter {
  private readonly mcpUrl: string;
  private readonly sessionId: string;

  constructor(mcpServerUrl: string) {
    this.mcpUrl = mcpServerUrl;
    this.sessionId = this.generateSessionId();
    this.logInitialization();
  }

  /**
   * Convert a ProcedureEvent to MCP notification format
   */
  toMCPNotification(procedureEvent: ProcedureEvent, agentId?: string): MCPNotification {
    return {
      method: 'notifications/procedure_event',
      params: {
        event: {
          event_type: procedureEvent.event_type,
          timestamp: procedureEvent.timestamp,
          agent_id: agentId,
          data: {
            event_id: procedureEvent.event_id,
            session_id: procedureEvent.session_id,
            target_id: procedureEvent.target_stable_id,
            ...procedureEvent.parameters,
            ...(procedureEvent.action_summary && { action_summary: procedureEvent.action_summary }),
            ...(procedureEvent.intent && { intent: procedureEvent.intent }),
          },
        },
      },
    };
  }

  async captureEvent(event: CaptureEventInput, agentId?: string): Promise<void> {
    const procedureEvent = this.buildProcedureEvent(event);
    this.logEvent(procedureEvent);
    
    // Convert to MCP notification format
    const notification = this.toMCPNotification(procedureEvent, agentId);
    
    // TODO: Send via WebSocket or HTTP POST to MCP server
    // For now, just log the notification structure
  }

  private buildProcedureEvent(event: CaptureEventInput): ProcedureEvent {
    const procedureEvent: ProcedureEvent = {
      event_id: generateUUID(),
      event_type: event.type,
      timestamp: Date.now(),
      target_stable_id: event.target?.id || 'unknown',
      parameters: {
        action: event.type,
        target: event.target,
      },
      session_id: this.sessionId,
    };

    // Include intent data if provided
    if (event.intent) {
      procedureEvent.intent = event.intent;
    }

    // Include action summary if provided
    if (event.action_summary) {
      procedureEvent.action_summary = event.action_summary;
    }

    return procedureEvent;
  }

  private logEvent(_event: ProcedureEvent): void {
    // Event logging disabled
  }

  private logInitialization(): void {
    // Initialization logging disabled
  }

  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `session_${timestamp}_${random}`;
  }
}

