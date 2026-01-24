/**
 * Diff Computer - Computes structured changes between uDOM snapshots
 * 
 * Compares two uDOM schema instances and extracts:
 * - Added/removed/modified elements
 * - Property-level changes
 * - Structural changes
 */

import type { uDOMSnapshot } from '../types/udom';

export interface PropertyChange {
  property: string;
  old_value: any;
  new_value: any;
  path: string; // JSON path like "properties.color" or "properties.spacing.padding"
}

export interface ElementChange {
  element_id: string;
  stable_id?: string;
  change_type: 'added' | 'removed' | 'modified';
  element_type?: string;
  property_changes?: PropertyChange[];
  element?: any; // Full element data for added/removed
}

export interface SnapshotDiff {
  snapshot_id: string;
  previous_snapshot_id: string;
  artifact_id: string;
  timestamp: number;
  element_changes: ElementChange[];
  composition_rule_changes?: PropertyChange[];
  summary: {
    added_count: number;
    removed_count: number;
    modified_count: number;
    total_property_changes: number;
  };
}

export class DiffComputer {
  /**
   * Compute diff between two snapshots
   */
  computeDiff(
    previous: uDOMSnapshot,
    current: uDOMSnapshot
  ): SnapshotDiff {
    const elementChanges: ElementChange[] = [];
    
    // Build maps for efficient lookup
    const prevElements = new Map<string, any>();
    const currElements = new Map<string, any>();
    
    // Index by stable_id (preferred) or id (fallback)
    previous.elements?.forEach(elem => {
      const key = elem.stable_id || elem.id;
      if (key) prevElements.set(key, elem);
    });
    
    current.elements?.forEach(elem => {
      const key = elem.stable_id || elem.id;
      if (key) currElements.set(key, elem);
    });
    
    // Find added elements
    for (const [key, elem] of currElements) {
      if (!prevElements.has(key)) {
        elementChanges.push({
          element_id: elem.id,
          stable_id: elem.stable_id,
          change_type: 'added',
          element_type: elem.type,
          element: elem,
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
          element: elem,
        });
      }
    }
    
    // Find modified elements
    for (const [key, currElem] of currElements) {
      const prevElem = prevElements.get(key);
      if (prevElem) {
        const propertyChanges = this.compareElementProperties(prevElem, currElem);
        if (propertyChanges.length > 0) {
          elementChanges.push({
            element_id: currElem.id,
            stable_id: currElem.stable_id,
            change_type: 'modified',
            element_type: currElem.type,
            property_changes: propertyChanges,
          });
        }
      }
    }
    
    // Compare composition rules
    const compositionChanges = this.compareCompositionRules(
      previous.composition_rules,
      current.composition_rules
    );
    
    // Generate summary
    const summary = {
      added_count: elementChanges.filter(c => c.change_type === 'added').length,
      removed_count: elementChanges.filter(c => c.change_type === 'removed').length,
      modified_count: elementChanges.filter(c => c.change_type === 'modified').length,
      total_property_changes: elementChanges.reduce(
        (sum, c) => sum + (c.property_changes?.length || 0),
        0
      ),
    };
    
    return {
      snapshot_id: current.metadata.snapshot_id,
      previous_snapshot_id: previous.metadata.snapshot_id,
      artifact_id: current.metadata.artifact_id,
      timestamp: current.metadata.timestamp,
      element_changes: elementChanges,
      composition_rule_changes: compositionChanges.length > 0 ? compositionChanges : undefined,
      summary,
    };
  }
  
  /**
   * Compare properties of two elements
   */
  private compareElementProperties(prev: any, curr: any): PropertyChange[] {
    const changes: PropertyChange[] = [];
    
    // Compare top-level properties
    const propertiesToCheck = [
      'type',
      'name',
      'visible',
      'opacity',
      'x', 'y', 'width', 'height',
    ];
    
    for (const prop of propertiesToCheck) {
      if (prev[prop] !== curr[prop]) {
        changes.push({
          property: prop,
          old_value: prev[prop],
          new_value: curr[prop],
          path: prop,
        });
      }
    }
    
    // Compare nested properties object
    if (prev.properties || curr.properties) {
      const propChanges = this.deepCompare(
        prev.properties || {},
        curr.properties || {},
        'properties'
      );
      changes.push(...propChanges);
    }
    
    // Compare states (hover, pressed, etc.)
    if (prev.states || curr.states) {
      const stateChanges = this.deepCompare(
        prev.states || {},
        curr.states || {},
        'states'
      );
      changes.push(...stateChanges);
    }
    
    return changes;
  }
  
  /**
   * Deep compare nested objects
   */
  private deepCompare(prev: any, curr: any, basePath: string): PropertyChange[] {
    const changes: PropertyChange[] = [];
    
    // Get all keys from both objects
    const allKeys = new Set([
      ...Object.keys(prev || {}),
      ...Object.keys(curr || {}),
    ]);
    
    for (const key of allKeys) {
      const path = `${basePath}.${key}`;
      const prevVal = prev?.[key];
      const currVal = curr?.[key];
      
      // Handle nested objects
      if (
        prevVal &&
        currVal &&
        typeof prevVal === 'object' &&
        typeof currVal === 'object' &&
        !Array.isArray(prevVal) &&
        !Array.isArray(currVal) &&
        !(prevVal instanceof Date) &&
        !(currVal instanceof Date)
      ) {
        // Recursively compare nested objects
        const nestedChanges = this.deepCompare(prevVal, currVal, path);
        changes.push(...nestedChanges);
      } else {
        // Compare primitive values or arrays
        if (!this.deepEqual(prevVal, currVal)) {
          changes.push({
            property: key,
            old_value: prevVal,
            new_value: currVal,
            path,
          });
        }
      }
    }
    
    return changes;
  }
  
  /**
   * Deep equality check
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    
    if (typeof a === 'object') {
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((val, idx) => this.deepEqual(val, b[idx]));
      }
      
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      
      return keysA.every(key => this.deepEqual(a[key], b[key]));
    }
    
    return false;
  }
  
  /**
   * Compare composition rules
   */
  private compareCompositionRules(
    prev: any,
    curr: any
  ): PropertyChange[] {
    if (!prev && !curr) return [];
    if (!prev) return [{ property: 'composition_rules', old_value: null, new_value: curr, path: 'composition_rules' }];
    if (!curr) return [{ property: 'composition_rules', old_value: prev, new_value: null, path: 'composition_rules' }];
    
    return this.deepCompare(prev, curr, 'composition_rules');
  }
}


