/**
 * Generate content-addressable stable ID from node properties
 */
export async function generateStableId(node: SceneNode): Promise<string> {
  // Collect properties that define identity
  const props: Record<string, any> = {
    type: node.type,
    name: node.name,
    width: node.width,
    height: node.height,
  };

  // Add type-specific properties with type guards
  if ('fills' in node) {
    const fills = (node as any).fills;
    if (Array.isArray(fills) && fills.length > 0) {
      props['fills'] = JSON.stringify(fills);
    }
  }
  if ('cornerRadius' in node) {
    props['cornerRadius'] = (node as any).cornerRadius;
  }

  // Create hash from properties
  const str = JSON.stringify(props);
  const hash = simpleHash(str);
  return `content-hash:${hash}`;
}

function simpleHash(str: string): string {
  // Simple hash function (not cryptographic, but sufficient for content addressing)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).padStart(8, '0');
}

