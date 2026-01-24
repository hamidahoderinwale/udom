/**
 * Generate hash for images to enable deduplication
 * Figma plugins run in a sandbox without standard Web Crypto API,
 * so we use a simple but effective hashing approach
 */

export async function generateImageHash(imageData: Uint8Array): Promise<string> {
  // Simple hash function suitable for Figma plugin environment
  // Combines length, sample bytes from start/middle/end for reasonable uniqueness
  const len = imageData.length;
  const mid = Math.floor(len / 2);
  
  // Sample bytes from beginning, middle, and end
  const sampleStart = Array.from(imageData.slice(0, 50));
  const sampleMid = Array.from(imageData.slice(mid, mid + 50));
  const sampleEnd = Array.from(imageData.slice(-50));
  
  // Combine into a hash string
  const combined = [
    len.toString(16),
    ...sampleStart.map(b => b.toString(16).padStart(2, '0')),
    ...sampleMid.map(b => b.toString(16).padStart(2, '0')),
    ...sampleEnd.map(b => b.toString(16).padStart(2, '0'))
  ].join('');
  
  // Simple hash computation
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36).padStart(16, '0').substring(0, 16);
}

