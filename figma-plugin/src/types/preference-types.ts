/**
 * Type definitions for preference tracking
 * 
 * Extensible schema following the interaction schema pattern:
 * - Core required fields
 * - Structured context fields
 * - Extensions field for custom data
 * - Metadata for additional information
 */

export interface PreferenceEvent {
  // Core required fields
  event_id: string;
  timestamp: number;
  session_id: string;
  snapshot_id: string;
  artifact_id: string;
  
  // Source/Type: Where this preference came from
  source: 'synthetic' | 'user_feedback' | 'production' | 'manual';
  type?: 'auto_suggestion' | 'user_request' | 'manual_entry' | 'batch_import';
  
  // Suggestion data
  suggested_rules: Array<{
    rule_id: string;
    match_score: number;
    shown_at: number;
    // Extensible: can add description, confidence, etc.
    [key: string]: any;
  }>;
  
  // User action
  user_action: {
    type: 'accepted' | 'dismissed' | 'modified' | 'ignored';
    rule_id?: string;
    action_taken?: string;
    timestamp: number;
    // Duration tracking
    duration_ms?: number; // Time from suggestion shown to user action (decision time)
    // Extensible: can add modification_details, feedback_text, etc.
    [key: string]: any;
  };
  
  // Context data
  trace_context: {
    recent_actions?: string[];
    current_state?: Partial<any>;
    component_id?: string;
    user_intent?: string;
    // Temporal tracking
    time_since_last_snapshot_ms?: number; // Time between previous snapshot and this one
    time_since_selection_ms?: number; // Time from selection to capture
    // Extensible: can add any context data
    [key: string]: any;
  };
  
  // Extension point for custom data (similar to interaction schema)
  extensions?: Record<string, any>;
  
  // Metadata for additional information
  metadata?: {
    source?: 'auto_suggestion' | 'user_request' | 'manual';
    suggestion_strategy?: string;
    model_version?: string;
    api_provider?: string;
    // Extensible: can add any metadata
    [key: string]: any;
  };
}

