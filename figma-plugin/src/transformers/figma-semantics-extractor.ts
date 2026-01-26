/**
 * Extract Figma-specific platform semantics from uDOM snapshots
 */

import type { uDOMSnapshot } from '../types/udom';
import type { PlatformSemanticsExtractor } from './snapshot-to-matcher-input';

export class FigmaSemanticsExtractor implements PlatformSemanticsExtractor {
  extract(snapshot: uDOMSnapshot): {
    action_types: string[];
    property_types: string[];
    element_types: string[];
  } {
    const actionTypes = new Set<string>();
    const propertyTypes = new Set<string>();
    const elementTypes = new Set<string>();

    // Extract from elements
    snapshot.elements.forEach(element => {
      elementTypes.add(element.type);

      if (element.properties) {
        Object.keys(element.properties).forEach(key => {
          propertyTypes.add(key);
        });
      }

      if (element.spatial) propertyTypes.add('spatial');
      if (element.visual) propertyTypes.add('visual');
      if (element.text) propertyTypes.add('text');
      if (element.vector) propertyTypes.add('vector');
    });

    // Extract from relations
    snapshot.relations.forEach(relation => {
      actionTypes.add(`relation_${relation.type}`);
    });

    return {
      action_types: Array.from(actionTypes),
      property_types: Array.from(propertyTypes),
      element_types: Array.from(elementTypes),
    };
  }
}



