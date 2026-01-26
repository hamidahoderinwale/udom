/**
 * Intent enhancement utilities
 * 
 * Provides server-side intent inference for snapshots that don't have inferred_intent.
 * Can use heuristic-based inference or optional OpenRouter API for enhanced inference.
 */

const JsonStorage = require('./json-storage');

/**
 * Enhance snapshots with inferred intent
 * @param {Object} options - Configuration options
 * @param {string} options.apiKey - OpenRouter API key (optional, for enhanced inference)
 * @param {string} options.model - Model to use (default: 'anthropic/claude-3.5-sonnet')
 * @param {boolean} options.useOpenRouter - Whether to use OpenRouter for enhanced inference
 */
async function enhanceSnapshots(options = {}) {
  const { apiKey, model = 'anthropic/claude-3.5-sonnet', useOpenRouter = false } = options;
  const storage = new JsonStorage();
  await storage.initialize();
  
  try {
    // Get all snapshots (with high limit to get all)
    const allSnapshots = await storage.querySnapshots({ limit: 10000 });
    
    // Filter snapshots that need enhancement
    const snapshotsToEnhance = allSnapshots.filter(s => {
      const intent = s.observations?.intent;
      return intent && !intent.inferred_intent && intent.previous_snapshot_id;
    });
    
    let enhancedCount = 0;
    
    for (const snapshot of snapshotsToEnhance) {
      try {
        const previousSnapshotId = snapshot.observations.intent.previous_snapshot_id;
        const previousSnapshot = allSnapshots.find(s => s.metadata.snapshot_id === previousSnapshotId);
        
        if (!previousSnapshot) {
          continue;
        }
        
        // Compute diff
        const diff = computeDiff(previousSnapshot, snapshot);
        
        // Infer intent (heuristic-based)
        const inferred = inferIntentFromDiff(diff);
        
        if (inferred) {
          snapshot.observations.intent.inferred_intent = inferred;
          
          // Optionally enhance with OpenRouter
          if (useOpenRouter && apiKey) {
            const enhanced = await enhanceWithOpenRouter(diff, apiKey, model);
            if (enhanced) {
              // Merge enhanced inference (higher confidence wins)
              if (enhanced.confidence > inferred.confidence) {
                snapshot.observations.intent.inferred_intent = enhanced;
              }
            }
          }
          
          // Update snapshot by re-storing it
          await storage.storeSnapshot(snapshot);
          enhancedCount++;
        }
      } catch (error) {
        // Silently skip errors
      }
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Heuristic-based intent inference from diff
 */
function inferIntentFromDiff(diff) {
  const { summary } = diff;
  
  // Determine action type
  let actionType = 'modify';
  if (summary.added_count > summary.modified_count && summary.added_count > 2) {
    actionType = 'create';
  } else if (summary.total_property_changes > summary.added_count + summary.removed_count && summary.total_property_changes > 3) {
    actionType = 'refine';
  } else if (summary.total_property_changes <= 1) {
    actionType = 'explore';
  }
  
  // Determine focus area
  const propertyChanges = diff.element_changes?.flatMap(c => c.property_changes || []) || [];
  const propertyTypes = { spacing: 0, typography: 0, color: 0, layout: 0, hierarchy: 0, interaction: 0 };
  
  for (const change of propertyChanges) {
    const path = (change.path || '').toLowerCase();
    if (path.includes('spacing') || path.includes('padding') || path.includes('margin')) propertyTypes.spacing++;
    if (path.includes('font') || path.includes('text') || path.includes('typography')) propertyTypes.typography++;
    if (path.includes('color') || path.includes('fill') || path.includes('stroke')) propertyTypes.color++;
    if (path.includes('layout') || path.includes('position') || path.includes('align')) propertyTypes.layout++;
    if (path.includes('z') || path.includes('order') || path.includes('layer')) propertyTypes.hierarchy++;
    if (path.includes('interaction') || path.includes('hover') || path.includes('pressed')) propertyTypes.interaction++;
  }
  
  const maxCount = Math.max(...Object.values(propertyTypes));
  const focusArea = maxCount > 0 
    ? Object.entries(propertyTypes).find(([_, count]) => count === maxCount)?.[0]
    : 'layout';
  
  // Calculate confidence
  const totalChanges = summary.added_count + summary.removed_count + summary.modified_count;
  let confidence = 0.5;
  if (totalChanges > 0) confidence += Math.min(0.2, totalChanges * 0.05);
  if (summary.total_property_changes > 0) confidence += Math.min(0.2, summary.total_property_changes * 0.03);
  if (maxCount > 0 && propertyTypes[focusArea] === maxCount) confidence += 0.1;
  
  return {
    action_type: actionType,
    focus_area: focusArea,
    confidence: Math.min(0.95, Math.max(0.3, confidence)),
  };
}

/**
 * Enhanced inference using OpenRouter API (optional)
 */
async function enhanceWithOpenRouter(diff, apiKey, model) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/Taste-AI/hamidah-project',
        'X-Title': 'Taste Intent Inference',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an intent inference system. Analyze design changes and infer user intent. Return JSON: {"action_type": "create|modify|refine|explore", "focus_area": "spacing|typography|color|layout|hierarchy|interaction", "confidence": 0.0-1.0}'
          },
          {
            role: 'user',
            content: JSON.stringify({
              summary: diff.summary,
              sample_changes: diff.element_changes?.slice(0, 5) || [],
            }, null, 2)
          }
        ],
        temperature: 0.3,
        max_tokens: 256,
        response_format: { type: 'json_object' }
      })
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);
    
    return {
      action_type: content.action_type,
      focus_area: content.focus_area,
      confidence: content.confidence || 0.7,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Simple diff computation (server-side version)
 */
function computeDiff(previous, current) {
  const prevElements = new Map();
  const currElements = new Map();
  
  // Index by stable_id or id
  (previous.elements || []).forEach(elem => {
    const key = elem.stable_id || elem.id;
    if (key) prevElements.set(key, elem);
  });
  
  (current.elements || []).forEach(elem => {
    const key = elem.stable_id || elem.id;
    if (key) currElements.set(key, elem);
  });
  
  const elementChanges = [];
  
  // Find added elements
  for (const [key, elem] of currElements) {
    if (!prevElements.has(key)) {
      elementChanges.push({
        element_id: elem.id,
        stable_id: elem.stable_id,
        change_type: 'added',
        element_type: elem.type,
        property_changes: [],
      });
    }
  }
  
  // Find removed elements
  for (const [key, elem] of prevElements) {
    if (!currElements.has(key)) {
      elementChanges.push({
        element_id: elem.id,
        stable_id: elem.stable_id,
        change_type: 'removed',
        element_type: elem.type,
        property_changes: [],
      });
    }
  }
  
  // Find modified elements
  for (const [key, currElem] of currElements) {
    const prevElem = prevElements.get(key);
    if (prevElem) {
      const propertyChanges = compareProperties(prevElem, currElem);
      if (propertyChanges.length > 0) {
        elementChanges.push({
          element_id: currElem.id,
          stable_id: currElem.stable_id,
          change_type: 'modified',
          element_type: currElem.type,
          property_changes,
        });
      }
    }
  }
  
  const summary = {
    added_count: elementChanges.filter(c => c.change_type === 'added').length,
    removed_count: elementChanges.filter(c => c.change_type === 'removed').length,
    modified_count: elementChanges.filter(c => c.change_type === 'modified').length,
    total_property_changes: elementChanges.reduce((sum, c) => sum + (c.property_changes?.length || 0), 0),
  };
  
  return {
    snapshot_id: current.metadata.snapshot_id,
    previous_snapshot_id: previous.metadata.snapshot_id,
    artifact_id: current.metadata.artifact_id,
    timestamp: current.metadata.timestamp,
    element_changes: elementChanges,
    summary,
  };
}

function compareProperties(prev, curr) {
  const changes = [];
  const props = ['type', 'name', 'visible', 'opacity', 'x', 'y', 'width', 'height'];
  
  for (const prop of props) {
    if (prev[prop] !== curr[prop]) {
      changes.push({
        property: prop,
        old_value: prev[prop],
        new_value: curr[prop],
        path: prop,
      });
    }
  }
  
  // Compare nested properties
  if (prev.properties || curr.properties) {
    const nested = deepCompare(prev.properties || {}, curr.properties || {}, 'properties');
    changes.push(...nested);
  }
  
  return changes;
}

function deepCompare(prev, curr, basePath) {
  const changes = [];
  const allKeys = new Set([...Object.keys(prev || {}), ...Object.keys(curr || {})]);
  
  for (const key of allKeys) {
    const path = `${basePath}.${key}`;
    const prevVal = prev?.[key];
    const currVal = curr?.[key];
    
    if (prevVal && currVal && typeof prevVal === 'object' && !Array.isArray(prevVal)) {
      const nested = deepCompare(prevVal, currVal, path);
      changes.push(...nested);
    } else if (prevVal !== currVal) {
      changes.push({
        property: key,
        old_value: prevVal,
        new_value: currVal,
        path,
      });
    }
  }
  
  return changes;
}

module.exports = { enhanceSnapshots, inferIntentFromDiff, computeDiff };
