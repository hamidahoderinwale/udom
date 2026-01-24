/**
 * Generate markdown documentation for snapshots
 */

class MarkdownGenerator {
  generateSnapshotDocs(snapshot) {
    const metadata = snapshot.metadata || {};
    const observations = snapshot.observations || {};
    const intent = observations.intent || {};
    
    let md = `# Snapshot: ${metadata.snapshot_id.substring(0, 8)}\n\n`;
    
    md += `## Metadata\n\n`;
    md += `- **Artifact ID**: \`${metadata.artifact_id || 'N/A'}\`\n`;
    md += `- **Type**: ${metadata.artifact_type || 'unknown'}\n`;
    md += `- **Timestamp**: ${new Date(metadata.timestamp).toISOString()}\n`;
    md += `- **Schema Version**: ${metadata.schema_version || '1.0.0'}\n\n`;
    
    if (intent.user_intent) {
      md += `## User Intent\n\n`;
      md += `> ${intent.user_intent}\n\n`;
    }
    
    if (intent.inferred_intent) {
      md += `## Inferred Intent\n\n`;
      md += `- **Action Type**: ${intent.inferred_intent.action_type}\n`;
      md += `- **Focus Area**: ${intent.inferred_intent.focus_area}\n`;
      md += `- **Confidence**: ${(intent.inferred_intent.confidence * 100).toFixed(0)}%\n\n`;
    }
    
    if (snapshot.elements && snapshot.elements.length > 0) {
      md += `## Elements (${snapshot.elements.length})\n\n`;
      snapshot.elements.slice(0, 10).forEach((el, i) => {
        md += `${i + 1}. **${el.semantic_type || el.type}** - ${el.properties?.name || 'unnamed'}\n`;
      });
      if (snapshot.elements.length > 10) {
        md += `\n*... and ${snapshot.elements.length - 10} more*\n`;
      }
      md += `\n`;
    }
    
    if (snapshot.composition_rules) {
      md += `## Composition Rules\n\n`;
      if (snapshot.composition_rules.spacing) {
        md += `### Spacing\n\n`;
        if (snapshot.composition_rules.spacing.vertical_rhythm) {
          md += `- Vertical rhythm: ${snapshot.composition_rules.spacing.vertical_rhythm.base_unit}px\n`;
        }
      }
      md += `\n`;
    }
    
    if (snapshot.rendering_manifest?.assets?.images) {
      md += `## Visual State\n\n`;
      md += `- Screenshot captured: ${snapshot.rendering_manifest.assets.images.length} image(s)\n`;
      md += `- Dimensions: ${snapshot.rendering_manifest.viewport?.width || 'N/A'} × ${snapshot.rendering_manifest.viewport?.height || 'N/A'}\n\n`;
    }
    
    md += `## Full Data\n\n`;
    md += `\`\`\`json\n${JSON.stringify(snapshot, null, 2)}\n\`\`\`\n`;
    
    return md;
  }
}

module.exports = new MarkdownGenerator();


