/**
 * Extract uDOM structure from Figma node
 */
import { generateStableId } from '../utils/stable-id';

export async function extractStructure(node: SceneNode): Promise<any[]> {
  const elements: any[] = [];

  function traverse(n: SceneNode, parentId?: string) {
    const element: any = {
      id: n.id,
      stable_id: '', // Will be set after extraction
      type: n.type,
      semantic_type: inferSemanticType(n),
      properties: extractProperties(n),
      spatial: extractSpatial(n),
    };

    // Add visual properties if available
    if ('fills' in n || 'strokes' in n || 'effects' in n) {
      element.visual = extractVisual(n);
    }

    // Add text properties if text node
    if (n.type === 'TEXT') {
      element.text = extractText(n as TextNode);
    }

    elements.push(element);

    // Traverse children
    if ('children' in n) {
      (n as ChildrenMixin).children.forEach(child => {
        traverse(child, n.id);
      });
    }
  }

  traverse(node);
  
  // Generate stable IDs for all elements
  for (const element of elements) {
    const nodeElement = findNodeById(node, element.id);
    if (nodeElement) {
      element.stable_id = await generateStableId(nodeElement);
    }
  }

  return elements;
}

function extractProperties(node: SceneNode): any {
  const props: any = {
    name: node.name,
    width: node.width,
    height: node.height,
  };

  // Figma-specific properties
  if (node.type === 'COMPONENT' || node.type === 'INSTANCE') {
    const component = node as ComponentNode;
    if ('layoutMode' in component) {
      props.layoutMode = component.layoutMode;
    }
    if ('paddingLeft' in component) {
      props.paddingLeft = component.paddingLeft;
      props.paddingRight = component.paddingRight;
      props.paddingTop = component.paddingTop;
      props.paddingBottom = component.paddingBottom;
    }
    if ('itemSpacing' in component) {
      props.itemSpacing = component.itemSpacing;
    }
  }

  if ('cornerRadius' in node) {
    props.cornerRadius = node.cornerRadius;
  }

  if ('fills' in node) {
    props.fills = node.fills;
  }

  return props;
}

function extractSpatial(node: SceneNode): any {
  return {
    absolute: {
      coordinate_system: 'canvas',
      bounds: {
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
      },
    },
    relative: node.type === 'COMPONENT' && 'layoutMode' in node ? {
      layout_mode: node.layoutMode === 'HORIZONTAL' ? 'flex' : 'flex',
      flex: {
        direction: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
        align: 'center',
        justify: 'center',
      },
    } : undefined,
  };
}

function extractVisual(node: SceneNode): any {
  const visual: any = {};

  if ('fills' in node) {
    const fills = (node as any).fills;
    if (Array.isArray(fills) && fills.length > 0) {
      const fill = fills[0] as SolidPaint;
      if (fill.type === 'SOLID') {
        visual.background = {
          type: 'solid',
          color: rgbToHex(fill.color),
        };
      }
    }
  }

  if ('cornerRadius' in node && typeof node.cornerRadius === 'number') {
    visual.border_radius = {
      tl: node.cornerRadius,
      tr: node.cornerRadius,
      br: node.cornerRadius,
      bl: node.cornerRadius,
    };
  }

  if ('effects' in node && node.effects.length > 0) {
    visual.shadow = node.effects
      .filter(e => e.type === 'DROP_SHADOW')
      .map(e => {
        const shadow = e as DropShadowEffect;
        return {
          x: shadow.offset.x,
          y: shadow.offset.y,
          blur: shadow.radius,
          color: rgbaToHex(shadow.color),
        };
      });
  }

  return visual;
}

function extractText(node: TextNode): any {
  const fontName = node.fontName;
  const fontSize = typeof node.fontSize === 'number' ? node.fontSize : 16;
  const lineHeight = node.lineHeight;
  
  return {
    content: node.characters,
    font_family: (fontName !== figma.mixed && fontName) ? fontName.family : '',
    font_size: fontSize,
    font_weight: (fontName !== figma.mixed && fontName) ? fontName.style : 'Regular',
    line_height: (lineHeight !== figma.mixed && lineHeight && typeof lineHeight === 'object' && 'value' in lineHeight) ? lineHeight.value : fontSize,
  };
}

function inferSemanticType(node: SceneNode): string {
  const name = node.name.toLowerCase();
  if (name.includes('button')) return 'button';
  if (name.includes('input') || name.includes('field')) return 'input';
  if (name.includes('card')) return 'card';
  if (name.includes('modal') || name.includes('dialog')) return 'modal';
  if (name.includes('nav') || name.includes('menu')) return 'navigation';
  if (node.type === 'TEXT') return 'text';
  return 'container';
}

function findNodeById(root: SceneNode, id: string): SceneNode | null {
  if (root.id === id) return root;
  if ('children' in root) {
    for (const child of (root as ChildrenMixin).children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
}

function rgbToHex(color: RGB): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function rgbaToHex(color: RGBA): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = Math.round(color.a * 255);
  return `rgba(${r}, ${g}, ${b}, ${color.a})`;
}

