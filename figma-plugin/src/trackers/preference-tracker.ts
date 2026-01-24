/**
 * Preference tracking for user feedback on rule suggestions
 */

import type { PreferenceEvent } from '../types/preference-types';

export interface PreferenceStorage {
  save(event: PreferenceEvent): Promise<void>;
}

export interface PreferenceTracker {
  trackSuggestion(
    suggestedRules: Array<{ rule_id: string; match_score: number; [key: string]: any }>,
    snapshotId: string,
    artifactId: string,
    traceContext: any,
    extensions?: Record<string, any>,
    metadata?: Record<string, any>
  ): string;
  
  trackAcceptance(eventId: string, ruleId: string, actionTaken?: string): void;
  trackDismissal(eventId: string, ruleId?: string): void;
  trackModification(eventId: string, ruleId: string, changes: string): void;
  flushAll(): Promise<void>;
}

export class DefaultPreferenceTracker implements PreferenceTracker {
  private preferenceEvents: PreferenceEvent[] = [];
  private sessionId: string;

  constructor(
    private storage: PreferenceStorage,
    sessionId?: string
  ) {
    this.sessionId = sessionId || this.generateSessionId();
  }

  trackSuggestion(
    suggestedRules: Array<{ rule_id: string; match_score: number; [key: string]: any }>,
    snapshotId: string,
    artifactId: string,
    traceContext: any,
    extensions?: Record<string, any>,
    metadata?: Record<string, any>
  ): string {
    const eventId = this.generateEventId();
    const shownAt = Date.now();
    const event: PreferenceEvent = {
      event_id: eventId,
      timestamp: shownAt,
      session_id: this.sessionId,
      source: 'user_feedback', // Real user feedback from plugin
      type: 'auto_suggestion', // Default, can be overridden via metadata
      suggested_rules: suggestedRules.map(r => ({
        ...r,
        shown_at: shownAt,
      })),
      user_action: {
        type: 'ignored',
        timestamp: shownAt,
      },
      snapshot_id: snapshotId,
      artifact_id: artifactId,
      trace_context: traceContext,
      ...(extensions && { extensions }),
      ...(metadata && { 
        metadata: {
          ...metadata,
          // Override type from metadata if provided
          ...(metadata.source && { type: metadata.source === 'user_request' ? 'user_request' : 'auto_suggestion' }),
        }
      }),
    };
    
    // Override type if specified in metadata
    if (metadata?.source) {
      event.type = metadata.source === 'user_request' ? 'user_request' : 'auto_suggestion';
    }

    this.preferenceEvents.push(event);
    return eventId;
  }

  trackAcceptance(eventId: string, ruleId: string, actionTaken?: string): void {
    const event = this.findEvent(eventId);
    if (event) {
      const actionTimestamp = Date.now();
      const shownAt = event.suggested_rules[0]?.shown_at || event.timestamp;
      const duration = actionTimestamp - shownAt;
      
      event.user_action = {
        type: 'accepted',
        rule_id: ruleId,
        action_taken: actionTaken,
        timestamp: actionTimestamp,
        duration_ms: duration,
      };
      this.flushEvent(event);
    }
  }

  trackDismissal(eventId: string, ruleId?: string): void {
    const event = this.findEvent(eventId);
    if (event) {
      const actionTimestamp = Date.now();
      const shownAt = event.suggested_rules[0]?.shown_at || event.timestamp;
      const duration = actionTimestamp - shownAt;
      
      event.user_action = {
        type: 'dismissed',
        rule_id: ruleId,
        timestamp: actionTimestamp,
        duration_ms: duration,
      };
      this.flushEvent(event);
    }
  }

  trackModification(eventId: string, ruleId: string, changes: string): void {
    const event = this.findEvent(eventId);
    if (event) {
      const actionTimestamp = Date.now();
      const shownAt = event.suggested_rules[0]?.shown_at || event.timestamp;
      const duration = actionTimestamp - shownAt;
      
      event.user_action = {
        type: 'modified',
        rule_id: ruleId,
        action_taken: changes,
        timestamp: actionTimestamp,
        duration_ms: duration,
      };
      this.flushEvent(event);
    }
  }

  async flushAll(): Promise<void> {
    const pending = this.preferenceEvents.filter(
      e => e.user_action.type !== 'ignored'
    );

    await Promise.all(pending.map(event => this.flushEvent(event)));

    this.preferenceEvents = this.preferenceEvents.filter(
      e => e.user_action.type === 'ignored'
    );
  }

  private findEvent(eventId: string): PreferenceEvent | undefined {
    return this.preferenceEvents.find(e => e.event_id === eventId);
  }

  private async flushEvent(event: PreferenceEvent): Promise<void> {
    try {
      await this.storage.save(event);
      this.removeEvent(event.event_id);
    } catch (error) {
    }
  }

  private removeEvent(eventId: string): void {
    this.preferenceEvents = this.preferenceEvents.filter(
      e => e.event_id !== eventId
    );
  }

  private generateEventId(): string {
    return `pref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

