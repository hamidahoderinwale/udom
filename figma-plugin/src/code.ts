import { ArtifactAdapter } from './adapters/artifact-adapter';
import { ProceduralAdapter } from './adapters/procedural-adapter';
import { InteractionAdapter } from './adapters/interaction-adapter';
import { RuleSystemFactory } from './factories/rule-system-factory';
import type { RuleSuggestionService } from './services/rule-suggestion-service';
import type { PreferenceTracker } from './trackers/preference-tracker';
import type { uDOMSnapshot } from './types/udom';

// Configuration
const CONFIG = {
  ui: {
    width: 280,
    height: 520,  // Increased to accommodate intent input and suggestions
    themeColors: true,
  },
  mcpServer: 'ws://localhost:8080',
  autoCaptureDelay: 500,
};

// State
let autoCaptureEnabled = true;
let captureTimeout: ReturnType<typeof setTimeout> | null = null;
let captureCount = 0;
let currentSuggestionEventId: string | null = null;
let lastPreferenceActionId: string | null = null; // Track last preference action for linking to changes
let currentSuggestions: Array<{ rule_id: string; description: string; confidence: number; scope: string; dimension?: string; component_id?: string; match_score?: number }> = [];

// Pending auto-apply state
interface PendingAutoApply {
  suggestion: { rule_id: string; description: string; dimension?: string; confidence?: number };
  selection: SceneNode;
  ruleId: string;
  componentId: string;
  timestamp: number; // For staleness detection
}
let pendingAutoApply: PendingAutoApply | null = null;

// Async operation tracking to prevent race conditions
let isProcessingSuggestions = false;
let suggestionRequestId = 0; // Increments with each request to detect stale responses

// OpenRouter configuration (loaded from server)
let openRouterApiKey: string = '';
let openRouterModel: string = 'anthropic/claude-3.5-sonnet';

// Component-specific API key storage
interface ComponentConfig {
  apiKey: string;
  model: string;
  componentId: string; // Figma node ID or artifact ID
}

const componentConfigs: Map<string, ComponentConfig> = new Map();
const componentServices: Map<string, { service: RuleSuggestionService; tracker: PreferenceTracker }> = new Map();

// Session ID for preference tracking (without full tracker)
const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Initialize adapters
const interactionAdapter = new InteractionAdapter();
const artifactAdapter = new ArtifactAdapter(interactionAdapter);
const proceduralAdapter = new ProceduralAdapter(CONFIG.mcpServer);

function initializeRuleSystemForComponent(
  componentId: string,
  apiKey?: string,
  model: string = 'anthropic/claude-3.5-sonnet'
): void {
  // Use provided API key or fall back to global config
  const key = apiKey || openRouterApiKey;
  if (!key) {
    return;
  }

  const config = {
    openRouter: { apiKey: key, model },
    preferenceStorageUrl: 'http://localhost:3000',
    promptsUrl: 'http://localhost:3000/api/prompts',
  };

  const service = RuleSystemFactory.createRuleSuggestionService(config);
  const tracker = RuleSystemFactory.createPreferenceTracker(config);

  componentConfigs.set(componentId, { apiKey: key, model, componentId });
  componentServices.set(componentId, { service, tracker });
}

// Initialize rule system on startup if API key is available
async function initializeRuleSystemFromConfig(): Promise<void> {
  try {
    // Fetch config from server (server can read from environment/config)
    const response = await fetch('http://localhost:3000/api/config');
    if (response.ok) {
      const serverConfig = await response.json();
      if (serverConfig.openrouter?.apiKey) {
        openRouterApiKey = serverConfig.openrouter.apiKey;
        openRouterModel = serverConfig.openrouter.model || openRouterModel;
      }
    }
  } catch (error) {
    // Server might not be running or endpoint doesn't exist - that's ok
  }
}

function getRuleSystemForComponent(componentId: string): {
  service: RuleSuggestionService | null;
  tracker: PreferenceTracker | null;
} {
  const services = componentServices.get(componentId);
  if (services) {
    return { service: services.service, tracker: services.tracker };
  }
  return { service: null, tracker: null };
}

function getComponentConfig(componentId: string): ComponentConfig | null {
  return componentConfigs.get(componentId) || null;
}

// UI Management
function initializeUI(): void {
  figma.showUI(__html__, CONFIG.ui);
}

function updateSelectionUI(selection: SceneNode | null): void {
  if (selection) {
    const componentId = selection.id;
    const config = getComponentConfig(componentId);
    
    figma.ui.postMessage({
      type: 'selection-changed',
      nodeId: selection.id,
      nodeName: selection.name,
      nodeType: selection.type,
      component_id: componentId,
    });
  } else {
    figma.ui.postMessage({
      type: 'selection-cleared',
    });
  }
}

function notifySuccess(artifactId: string): void {
  figma.notify(`Snapshot captured: ${artifactId}`);
}

function notifyError(message: string): void {
  figma.notify(`Error: ${message}`);
}

// Snapshot Capture Handler
// Poll for recommendation job results
async function pollRecommendationJob(jobId: string, snapshotId: string, componentId: string, preferenceTracker: PreferenceTracker | null, maxAttempts = 20, context?: any, requestId?: number): Promise<void> {
  // Faster polling: 200ms intervals for first 2 seconds, then 500ms
  for (let i = 0; i < maxAttempts; i++) {
    // Check if this request is stale (user started a new request)
    if (requestId !== undefined && requestId !== suggestionRequestId) {
      return; // Abort - newer request in progress
    }
    
    const delay = i < 10 ? 200 : 500; // Fast polling initially, then slower
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Check staleness again after delay
    if (requestId !== undefined && requestId !== suggestionRequestId) {
      return; // Abort - newer request in progress
    }
    
    try {
      const response = await fetch(`http://localhost:3000/recommendations/jobs/${jobId}`);
      if (!response.ok) {
        // Reset button on error (only if still current request)
        if (requestId === undefined || requestId === suggestionRequestId) {
          displayRecommendations([], snapshotId, componentId, preferenceTracker, context);
        }
        return;
      }
      
      const status = await response.json();
      
      if (status.status === 'completed' && status.recommendations) {
        // Only display if still current request
        if (requestId === undefined || requestId === suggestionRequestId) {
          displayRecommendations(status.recommendations, snapshotId, componentId, preferenceTracker, context);
        }
        return;
      } else if (status.status === 'failed') {
        // Reset button on failure (only if still current request)
        if (requestId === undefined || requestId === suggestionRequestId) {
          displayRecommendations([], snapshotId, componentId, preferenceTracker, context);
        }
        return;
      }
    } catch (error) {
      // Reset button on error (only if still current request)
      if (requestId === undefined || requestId === suggestionRequestId) {
        displayRecommendations([], snapshotId, componentId, preferenceTracker, context);
      }
      return;
    }
  }
  
  // Timeout - reset button after max attempts (only if still current request)
  if (requestId === undefined || requestId === suggestionRequestId) {
    displayRecommendations([], snapshotId, componentId, preferenceTracker, context);
  }
}

// Display recommendations from server
function displayRecommendations(recommendations: any[], snapshotId: string, componentId: string, preferenceTracker: PreferenceTracker | null, context?: any): void {
  // Store current suggestions for preference tracking
  currentSuggestions = recommendations.map(s => ({
    rule_id: s.rule_id,
    description: s.description,
    confidence: s.confidence,
    scope: s.scope,
    dimension: s.dimension,
    match_score: s.match_score || 0.8,
    component_id: componentId,
  }));
  
  // Generate event ID for tracking
  currentSuggestionEventId = `pref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // If we have a preference tracker, use it
  if (recommendations.length > 0 && preferenceTracker) {
    currentSuggestionEventId = preferenceTracker.trackSuggestion(
      recommendations.map(s => ({
        rule_id: s.rule_id,
        match_score: s.match_score || 0.8,
        description: s.description,
        confidence: s.confidence,
        scope: s.scope,
      })),
      snapshotId,
      componentId,
      {
        recent_actions: [],
        component_id: componentId,
        ...(context?.time_since_selection_ms && { time_since_selection_ms: context.time_since_selection_ms }),
        ...(context?.time_since_last_snapshot_ms && { time_since_last_snapshot_ms: context.time_since_last_snapshot_ms }),
      },
      {
        component_type: 'component',
        platform: 'figma',
      },
      {
        source: 'server_recommendation',
        suggestion_strategy: 'rule_matching',
        model_version: '1.0',
      }
    );
  }
  
  // Always send message to reset button state
  figma.ui.postMessage({
    type: 'rule-suggestions',
    suggestions: recommendations.map(s => ({
      rule_id: s.rule_id,
      description: s.description,
      confidence: s.confidence,
      scope: s.scope,
      dimension: s.dimension,
      component_id: componentId,
    })),
    component_id: componentId,
  });
}

async function handleCaptureSnapshot(isAuto = false, userIntent?: string, actionId?: string | null, suppressUI = false): Promise<{ snapshot: uDOMSnapshot; previousSnapshot: uDOMSnapshot | null } | null> {
  const selection = figma.currentPage.selection[0];
  
  if (!selection) {
    if (!isAuto && !suppressUI) {
      figma.ui.postMessage({
        type: 'error',
        message: 'Please select a component or frame',
      });
    }
    return null;
  }

  try {
    if (!suppressUI) {
      figma.ui.postMessage({ 
        type: 'capture-started',
        auto: isAuto 
      });
    }

    const { snapshot, previousSnapshot } = await artifactAdapter.captureSnapshot(selection, isAuto, userIntent, actionId || null);
    captureCount++;

    if (!suppressUI) {
      figma.ui.postMessage({
        type: 'capture-success',
        snapshot: snapshot,
        count: captureCount,
        timestamp: Date.now(),
        auto: isAuto,
      });

      if (!isAuto) {
        notifySuccess(snapshot.metadata.artifact_id);
      }
    }

    return { snapshot, previousSnapshot };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to capture snapshot';
    
    if (!suppressUI) {
      figma.ui.postMessage({
        type: 'error',
        message: errorMessage,
      });
      
      if (!isAuto) {
        notifyError(errorMessage);
      }
    }
    return null;
  }
}

// Track selection time for duration calculation
let selectionStartTime: number = 0;

// Event Handlers
async function handleSelectionChange(): Promise<void> {
  const selection = figma.currentPage.selection[0] || null;
  
  // Track selection in interaction adapter
  if (selection) {
    selectionStartTime = Date.now();
    interactionAdapter.trackSelection(selection);
  }
  
  updateSelectionUI(selection);

  // Auto-capture with debouncing
  if (autoCaptureEnabled && selection) {
    if (captureTimeout) {
      clearTimeout(captureTimeout);
    }

    captureTimeout = setTimeout(async () => {
      // Use last preference action ID if available (links changes to preference)
      const captureResult = await handleCaptureSnapshot(true, undefined, lastPreferenceActionId);
      
      // Always request recommendations (synthetic recommendations work without API key)
      if (selection && captureResult) {
        const componentId = selection.id;
        const { tracker: preferenceTracker } = getRuleSystemForComponent(componentId);
        
        // Request recommendations from server (synthetic + optional LLM)
        try {
          const { snapshot, previousSnapshot } = captureResult;
          const context = interactionAdapter.getContext();
          
          // Calculate temporal metrics
          const timeSinceSelection = Date.now() - selectionStartTime;
          const timeSinceLastSnapshot = previousSnapshot 
            ? snapshot.metadata.timestamp - previousSnapshot.metadata.timestamp 
            : undefined;
          
          // Add temporal context
          const enrichedContext = {
            ...context,
            time_since_selection_ms: timeSinceSelection,
            time_since_last_snapshot_ms: timeSinceLastSnapshot,
          };
          
          // Request recommendations from server
          // Synthetic recommendations always available, LLM recommendations if API key configured
          const response = await fetch(`http://localhost:3000/snapshots/${snapshot.metadata.snapshot_id}/recommendations/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              context: enrichedContext,
              previous_snapshot: previousSnapshot 
            })
          });
          
          if (response.ok) {
            const result = await response.json();
            
            // If job_id returned, poll for results
            if (result.job_id && result.status === 'processing') {
              pollRecommendationJob(result.job_id, snapshot.metadata.snapshot_id, componentId, preferenceTracker);
            } else if (result.recommendations) {
              // Immediate results (cached or synthetic)
              displayRecommendations(result.recommendations, snapshot.metadata.snapshot_id, componentId, preferenceTracker, enrichedContext);
            }
          } else {
            // If server error, still show message (but don't block)
          }
        } catch (error) {
          // Silently handle errors - recommendations are optional enhancement
        }
      }
    }, CONFIG.autoCaptureDelay);
  }
}

async function handleDocumentChange(event: DocumentChangeEvent): Promise<void> {
  if (event.documentChanges.length > 0) {
    const change = event.documentChanges[0];
    await proceduralAdapter.captureEvent({
      type: change.type,
      target: 'node' in change ? change.node : null,
    });
  }
}

// Helper function to get suggestions with optional user intent
async function getSuggestionsWithIntent(userIntent?: string): Promise<void> {
  const selection = figma.currentPage.selection[0];
  if (!selection) {
    figma.ui.postMessage({
      type: 'error',
      message: 'Please select a component or frame',
    });
    return;
  }

  // Prevent concurrent requests - race condition protection
  if (isProcessingSuggestions) {
    return; // Silently ignore if already processing
  }

  const componentId = selection.id;
  const { tracker: preferenceTracker } = getRuleSystemForComponent(componentId);
  
  // Increment request ID to track this specific request
  const currentRequestId = ++suggestionRequestId;
  isProcessingSuggestions = true;

  try {
    // Show "generating suggestions" message instead of capture message
    figma.ui.postMessage({
      type: 'generating-suggestions',
      component_id: componentId,
    });

    // Capture snapshot silently (suppress UI messages) for suggestions
    // Use last preference action ID if available (links changes to preference)
    const captureResult = await handleCaptureSnapshot(false, userIntent, lastPreferenceActionId, true);
    
    // Check if request is stale (user started a new request)
    if (currentRequestId !== suggestionRequestId) {
      return; // Abort - newer request in progress
    }
    
    if (!captureResult) {
      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to capture snapshot for suggestions',
      });
      return;
    }

    const { snapshot } = captureResult;
    const context = {
      ...interactionAdapter.getContext(),
      ...(userIntent && { user_intent: userIntent }),
    };

    // Request recommendations from server with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
    
    let response: Response;
    try {
      response = await fetch(`http://localhost:3000/snapshots/${snapshot.metadata.snapshot_id}/recommendations/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          context,
          previous_snapshot: captureResult.previousSnapshot 
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
    
    // Check if request is stale again after async operation
    if (currentRequestId !== suggestionRequestId) {
      return; // Abort - newer request in progress
    }

    if (response.ok) {
      const result = await response.json();
      
      // Calculate temporal metrics
      const timeSinceSelection = Date.now() - selectionStartTime;
      const timeSinceLastSnapshot = captureResult.previousSnapshot 
        ? snapshot.metadata.timestamp - captureResult.previousSnapshot.metadata.timestamp 
        : undefined;
      
      const enrichedContext = {
        ...context,
        time_since_selection_ms: timeSinceSelection,
        time_since_last_snapshot_ms: timeSinceLastSnapshot,
      };
      
      // If job_id returned, poll for results (pass request ID for staleness check)
      if (result.job_id && result.status === 'processing') {
        pollRecommendationJob(result.job_id, snapshot.metadata.snapshot_id, componentId, preferenceTracker, 20, enrichedContext, currentRequestId);
      } else if (result.recommendations) {
        // Immediate results (cached or synthetic)
        displayRecommendations(result.recommendations, snapshot.metadata.snapshot_id, componentId, preferenceTracker, enrichedContext);
      }
    } else {
      // Show error but don't block - synthetic recommendations should always work
      let errorData: { error?: string } = {};
      try {
        errorData = await response.json();
      } catch {
        // JSON parse failed, use empty object
      }
      figma.ui.postMessage({
        type: 'error',
        message: errorData.error || 'Failed to get recommendations. Check server connection.',
      });
      // Reset button state on error
      figma.ui.postMessage({
        type: 'rule-suggestions',
        suggestions: [],
        component_id: componentId,
      });
    }
  } catch (error) {
    // Check if this is an abort error (timeout or manual abort)
    if (error instanceof Error && error.name === 'AbortError') {
      figma.ui.postMessage({
        type: 'error',
        message: 'Request timed out. Please try again.',
      });
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get suggestions';
      figma.ui.postMessage({
        type: 'error',
        message: errorMessage,
      });
    }
    // Reset button state on error
    const currentSelection = figma.currentPage.selection[0];
    if (currentSelection) {
      figma.ui.postMessage({
        type: 'rule-suggestions',
        suggestions: [],
        component_id: currentSelection.id,
      });
    }
  } finally {
    // Only reset if this is still the current request
    if (currentRequestId === suggestionRequestId) {
      isProcessingSuggestions = false;
    }
  }
}

// Send preference directly to server when no tracker is available
async function sendPreferenceToServer(
  actionType: 'accepted' | 'dismissed' | 'modified',
  ruleId: string,
  componentId: string,
  actionTaken?: string
): Promise<void> {
  const timestamp = Date.now();
  
  // Find the rule in current suggestions
  const rule = currentSuggestions.find(s => s.rule_id === ruleId);
  
  const preference = {
    event_id: currentSuggestionEventId || `pref_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp,
    session_id: sessionId,
    source: 'user_feedback',
    type: 'auto_suggestion',
    suggested_rules: currentSuggestions.map(s => ({
      rule_id: s.rule_id,
      match_score: s.match_score || 0.8,
      description: s.description,
      confidence: s.confidence,
      scope: s.scope,
      dimension: s.dimension,
      shown_at: timestamp,
    })),
    user_action: {
      type: actionType,
      rule_id: ruleId,
      timestamp,
      ...(actionTaken && { action_taken: actionTaken }),
    },
    snapshot_id: null, // Could be populated if we track last snapshot
    artifact_id: componentId,
    trace_context: {
      component_id: componentId,
      platform: 'figma',
    },
    extensions: {
      component_type: 'component',
      platform: 'figma',
    },
    metadata: {
      source: 'server_recommendation',
      suggestion_strategy: 'synthetic',
      ...(rule?.dimension && { dimension_group: rule.dimension }),
    },
  };
  
  try {
    await fetch('http://localhost:3000/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preference),
    });
  } catch (error) {
    // Silently fail - preference tracking is optional
  }
}

function handleUIMessage(msg: { 
  type: string; 
  enabled?: boolean;
  apiKey?: string;
  model?: string;
  ruleId?: string;
  action?: string;
  user_intent?: string;
  component_id?: string;
}): void {
  switch (msg.type) {
    case 'toggle-auto-capture':
      autoCaptureEnabled = msg.enabled ?? !autoCaptureEnabled;
      interactionAdapter.trackToggle(autoCaptureEnabled);
      figma.ui.postMessage({
        type: 'auto-capture-toggled',
        enabled: autoCaptureEnabled,
      });
      break;
      
    // Removed 'set-openrouter-key' - API key now configured via server/config file
    // API key should be set via OPENROUTER_API_KEY environment variable
    // or in udom-server config, not through UI
      
    case 'accept-rule':
      if (msg.ruleId && msg.component_id) {
        // Find the accepted suggestion to get details
        const acceptedSuggestion = currentSuggestions.find(s => s.rule_id === msg.ruleId);
        
        // Track preference
        const { tracker: preferenceTracker } = getRuleSystemForComponent(msg.component_id);
        if (preferenceTracker && currentSuggestionEventId) {
          preferenceTracker.trackAcceptance(currentSuggestionEventId, msg.ruleId, msg.action);
        } else {
          // Send preference directly to server (works without API key)
          sendPreferenceToServer('accepted', msg.ruleId, msg.component_id, msg.action);
        }
        
        // Store preference action ID for linking to future changes
        lastPreferenceActionId = `pref_action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Try to auto-apply the suggestion
        const selection = figma.currentPage.selection[0];
        if (selection && selection.id === msg.component_id && acceptedSuggestion) {
          const description = acceptedSuggestion.description || 'the suggested improvement';
          
          // Check if auto-apply is possible before attempting
          if (canAutoApply(acceptedSuggestion)) {
            // Count affected elements for preview
            const affectedCount = countAffectedElements(selection, acceptedSuggestion.dimension || '');
            
            // Get relevant elements for preview
            const relevantElements = acceptedSuggestion.dimension && 'children' in selection
              ? collectRelevantElements(selection, acceptedSuggestion.dimension)
              : [];
            
            // Store selection and suggestion for when user confirms
            pendingAutoApply = {
              suggestion: acceptedSuggestion,
              selection: selection,
              ruleId: msg.ruleId,
              componentId: msg.component_id
            };
            
            // Show preview/confirmation UI
            figma.ui.postMessage({
              type: 'auto-apply-preview',
              ruleId: msg.ruleId,
              component_id: msg.component_id,
              suggestion: acceptedSuggestion,
              affectedCount: affectedCount,
              elements: relevantElements.slice(0, 5), // Show first 5 elements
            });
            
            return; // Wait for user confirmation
          } else {
            // Auto-apply not possible - show manual guidance
            figma.notify(`Accepted: ${description}. Apply changes manually in the right panel.`, {
              timeout: 3000
            });
            
            // Highlight relevant elements to guide user
            if (acceptedSuggestion.dimension && 'children' in selection) {
              highlightRelevantElements(selection, acceptedSuggestion.dimension);
            }
            
            // Get relevant elements for walkthrough
            const relevantElements = acceptedSuggestion.dimension && 'children' in selection
              ? collectRelevantElements(selection, acceptedSuggestion.dimension)
              : [];
            
            // Send acceptance message to UI with walkthrough data
            figma.ui.postMessage({
              type: 'rule-accepted',
              ruleId: msg.ruleId,
              component_id: msg.component_id,
              suggestion: acceptedSuggestion,
              autoApplied: false,
              message: 'Please apply changes manually - suggestion is too complex for auto-apply',
              elements: relevantElements,
              guidance: acceptedSuggestion?.dimension ? getChangeGuidance(acceptedSuggestion.dimension, acceptedSuggestion.scope || 'general') : null,
            });
          }
        }
      }
      break;
      
    case 'confirm-auto-apply':
      // User confirmed auto-apply from preview
      if (pendingAutoApply) {
        const { suggestion, selection, ruleId, componentId } = pendingAutoApply;
        
        applySuggestionAutomatically(suggestion, selection).then(result => {
          if (result.success && result.changesApplied > 0) {
            // Successfully auto-applied
            figma.notify(result.message.replace(/✓\s*/g, ''), {
              timeout: 4000
            });
            
            // Highlight the changed elements briefly
            if (suggestion.dimension && 'children' in selection) {
              highlightRelevantElements(selection, suggestion.dimension, false); // Don't restore selection
            }
            
            // Get relevant elements for walkthrough
            const relevantElements = suggestion.dimension && 'children' in selection
              ? collectRelevantElements(selection, suggestion.dimension)
              : [];
            
            // Send success message to UI with walkthrough data
            figma.ui.postMessage({
              type: 'rule-accepted',
              ruleId: ruleId,
              component_id: componentId,
              suggestion: suggestion,
              autoApplied: true,
              changesApplied: result.changesApplied,
              message: result.message,
              elements: relevantElements,
              guidance: suggestion?.dimension ? getChangeGuidance(suggestion.dimension, (suggestion as any).scope || 'general') : null,
            });
          } else {
            // Auto-apply failed - fallback to manual guidance
            figma.notify(`Accepted: ${suggestion.description}. ${result.message || 'Apply changes manually in the right panel.'}`, {
              timeout: 4000
            });
            
            // Highlight relevant elements to guide user
            if (suggestion.dimension && 'children' in selection) {
              highlightRelevantElements(selection, suggestion.dimension);
            }
            
            // Get relevant elements for walkthrough
            const relevantElements = suggestion.dimension && 'children' in selection
              ? collectRelevantElements(selection, suggestion.dimension)
              : [];
            
            // Send acceptance message to UI with walkthrough data
            figma.ui.postMessage({
              type: 'rule-accepted',
              ruleId: ruleId,
              component_id: componentId,
              suggestion: suggestion,
              autoApplied: false,
              message: result.message || 'Please apply changes manually',
              elements: relevantElements,
              guidance: suggestion?.dimension ? getChangeGuidance(suggestion.dimension, (suggestion as any).scope || 'general') : null,
            });
          }
          
          // Clear pending state
          pendingAutoApply = null;
        });
      }
      break;
      
    case 'cancel-auto-apply':
      // User cancelled auto-apply - show manual guidance instead
      if (pendingAutoApply) {
        const { suggestion, selection, ruleId, componentId } = pendingAutoApply;
        
        figma.notify(`Accepted: ${suggestion.description}. Apply changes manually in the right panel.`, {
          timeout: 3000
        });
        
        // Highlight relevant elements to guide user
        if (suggestion.dimension && 'children' in selection) {
          highlightRelevantElements(selection, suggestion.dimension);
        }
        
        // Get relevant elements for walkthrough
        const relevantElements = suggestion.dimension && 'children' in selection
          ? collectRelevantElements(selection, suggestion.dimension)
          : [];
        
        // Send acceptance message to UI with walkthrough data
        figma.ui.postMessage({
          type: 'rule-accepted',
          ruleId: ruleId,
          component_id: componentId,
          suggestion: suggestion,
          autoApplied: false,
          message: 'Please apply changes manually - suggestion is too complex for auto-apply',
          elements: relevantElements,
          guidance: suggestion?.dimension ? getChangeGuidance(suggestion.dimension, (suggestion as any).scope || 'general') : null,
        });
        
        // Clear pending state
        pendingAutoApply = null;
      }
      break;
      
    case 'dismiss-rule':
      if (msg.ruleId && msg.component_id) {
        const { tracker: preferenceTracker } = getRuleSystemForComponent(msg.component_id);
        if (preferenceTracker && currentSuggestionEventId) {
          preferenceTracker.trackDismissal(currentSuggestionEventId, msg.ruleId);
        } else {
          // Send preference directly to server (works without API key)
          sendPreferenceToServer('dismissed', msg.ruleId, msg.component_id);
        }
        figma.ui.postMessage({
          type: 'rule-dismissed',
          ruleId: msg.ruleId,
          component_id: msg.component_id,
        });
      }
      break;
      
    case 'open-viewer':
      figma.openExternal('http://localhost:3000/viewer');
      break;
      
    case 'get-interaction-stats':
      const stats = interactionAdapter.getSessionStats();
      const context = interactionAdapter.getContext();
      figma.ui.postMessage({
        type: 'interaction-stats',
        stats,
        context,
      });
      break;
      
    case 'close':
      // Flush all component preference trackers
      componentServices.forEach(({ tracker }) => {
        if (tracker) {
          tracker.flushAll();
        }
      });
      figma.closePlugin();
      break;
      
    case 'open-docs':
      figma.openExternal('https://github.com/Taste-AI/hamidah-project#readme');
      break;

      case 'request-suggestions':
        // Simplified: always get suggestions, intent inferred from snapshot context
        getSuggestionsWithIntent(msg.user_intent); // user_intent is optional
        break;
  }
}

// Note: local-network-access warnings are harmless browser security notices
// They occur when accessing localhost from web context and don't affect functionality

// ============================================================================
// HIGHLIGHTING SYSTEM
// ============================================================================

// Store original selection to restore after highlighting
let originalSelection: SceneNode[] = [];

/**
 * Collect relevant elements based on dimension (helper function)
 */
function collectRelevantElements(node: SceneNode, dimension: string): Array<{ name: string; type: string }> {
  const elements: Array<{ name: string; type: string }> = [];
  
  function traverse(n: SceneNode) {
    const dim = dimension.toLowerCase();
    if (dim === 'typography' || dim === 'font') {
      if (n.type === 'TEXT') {
        elements.push({ name: n.name, type: n.type });
      }
    } else if (dim === 'spacing' || dim === 'layout') {
      if ('layoutMode' in n && n.layoutMode !== 'NONE') {
        elements.push({ name: n.name, type: n.type });
      }
    } else if (dim === 'color' || dim === 'visual') {
      if ('fills' in n || 'strokes' in n) {
        elements.push({ name: n.name, type: n.type });
      }
    }
    
    if ('children' in n) {
      n.children.forEach(child => traverse(child));
    }
  }
  
  traverse(node);
  return elements;
}

/**
 * Highlight relevant elements on canvas based on dimension
 * Improved: Preserves original selection, uses temporary highlight
 */
function highlightRelevantElements(node: SceneNode, dimension: string, restoreSelection: boolean = true): void {
  const relevantNodes: SceneNode[] = [];
  
  // Find nodes that match the dimension
  function findRelevantNodes(n: SceneNode) {
    const dim = dimension.toLowerCase();
    if (dim === 'typography' || dim === 'font') {
      if (n.type === 'TEXT') {
        relevantNodes.push(n);
      }
    } else if (dim === 'spacing' || dim === 'layout') {
      if ('layoutMode' in n && n.layoutMode !== 'NONE') {
        relevantNodes.push(n);
      }
    } else if (dim === 'color' || dim === 'visual') {
      if ('fills' in n || 'strokes' in n) {
        relevantNodes.push(n);
      }
    }
    
    if ('children' in n) {
      n.children.forEach(child => findRelevantNodes(child));
    }
  }
  
  findRelevantNodes(node);
  
  // Store original selection if we want to restore it
  if (restoreSelection) {
    originalSelection = [...figma.currentPage.selection];
  }
  
  // Select relevant nodes to highlight them
  if (relevantNodes.length > 0) {
    figma.currentPage.selection = relevantNodes;
    figma.viewport.scrollAndZoomIntoView(relevantNodes);
    
    // Restore original selection after a brief delay (visual feedback)
    if (restoreSelection && originalSelection.length > 0) {
      setTimeout(() => {
        figma.currentPage.selection = originalSelection;
        originalSelection = [];
      }, 2000); // Show highlight for 2 seconds
    }
  }
}

/**
 * Get change guidance text based on dimension and scope
 */
function getChangeGuidance(dimension: string, scope: string): string {
  const guidance: Record<string, string> = {
    typography: `
      <strong>Typography Properties</strong><br>
      Font Family: Right panel → Text → Font dropdown<br>
      Font Size: Right panel → Text → Size input<br>
      Font Weight: Right panel → Text → Weight dropdown<br>
      Line Height: Right panel → Text → Line height input<br>
      Letter Spacing: Right panel → Text → Letter spacing input
    `,
    font: `
      <strong>Font Properties</strong><br>
      Click the Text button in the right panel<br>
      Use Font Family dropdown to change typeface<br>
      Adjust Size, Weight, and Line Height as needed
    `,
    spacing: `
      <strong>Spacing Properties</strong><br>
      Padding: Right panel → Layout → Padding inputs<br>
      Gap: Right panel → Layout → Gap input (for auto-layout)<br>
      Spacing between elements: Adjust in Layout section
    `,
    layout: `
      <strong>Layout Properties</strong><br>
      Auto Layout: Right panel → Layout → Auto Layout toggle<br>
      Direction: Right panel → Layout → Direction (horizontal/vertical)<br>
      Alignment: Right panel → Layout → Align/Justify controls
    `,
    color: `
      <strong>Color Properties</strong><br>
      Fill: Right panel → Fill → Color picker<br>
      Stroke: Right panel → Stroke → Color picker<br>
      Effects: Right panel → Effects → Shadow/Blur options
    `,
    visual: `
      <strong>Visual Properties</strong><br>
      Fill: Right panel → Fill section<br>
      Stroke: Right panel → Stroke section<br>
      Effects: Right panel → Effects section<br>
      Corner Radius: Right panel → Corner radius input
    `,
  };
  
  return guidance[dimension.toLowerCase()] || `
    <strong>General Design Properties</strong><br>
    Check the right panel for relevant property controls<br>
    Look for sections matching: ${dimension}<br>
    Scope: ${scope}
  `;
}

/**
 * Extract numeric value from description (e.g., "increase by 20%" → 20, "add 16px" → 16)
 */
function extractValue(description: string): { value: number; unit: string | null } | null {
  // Match patterns like "20%", "16px", "12pt", "by 20", "to 16px"
  const patterns = [
    /(?:by|to|add|set|use)\s*(\d+)\s*(px|%|pt|em|rem)?/i,
    /(\d+)\s*(px|%|pt|em|rem)/i,
    /(?:by|to)\s*(\d+)/i
  ];
  
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2] || null;
      return { value, unit };
    }
  }
  
  return null;
}

/**
 * Check if suggestion can be auto-applied based on specificity and dimension support
 * Expanded criteria: More permissive for typography/spacing, conservative for visual/color
 */
function canAutoApply(suggestion: { description: string; dimension?: string; confidence?: number }): boolean {
  const description = suggestion.description.toLowerCase();
  const dimension = suggestion.dimension?.toLowerCase() || '';
  const confidence = suggestion.confidence || 0.5;
  
  // Check if description contains specific action keywords
  const hasSpecificAction = 
    description.includes('increase') || 
    description.includes('decrease') ||
    description.includes('larger') ||
    description.includes('smaller') ||
    description.includes('bigger') ||
    description.includes('reduce') ||
    description.includes('add') ||
    description.includes('more') ||
    description.includes('less') ||
    description.includes('by') ||
    description.includes('to') ||
    description.includes('set') ||
    description.includes('standardize') ||
    description.includes('uniform') ||
    /(\d+)\s*(px|%|pt|em|rem)/i.test(description);
  
  // Check if dimension is supported for auto-apply
  const supportedDimensions = ['typography', 'font', 'spacing', 'layout'];
  const isSupported = dimension === '' || supportedDimensions.includes(dimension);
  
  // Never auto-apply subjective/visual changes
  const isSubjective = 
    dimension === 'color' || 
    dimension === 'visual' ||
    description.includes('premium') ||
    description.includes('better') ||
    description.includes('improve') ||
    description.includes('enhance') ||
    description.includes('polish') ||
    description.includes('refine');
  
  // Check if description is too vague (reject if only contains generic terms)
  const isTooVague = 
    description.length < 8 ||
    (!hasSpecificAction && !/(\d+)/.test(description));
  
  // More permissive: allow if has specific action, is supported dimension, not subjective, and not too vague
  // Also require minimum confidence for auto-apply
  return hasSpecificAction && isSupported && !isSubjective && !isTooVague && confidence >= 0.5;
}

/**
 * Count elements that would be affected by auto-apply
 */
function countAffectedElements(component: SceneNode, dimension: string): number {
  let count = 0;
  
  function countRelevantNodes(n: SceneNode) {
    const dim = dimension.toLowerCase();
    if (dim === 'typography' || dim === 'font') {
      if (n.type === 'TEXT') count++;
    } else if (dim === 'spacing' || dim === 'layout') {
      if ('layoutMode' in n && n.layoutMode !== 'NONE') count++;
    }
    
    if ('children' in n) {
      n.children.forEach(child => countRelevantNodes(child));
    }
  }
  
  countRelevantNodes(component);
  return count;
}

/**
 * Apply changes automatically when suggestion is specific enough
 */
async function applySuggestionAutomatically(
  suggestion: { rule_id: string; description: string; dimension?: string },
  component: SceneNode
): Promise<{ success: boolean; changesApplied: number; message: string }> {
  const description = suggestion.description.toLowerCase();
  const dimension = suggestion.dimension?.toLowerCase() || '';
  let changesApplied = 0;
  let message = '';
  
  try {
    if (dimension === 'typography' || dimension === 'font') {
      // Find text nodes
      const textNodes: TextNode[] = [];
      function findTextNodes(n: SceneNode) {
        if (n.type === 'TEXT') textNodes.push(n as TextNode);
        if ('children' in n) {
          n.children.forEach(child => findTextNodes(child));
        }
      }
      if ('children' in component) {
        component.children.forEach(child => findTextNodes(child));
      }
      
      if (textNodes.length === 0) {
        return { success: false, changesApplied: 0, message: 'No text elements found' };
      }
      
      // Apply font changes based on suggestion
      if (description.includes('increase') || description.includes('larger') || description.includes('bigger')) {
        // Try to extract specific percentage/value from description
        const extractedValue = extractValue(description);
        let multiplier = 1.2; // Default 20% increase
        let valueText = '20%';
        
        if (extractedValue) {
          if (extractedValue.unit === '%') {
            multiplier = 1 + (extractedValue.value / 100);
            valueText = `${extractedValue.value}%`;
          } else if (extractedValue.unit === 'px' || extractedValue.unit === 'pt') {
            // For absolute values, calculate percentage based on average font size
            const avgSize = textNodes.reduce((sum, n) => {
              try {
                return sum + ((n.fontSize as number) || 0);
              } catch { return sum; }
            }, 0) / textNodes.length;
            
            if (avgSize > 0) {
              multiplier = 1 + (extractedValue.value / avgSize);
              valueText = `${extractedValue.value}${extractedValue.unit}`;
            }
          } else if (!extractedValue.unit) {
            // Assume percentage if no unit specified
            multiplier = 1 + (extractedValue.value / 100);
            valueText = `${extractedValue.value}%`;
          }
        }
        
        textNodes.forEach(node => {
          try {
            const currentSize = node.fontSize as number;
            if (typeof currentSize === 'number' && currentSize > 0) {
              node.fontSize = Math.round(currentSize * multiplier);
              changesApplied++;
            }
          } catch (e) {
            // Font may not be loaded or readonly
          }
        });
        message = `Font size increased by ${valueText} on ${changesApplied} text element${changesApplied !== 1 ? 's' : ''}`;
      } else if (description.includes('decrease') || description.includes('smaller') || description.includes('reduce')) {
        // Try to extract specific percentage/value from description
        const extractedValue = extractValue(description);
        let multiplier = 0.9; // Default 10% decrease
        let valueText = '10%';
        
        if (extractedValue) {
          if (extractedValue.unit === '%') {
            multiplier = 1 - (extractedValue.value / 100);
            valueText = `${extractedValue.value}%`;
          } else if (extractedValue.unit === 'px' || extractedValue.unit === 'pt') {
            // For absolute values, calculate percentage based on average font size
            const avgSize = textNodes.reduce((sum, n) => {
              try {
                return sum + ((n.fontSize as number) || 0);
              } catch { return sum; }
            }, 0) / textNodes.length;
            
            if (avgSize > 0) {
              multiplier = 1 - (extractedValue.value / avgSize);
              valueText = `${extractedValue.value}${extractedValue.unit}`;
            }
          } else if (!extractedValue.unit) {
            // Assume percentage if no unit specified
            multiplier = 1 - (extractedValue.value / 100);
            valueText = `${extractedValue.value}%`;
          }
        }
        
        textNodes.forEach(node => {
          try {
            const currentSize = node.fontSize as number;
            if (typeof currentSize === 'number' && currentSize > 0) {
              node.fontSize = Math.round(currentSize * multiplier);
              changesApplied++;
            }
          } catch (e) {
            // Font may not be loaded or readonly
          }
        });
        message = `Font size decreased by ${valueText} on ${changesApplied} text element${changesApplied !== 1 ? 's' : ''}`;
      } else if (description.includes('line height') || description.includes('line-height')) {
        // Increase line height for readability
        textNodes.forEach(node => {
          try {
            if ('lineHeight' in node) {
              const currentLineHeight = node.lineHeight;
              // Handle different line height formats
              if (typeof currentLineHeight === 'object' && currentLineHeight !== null) {
                const lineHeightObj = currentLineHeight as { value?: number; unit?: string };
                if (lineHeightObj.value !== undefined && lineHeightObj.value < 1.4) {
                  node.lineHeight = { value: 1.4, unit: 'PERCENT' };
                  changesApplied++;
                }
              } else if (typeof currentLineHeight === 'number' && currentLineHeight < 1.4) {
                node.lineHeight = { value: 1.4, unit: 'PERCENT' };
                changesApplied++;
              }
            }
          } catch (e) {
            // Line height may not be editable
          }
        });
        if (changesApplied > 0) {
          message = `Line height increased to 1.4 for better readability on ${changesApplied} text element${changesApplied !== 1 ? 's' : ''}`;
        }
      }
      
    } else if (dimension === 'spacing') {
      // Handle spacing changes
      const framesWithLayout: SceneNode[] = [];
      function findLayoutNodes(n: SceneNode) {
        if ('layoutMode' in n && n.layoutMode !== 'NONE') {
          framesWithLayout.push(n);
        }
        if ('children' in n) {
          n.children.forEach(child => findLayoutNodes(child));
        }
      }
      findLayoutNodes(component);
      
      if (framesWithLayout.length === 0 && 'layoutMode' in component && component.layoutMode !== 'NONE') {
        framesWithLayout.push(component);
      }
      
      if (framesWithLayout.length === 0) {
        return { success: false, changesApplied: 0, message: 'No layout containers found' };
      }
      
      if (description.includes('increase') || description.includes('more') || description.includes('add')) {
        // Try to extract specific value from description
        const extractedValue = extractValue(description);
        const increment = extractedValue && (extractedValue.unit === 'px' || !extractedValue.unit) 
          ? extractedValue.value 
          : 8; // Default 8px increase
        const valueText = extractedValue ? `${extractedValue.value}${extractedValue.unit || 'px'}` : '8px';
        
        framesWithLayout.forEach(frame => {
          try {
            if ('paddingTop' in frame) {
              const currentPadding = (frame.paddingTop as number) || 0;
              const newPadding = currentPadding + increment;
              frame.paddingTop = newPadding;
              frame.paddingBottom = newPadding;
              frame.paddingLeft = newPadding;
              frame.paddingRight = newPadding;
              changesApplied++;
            }
          } catch (e) {
            // Padding may not be editable
          }
        });
        if (changesApplied > 0) {
          message = `Padding increased by ${valueText} on ${changesApplied} container${changesApplied !== 1 ? 's' : ''}`;
        }
      } else if (description.includes('decrease') || description.includes('less') || description.includes('reduce')) {
        // Try to extract specific value from description
        const extractedValue = extractValue(description);
        const decrement = extractedValue && (extractedValue.unit === 'px' || !extractedValue.unit)
          ? extractedValue.value
          : 8; // Default 8px decrease
        const valueText = extractedValue ? `${extractedValue.value}${extractedValue.unit || 'px'}` : '8px';
        
        framesWithLayout.forEach(frame => {
          try {
            if ('paddingTop' in frame) {
              const currentPadding = (frame.paddingTop as number) || 0;
              const newPadding = Math.max(0, currentPadding - decrement);
              frame.paddingTop = newPadding;
              frame.paddingBottom = newPadding;
              frame.paddingLeft = newPadding;
              frame.paddingRight = newPadding;
              changesApplied++;
            }
          } catch (e) {
            // Padding may not be editable
          }
        });
        if (changesApplied > 0) {
          message = `Padding decreased by ${valueText} on ${changesApplied} container${changesApplied !== 1 ? 's' : ''}`;
        }
      }
    }
    
    if (changesApplied > 0) {
      // Capture snapshot after changes
      await handleCaptureSnapshot(false, undefined, lastPreferenceActionId);
      return { success: true, changesApplied, message };
    } else {
      return { success: false, changesApplied: 0, message: 'No changes could be applied automatically' };
    }
  } catch (error) {
    return { 
      success: false, 
      changesApplied: 0, 
      message: `Error applying changes: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

// Initialize plugin
initializeUI();

// Initialize rule system from server config on startup
initializeRuleSystemFromConfig().catch(err => {
});

// Register event listeners
figma.on('selectionchange', handleSelectionChange);
figma.on('documentchange', handleDocumentChange);
figma.ui.onmessage = handleUIMessage;

