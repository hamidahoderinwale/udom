/**
 * Extract composition rules from Figma component
 */
import type { CompositionRules } from '../types/udom';

export function extractCompositionRules(node: SceneNode): CompositionRules | undefined {
  // Only extract for components with layout capabilities
  if (node.type !== 'COMPONENT' && node.type !== 'INSTANCE' && node.type !== 'FRAME') {
    return undefined;
  }

  const component = node as ComponentNode | FrameNode;
  const rules: CompositionRules = {};

  // Extract hierarchy rules
  if ('children' in component && component.children.length > 0) {
    const maxDepth = calculateMaxNestingDepth(component);
    if (maxDepth > 0) {
      rules.hierarchy = {
        max_nesting_depth: maxDepth,
        nesting_strategy: inferNestingStrategy(component),
      };
    }
  }

  // Extract spacing rules from auto-layout
  if ('layoutMode' in component && component.layoutMode !== 'NONE') {
    const spacing = extractSpacingRules(component);
    if (spacing) {
      rules.spacing = spacing;
    }
  }

  // Extract visual hierarchy from text elements
  const visualHierarchy = extractVisualHierarchy(component);
  if (visualHierarchy) {
    rules.visual_hierarchy = visualHierarchy;
  }

  // Extract constraints
  const constraints = extractConstraints(component);
  if (constraints && Object.keys(constraints).length > 0) {
    rules.constraints = constraints;
  }

  // Only return if we extracted something meaningful
  if (Object.keys(rules).length === 0) {
    return undefined;
  }

  return rules;
}

function calculateMaxNestingDepth(node: SceneNode, currentDepth: number = 0): number {
  if (!('children' in node) || node.children.length === 0) {
    return currentDepth;
  }

  let maxDepth = currentDepth;
  for (const child of node.children) {
    const childDepth = calculateMaxNestingDepth(child, currentDepth + 1);
    maxDepth = Math.max(maxDepth, childDepth);
  }

  return maxDepth;
}

function inferNestingStrategy(node: SceneNode): string {
  if (node.type === 'COMPONENT' || node.type === 'INSTANCE') {
    const component = node as ComponentNode;
    if ('layoutMode' in component && component.layoutMode !== 'NONE') {
      return component.layoutMode === 'HORIZONTAL' ? 'horizontal_stack' : 'vertical_stack';
    }
  }
  return 'freeform';
}

function extractSpacingRules(component: ComponentNode | FrameNode): CompositionRules['spacing'] | undefined {
  if (!('layoutMode' in component) || component.layoutMode === 'NONE') {
    return undefined;
  }

  const spacing: CompositionRules['spacing'] = {};

  // Extract vertical rhythm from padding and item spacing
  if ('paddingTop' in component && 'paddingBottom' in component) {
    const verticalPadding = component.paddingTop + component.paddingBottom;
    if (verticalPadding > 0) {
      spacing.vertical_rhythm = {
        base_unit: findGCD([component.paddingTop, component.paddingBottom, component.itemSpacing || 0].filter(v => v > 0)) || 4,
        scale: [0.5, 1, 1.5, 2, 3],
        apply_to: ['padding', 'margin', 'gap'],
      };
    }
  }

  // Extract horizontal rhythm from padding and item spacing
  if ('paddingLeft' in component && 'paddingRight' in component) {
    const horizontalPadding = component.paddingLeft + component.paddingRight;
    if (horizontalPadding > 0) {
      spacing.horizontal_rhythm = {
        base_unit: findGCD([component.paddingLeft, component.paddingRight, component.itemSpacing || 0].filter(v => v > 0)) || 4,
        grid_columns: 12,
        gutter: component.itemSpacing || 8,
      };
    }
  }

  return Object.keys(spacing).length > 0 ? spacing : undefined;
}

function extractVisualHierarchy(node: SceneNode): CompositionRules['visual_hierarchy'] | undefined {
  const textNodes: TextNode[] = [];
  
  function collectTextNodes(n: SceneNode) {
    if (n.type === 'TEXT') {
      textNodes.push(n as TextNode);
    }
    if ('children' in n) {
      n.children.forEach(collectTextNodes);
    }
  }
  
  collectTextNodes(node);
  
  if (textNodes.length < 2) {
    return undefined;
  }

  // Analyze font sizes and weights
  const sizes = textNodes
    .map(t => t.fontSize)
    .filter((s): s is number => typeof s === 'number' && s > 0);
  
  const weights = textNodes.map(t => {
    const fontName = t.fontName;
    if (fontName === figma.mixed || !fontName) return 400;
    const style = fontName.style || 'Regular';
    return style.includes('Bold') ? 700 : style.includes('Medium') ? 500 : 400;
  });

  if (sizes.length === 0) {
    return undefined;
  }

  const minSize = Math.min(...sizes);
  const maxSize = Math.max(...sizes);
  const sizeRange = maxSize - minSize;

  // Determine emphasis levels (typically 3-5 levels)
  const emphasisLevels = Math.min(5, Math.max(3, Math.ceil(sizeRange / 8) + 1));

  const rules: Array<{
    level: number;
    size_range?: { min: number; max: number };
    weight_range?: { min: number; max: number };
    color_prominence?: number;
  }> = [];

  // Group text nodes by size ranges
  const levelSize = sizeRange / (emphasisLevels - 1);
  for (let i = 0; i < emphasisLevels; i++) {
    const min = minSize + (i * levelSize);
    const max = minSize + ((i + 1) * levelSize);
    
    const nodesInLevel = textNodes.filter(t => {
      const size = t.fontSize;
      if (typeof size !== 'number') return false;
      return size >= min && size <= max;
    });

    if (nodesInLevel.length > 0) {
      const levelWeights = nodesInLevel.map(t => {
        const fontName = t.fontName;
        if (fontName === figma.mixed || !fontName) return 400;
        const style = fontName.style || 'Regular';
        return style.includes('Bold') ? 700 : style.includes('Medium') ? 500 : 400;
      });

      rules.push({
        level: i + 1,
        size_range: { min: Math.round(min), max: Math.round(max) },
        weight_range: {
          min: Math.min(...levelWeights),
          max: Math.max(...levelWeights),
        },
        color_prominence: i === emphasisLevels - 1 ? 1 : (i + 1) / emphasisLevels,
      });
    }
  }

  if (rules.length === 0) {
    return undefined;
  }

  return {
    emphasis_levels: emphasisLevels,
    primary_axis: 'vertical',
    rules,
  };
}

function extractConstraints(component: ComponentNode | FrameNode): CompositionRules['constraints'] | undefined {
  const constraints: CompositionRules['constraints'] = {};

  // Extract min touch target (common design constraint)
  if ('children' in component) {
    const minSize = Math.min(
      ...component.children.map(c => Math.min(c.width, c.height))
    );
    if (minSize > 0 && minSize < 48) {
      constraints.min_touch_target = 44; // Standard minimum
    }
  }

  // Extract aspect ratio locks
  if ('constraints' in component) {
    const hasAspectRatio = component.children.some((child: SceneNode) => {
      if ('constraints' in child) {
        const c = child.constraints;
        return c.horizontal === 'STRETCH' && c.vertical === 'STRETCH';
      }
      return false;
    });
    if (hasAspectRatio) {
      constraints.aspect_ratio_lock = true;
    }
  }

  // Extract max line length from text nodes
  if ('children' in component) {
    const textNodes = component.children.filter(c => c.type === 'TEXT') as TextNode[];
    if (textNodes.length > 0) {
      const maxWidth = Math.max(...textNodes.map(t => t.width));
      if (maxWidth > 0) {
        constraints.max_line_length = Math.round(maxWidth);
      }
    }
  }

  return Object.keys(constraints).length > 0 ? constraints : undefined;
}

// Helper: Find Greatest Common Divisor
function findGCD(numbers: number[]): number {
  if (numbers.length === 0) return 1;
  if (numbers.length === 1) return numbers[0];
  
  let gcd = numbers[0];
  for (let i = 1; i < numbers.length; i++) {
    gcd = gcdTwoNumbers(gcd, numbers[i]);
  }
  return gcd;
}

function gcdTwoNumbers(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

