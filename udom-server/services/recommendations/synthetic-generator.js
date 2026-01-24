/**
 * Synthetic Recommendation Generator
 * 
 * Generates design recommendations automatically by analyzing snapshot patterns
 * without requiring user input. Works alongside user intent-based recommendations.
 */

class SyntheticRecommendationGenerator {
  constructor() {
    // Design dimension patterns to detect
    this.dimensionPatterns = {
      spacing: {
        keywords: ['spacing', 'margin', 'padding', 'gap', 'rhythm', 'whitespace'],
        analysis: this.analyzeSpacing.bind(this)
      },
      typography: {
        keywords: ['typography', 'font', 'text', 'type', 'line height'],
        analysis: this.analyzeTypography.bind(this)
      },
      layout: {
        keywords: ['layout', 'grid', 'alignment', 'position', 'arrangement'],
        analysis: this.analyzeLayout.bind(this)
      },
      visual_hierarchy: {
        keywords: ['hierarchy', 'emphasis', 'prominence', 'importance'],
        analysis: this.analyzeVisualHierarchy.bind(this)
      },
      color: {
        keywords: ['color', 'palette', 'contrast', 'hue'],
        analysis: this.analyzeColor.bind(this)
      },
      interaction: {
        keywords: ['interaction', 'flow', 'navigation', 'click', 'hover'],
        analysis: this.analyzeInteraction.bind(this)
      }
    };
  }

  /**
   * Generate synthetic recommendations from snapshot analysis
   */
  generateRecommendations(snapshot, previousSnapshot = null, context = {}) {
    const recommendations = [];
    
    // Analyze composition rules
    if (snapshot.composition_rules) {
      recommendations.push(...this.analyzeCompositionRules(snapshot));
    }
    
    // Analyze elements for design patterns
    if (snapshot.elements && snapshot.elements.length > 0) {
      recommendations.push(...this.analyzeElements(snapshot));
    }
    
    // Compare with previous snapshot for improvements
    if (previousSnapshot) {
      recommendations.push(...this.analyzeChanges(snapshot, previousSnapshot));
    }
    
    // Filter and rank recommendations
    const ranked = this.rankRecommendations(recommendations, snapshot, context);
    
    return ranked.slice(0, 5); // Return top 5
  }

  /**
   * Analyze composition rules for improvement opportunities
   */
  analyzeCompositionRules(snapshot) {
    const recommendations = [];
    const rules = snapshot.composition_rules;
    
    // Spacing analysis
    if (rules.spacing) {
      const spacingRecs = this.analyzeSpacing(rules.spacing, snapshot);
      recommendations.push(...spacingRecs);
    }
    
    // Visual hierarchy analysis
    if (rules.visual_hierarchy) {
      const hierarchyRecs = this.analyzeVisualHierarchy(rules.visual_hierarchy, snapshot);
      recommendations.push(...hierarchyRecs);
    }
    
    // Layout analysis
    if (rules.hierarchy) {
      const layoutRecs = this.analyzeLayout(rules.hierarchy, snapshot);
      recommendations.push(...layoutRecs);
    }
    
    return recommendations;
  }

  /**
   * Analyze spacing patterns
   */
  analyzeSpacing(spacingRules, snapshot) {
    const recommendations = [];
    
    if (spacingRules.vertical_rhythm) {
      const baseUnit = spacingRules.vertical_rhythm.base_unit;
      
      // Check if spacing is consistent
      if (baseUnit && baseUnit > 0) {
        // Suggest improvements if spacing seems inconsistent
        recommendations.push({
          rule_id: `spacing_vertical_rhythm_${snapshot.metadata.snapshot_id}`,
          description: `Standardize vertical spacing using ${baseUnit}px base unit for consistent rhythm`,
          confidence: 0.75,
          scope: 'compositional',
          match_score: 0.8,
          dimension: 'spacing',
          improvement_type: 'standardization'
        });
      }
    }
    
    if (spacingRules.horizontal_rhythm) {
      const gutter = spacingRules.horizontal_rhythm.gutter;
      
      if (gutter && gutter > 0) {
        recommendations.push({
          rule_id: `spacing_horizontal_grid_${snapshot.metadata.snapshot_id}`,
          description: `Align elements to ${spacingRules.horizontal_rhythm.grid_columns || 12}-column grid with ${gutter}px gutter`,
          confidence: 0.7,
          scope: 'compositional',
          match_score: 0.75,
          dimension: 'spacing',
          improvement_type: 'alignment'
        });
      }
    }
    
    return recommendations;
  }

  /**
   * Analyze typography patterns
   */
  analyzeTypography(_, snapshot) {
    const recommendations = [];
    
    // Analyze text elements
    if (snapshot.elements) {
      const textElements = snapshot.elements.filter(el => 
        el.type === 'TEXT' || el.properties?.type === 'TEXT'
      );
      
      if (textElements.length > 0) {
        // Check for font size consistency
        const fontSizes = textElements
          .map(el => el.properties?.fontSize || el.properties?.font_size)
          .filter(Boolean);
        
        if (fontSizes.length > 0) {
          const uniqueSizes = [...new Set(fontSizes)];
          
          if (uniqueSizes.length > 5) {
            recommendations.push({
              rule_id: `typography_size_harmony_${snapshot.metadata.snapshot_id}`,
              description: 'Reduce font size variations to create visual harmony (currently using too many different sizes)',
              confidence: 0.8,
              scope: 'compositional',
              match_score: 0.85,
              dimension: 'typography',
              improvement_type: 'harmony'
            });
          }
        }
        
        // Check for line height consistency
        const lineHeights = textElements
          .map(el => el.properties?.lineHeight || el.properties?.line_height)
          .filter(Boolean);
        
        if (lineHeights.length > 0) {
          const avgLineHeight = lineHeights.reduce((a, b) => a + b, 0) / lineHeights.length;
          
          if (avgLineHeight < 1.2) {
            recommendations.push({
              rule_id: `typography_line_height_${snapshot.metadata.snapshot_id}`,
              description: `Increase line height to at least 1.4 for better readability (currently ${avgLineHeight.toFixed(2)})`,
              confidence: 0.75,
              scope: 'compositional',
              match_score: 0.8,
              dimension: 'typography',
              improvement_type: 'readability'
            });
          }
        }
      }
    }
    
    return recommendations;
  }

  /**
   * Analyze layout patterns
   */
  analyzeLayout(hierarchyRules, snapshot) {
    const recommendations = [];
    
    if (hierarchyRules.max_nesting_depth) {
      const maxDepth = hierarchyRules.max_nesting_depth;
      
      // Suggest simplification if nesting is too deep
      if (maxDepth > 5) {
        recommendations.push({
          rule_id: `layout_simplify_nesting_${snapshot.metadata.snapshot_id}`,
          description: `Simplify component structure (currently ${maxDepth} levels deep, consider flattening to 3-4 levels)`,
          confidence: 0.7,
          scope: 'structural',
          match_score: 0.75,
          dimension: 'layout',
          improvement_type: 'simplification'
        });
      }
    }
    
    // Analyze element alignment
    if (snapshot.elements && snapshot.elements.length > 1) {
      const alignmentRecs = this.analyzeAlignment(snapshot);
      recommendations.push(...alignmentRecs);
    }
    
    return recommendations;
  }

  /**
   * Analyze visual hierarchy
   */
  analyzeVisualHierarchy(hierarchyRules, snapshot) {
    const recommendations = [];
    
    if (hierarchyRules.emphasis_levels) {
      const levels = hierarchyRules.emphasis_levels;
      
      // Suggest more levels if too few
      if (levels < 3) {
        recommendations.push({
          rule_id: `hierarchy_add_levels_${snapshot.metadata.snapshot_id}`,
          description: `Increase visual hierarchy levels from ${levels} to at least 3-4 for better content organization`,
          confidence: 0.75,
          scope: 'compositional',
          match_score: 0.8,
          dimension: 'visual_hierarchy',
          improvement_type: 'enhancement'
        });
      }
      
      // Suggest fewer levels if too many
      if (levels > 6) {
        recommendations.push({
          rule_id: `hierarchy_reduce_levels_${snapshot.metadata.snapshot_id}`,
          description: `Reduce visual hierarchy levels from ${levels} to 4-5 for clearer structure`,
          confidence: 0.7,
          scope: 'compositional',
          match_score: 0.75,
          dimension: 'visual_hierarchy',
          improvement_type: 'simplification'
        });
      }
    }
    
    return recommendations;
  }

  /**
   * Analyze color patterns
   */
  analyzeColor(_, snapshot) {
    const recommendations = [];
    
    if (snapshot.elements) {
      const colors = new Set();
      
      snapshot.elements.forEach(el => {
        if (el.properties?.fills) {
          el.properties.fills.forEach(fill => {
            if (fill.color) {
              colors.add(JSON.stringify(fill.color));
            }
          });
        }
      });
      
      // Suggest color palette if too many colors
      if (colors.size > 8) {
        recommendations.push({
          rule_id: `color_palette_reduction_${snapshot.metadata.snapshot_id}`,
          description: `Reduce color palette from ${colors.size} colors to 4-6 primary colors for better consistency`,
          confidence: 0.75,
          scope: 'compositional',
          match_score: 0.8,
          dimension: 'color',
          improvement_type: 'consistency'
        });
      }
    }
    
    return recommendations;
  }

  /**
   * Analyze interaction patterns
   */
  analyzeInteraction(_, snapshot) {
    const recommendations = [];
    
    // Check for interactive elements
    if (snapshot.elements) {
      const interactiveElements = snapshot.elements.filter(el => 
        el.properties?.type === 'BUTTON' || 
        el.properties?.type === 'COMPONENT' ||
        el.states?.hover ||
        el.states?.pressed
      );
      
      if (interactiveElements.length > 0) {
        // Check touch target sizes
        interactiveElements.forEach(el => {
          const width = el.properties?.width || 0;
          const height = el.properties?.height || 0;
          const minSize = Math.min(width, height);
          
          if (minSize < 44) {
            recommendations.push({
              rule_id: `interaction_touch_target_${el.id}`,
              description: `Increase touch target size to at least 44x44px for better accessibility (currently ${Math.round(minSize)}px)`,
              confidence: 0.85,
              scope: 'artifact_property',
              match_score: 0.9,
              dimension: 'interaction',
              improvement_type: 'accessibility'
            });
          }
        });
      }
    }
    
    return recommendations;
  }

  /**
   * Analyze element alignment
   */
  analyzeAlignment(snapshot) {
    const recommendations = [];
    
    if (!snapshot.elements || snapshot.elements.length < 2) {
      return recommendations;
    }
    
    // Group elements by similar Y positions (horizontal alignment)
    const yPositions = snapshot.elements
      .map(el => el.properties?.y || el.properties?.top || 0)
      .filter(Boolean);
    
    if (yPositions.length > 0) {
      const yGroups = this.groupSimilarValues(yPositions, 10); // 10px tolerance
      
      // If many elements are close but not perfectly aligned
      if (yGroups.length > 0 && yGroups[0].length > 2) {
        const misaligned = snapshot.elements.length - yGroups[0].length;
        
        if (misaligned > 0) {
          recommendations.push({
            rule_id: `layout_align_horizontal_${snapshot.metadata.snapshot_id}`,
            description: `Align ${misaligned} horizontally misaligned elements for cleaner layout`,
            confidence: 0.7,
            scope: 'structural',
            match_score: 0.75,
            dimension: 'layout',
            improvement_type: 'alignment'
          });
        }
      }
    }
    
    return recommendations;
  }

  /**
   * Analyze elements for design patterns
   */
  analyzeElements(snapshot) {
    const recommendations = [];
    
    if (!snapshot.elements || snapshot.elements.length === 0) {
      return recommendations;
    }
    
    const elementCount = snapshot.elements.length;
    
    // Check element count - suggest organization for large components
    if (elementCount > 20) {
      recommendations.push({
        rule_id: `layout_element_count_${snapshot.metadata.snapshot_id}`,
        description: `Consider grouping ${elementCount} elements into components for better organization`,
        confidence: 0.65,
        scope: 'structural',
        match_score: 0.7,
        dimension: 'layout',
        improvement_type: 'organization'
      });
    }
    
    // Provide basic recommendations for any snapshot
    // Check for spacing consistency
    if (elementCount >= 2) {
      const spacingRecs = this.analyzeSpacingFromElements(snapshot);
      recommendations.push(...spacingRecs);
    }
    
    // Check for typography if text elements exist
    const textElements = snapshot.elements.filter(el => 
      el.type === 'TEXT' || 
      el.properties?.type === 'TEXT' ||
      el.properties?.text !== undefined
    );
    
    if (textElements.length > 0) {
      const typographyRecs = this.analyzeTypography(null, snapshot);
      recommendations.push(...typographyRecs);
    }
    
    // Check for color consistency
    const colorRecs = this.analyzeColor(null, snapshot);
    recommendations.push(...colorRecs);
    
    // Check for interaction patterns
    const interactionRecs = this.analyzeInteraction(null, snapshot);
    recommendations.push(...interactionRecs);
    
    // If still no recommendations, provide a general one
    if (recommendations.length === 0 && elementCount > 0) {
      recommendations.push({
        rule_id: `general_review_${snapshot.metadata.snapshot_id}`,
        description: 'Review component for spacing consistency, typography hierarchy, and visual alignment',
        confidence: 0.6,
        scope: 'compositional',
        match_score: 0.65,
        dimension: 'layout',
        improvement_type: 'enhancement'
      });
    }
    
    return recommendations;
  }
  
  /**
   * Analyze spacing from element positions
   */
  analyzeSpacingFromElements(snapshot) {
    const recommendations = [];
    
    if (!snapshot.elements || snapshot.elements.length < 2) {
      return recommendations;
    }
    
    // Check for consistent spacing between elements
    const positions = snapshot.elements
      .map(el => ({
        x: el.properties?.x || el.properties?.left || 0,
        y: el.properties?.y || el.properties?.top || 0,
        width: el.properties?.width || 0,
        height: el.properties?.height || 0
      }))
      .filter(pos => pos.width > 0 && pos.height > 0);
    
    if (positions.length >= 2) {
      // Check vertical spacing consistency
      const sortedByY = [...positions].sort((a, b) => a.y - b.y);
      const verticalGaps = [];
      
      for (let i = 0; i < sortedByY.length - 1; i++) {
        const gap = sortedByY[i + 1].y - (sortedByY[i].y + sortedByY[i].height);
        if (gap > 0) {
          verticalGaps.push(gap);
        }
      }
      
      if (verticalGaps.length > 0) {
        const uniqueGaps = [...new Set(verticalGaps.map(g => Math.round(g / 4) * 4))]; // Round to 4px increments
        if (uniqueGaps.length > 3) {
          recommendations.push({
            rule_id: `spacing_consistency_vertical_${snapshot.metadata.snapshot_id}`,
            description: `Standardize vertical spacing (currently using ${uniqueGaps.length} different spacing values). Use a consistent spacing scale (e.g., 4px, 8px, 16px).`,
            confidence: 0.7,
            scope: 'compositional',
            match_score: 0.75,
            dimension: 'spacing',
            improvement_type: 'consistency'
          });
        }
      }
    }
    
    return recommendations;
  }

  /**
   * Analyze changes between snapshots
   */
  analyzeChanges(currentSnapshot, previousSnapshot) {
    const recommendations = [];
    
    // Compare element counts
    const currentCount = currentSnapshot.elements?.length || 0;
    const previousCount = previousSnapshot.elements?.length || 0;
    
    if (currentCount > previousCount * 1.5) {
      recommendations.push({
        rule_id: `change_complexity_increase_${currentSnapshot.metadata.snapshot_id}`,
        description: `Complexity increased significantly (${previousCount} → ${currentCount} elements). Consider componentization.`,
        confidence: 0.7,
        scope: 'structural',
        match_score: 0.75,
        dimension: 'layout',
        improvement_type: 'complexity_management'
      });
    }
    
    return recommendations;
  }

  /**
   * Rank recommendations by relevance and confidence
   */
  rankRecommendations(recommendations, snapshot, context) {
    return recommendations
      .map(rec => {
        // Boost score based on improvement type
        const typeBoost = {
          'accessibility': 0.1,
          'readability': 0.1,
          'consistency': 0.05,
          'standardization': 0.05,
          'harmony': 0.05,
          'alignment': 0.05,
          'simplification': 0.03,
          'enhancement': 0.03,
          'organization': 0.02,
          'complexity_management': 0.02
        };
        
        rec.match_score = Math.min(1.0, rec.match_score + (typeBoost[rec.improvement_type] || 0));
        
        return rec;
      })
      .sort((a, b) => {
        // Sort by match_score first, then confidence
        if (Math.abs(a.match_score - b.match_score) > 0.01) {
          return b.match_score - a.match_score;
        }
        return b.confidence - a.confidence;
      });
  }

  /**
   * Group similar values within tolerance
   */
  groupSimilarValues(values, tolerance) {
    const groups = [];
    const used = new Set();
    
    values.forEach((val, idx) => {
      if (used.has(idx)) return;
      
      const group = [val];
      used.add(idx);
      
      values.forEach((otherVal, otherIdx) => {
        if (idx !== otherIdx && !used.has(otherIdx) && Math.abs(val - otherVal) <= tolerance) {
          group.push(otherVal);
          used.add(otherIdx);
        }
      });
      
      if (group.length > 1) {
        groups.push(group);
      }
    });
    
    return groups.sort((a, b) => b.length - a.length);
  }
}

module.exports = SyntheticRecommendationGenerator;

