/**
 * Preference Statistics Service
 * 
 * Provides structured preference statistics for rules, dimensions, and contexts.
 * Used for preference-based ranking and few-shot learning.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class PreferenceStatsService {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '../snapshots.db');
    this.db = new sqlite3.Database(this.dbPath);
  }

  /**
   * Get preference statistics for specific rule IDs
   * 
   * Returns: {
   *   rule_id: {
   *     accepted: number,
   *     rejected: number,
   *     modified: number,
   *     ignored: number,
   *     total: number,
   *     acceptanceRate: number (0.0-1.0),
   *     rejectionRate: number (0.0-1.0)
   *   }
   * }
   */
  async getRuleStats(ruleIds) {
    return new Promise((resolve, reject) => {
      if (!ruleIds || ruleIds.length === 0) {
        return resolve({});
      }

      const placeholders = ruleIds.map(() => '?').join(',');
      
      // Query preferences and extract rule-level stats
      this.db.all(`
        SELECT 
          event_id,
          user_action,
          suggested_rules
        FROM preferences
        WHERE suggested_rules IS NOT NULL
      `, [], (err, rows) => {
        if (err) {
          return reject(err);
        }

        const stats = {};
        ruleIds.forEach(ruleId => {
          stats[ruleId] = {
            accepted: 0,
            rejected: 0,
            modified: 0,
            ignored: 0,
            total: 0,
            acceptanceRate: 0.0,
            rejectionRate: 0.0
          };
        });

        // Process each preference event
        rows.forEach(row => {
          try {
            const userAction = JSON.parse(row.user_action);
            const suggestedRules = JSON.parse(row.suggested_rules);
            const actionType = userAction.type || 'ignored';

            // Check each suggested rule
            suggestedRules.forEach(rule => {
              const ruleId = rule.rule_id;
              if (ruleIds.includes(ruleId)) {
                stats[ruleId].total++;
                
                if (actionType === 'accepted' && userAction.rule_id === ruleId) {
                  stats[ruleId].accepted++;
                } else if (actionType === 'dismissed' && userAction.rule_id === ruleId) {
                  stats[ruleId].rejected++;
                } else if (actionType === 'modified' && userAction.rule_id === ruleId) {
                  stats[ruleId].modified++;
                } else if (actionType === 'ignored') {
                  stats[ruleId].ignored++;
                }
              }
            });
          } catch (e) {
            // Skip malformed rows
          }
        });

        // Calculate rates
        Object.keys(stats).forEach(ruleId => {
          const stat = stats[ruleId];
          const totalActions = stat.accepted + stat.rejected + stat.modified;
          if (totalActions > 0) {
            stat.acceptanceRate = stat.accepted / totalActions;
            stat.rejectionRate = stat.rejected / totalActions;
          }
        });

        resolve(stats);
      });
    });
  }

  /**
   * Get dimension-level preference statistics
   * 
   * Returns: {
   *   dimension: {
   *     accepted: number,
   *     rejected: number,
   *     acceptanceRate: number
   *   }
   * }
   */
  async getDimensionStats() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          user_action,
          suggested_rules,
          metadata
        FROM preferences
        WHERE suggested_rules IS NOT NULL
      `, [], (err, rows) => {
        if (err) {
          return reject(err);
        }

        const stats = {};

        rows.forEach(row => {
          try {
            const userAction = JSON.parse(row.user_action);
            const suggestedRules = JSON.parse(row.suggested_rules);
            const metadata = row.metadata ? JSON.parse(row.metadata) : {};
            const actionType = userAction.type || 'ignored';

            if (actionType === 'ignored') return;

            suggestedRules.forEach(rule => {
              // Extract dimension from rule or metadata
              const dimension = rule.dimension || 
                               metadata.dimension_group || 
                               'unknown';

              if (!stats[dimension]) {
                stats[dimension] = {
                  accepted: 0,
                  rejected: 0,
                  modified: 0,
                  total: 0,
                  acceptanceRate: 0.0
                };
              }

              stats[dimension].total++;

              if (actionType === 'accepted' && userAction.rule_id === rule.rule_id) {
                stats[dimension].accepted++;
              } else if (actionType === 'dismissed' && userAction.rule_id === rule.rule_id) {
                stats[dimension].rejected++;
              } else if (actionType === 'modified' && userAction.rule_id === rule.rule_id) {
                stats[dimension].modified++;
              }
            });
          } catch (e) {
            // Skip malformed rows
          }
        });

        // Calculate rates
        Object.keys(stats).forEach(dimension => {
          const stat = stats[dimension];
          const totalActions = stat.accepted + stat.rejected + stat.modified;
          if (totalActions > 0) {
            stat.acceptanceRate = stat.accepted / totalActions;
          }
        });

        resolve(stats);
      });
    });
  }

  /**
   * Get few-shot examples for similar contexts
   * 
   * Parameters:
   * - snapshot: Current snapshot (for context matching)
   * - context: Current context (user_intent, component_type, etc.)
   * - limit: Max number of examples (default: 5)
   * 
   * Returns: {
   *   accepted: [{ rule_id, description, context }],
   *   rejected: [{ rule_id, description, context }]
   * }
   */
  async getFewShotExamples(snapshot, context, limit = 5) {
    return new Promise((resolve, reject) => {
      const userIntent = context?.user_intent;
      const componentType = snapshot?.metadata?.artifact_type || context?.component_type;
      const platform = context?.platform || 'figma';

      // Query recent preferences with similar context
      let query = `
        SELECT 
          user_action,
          suggested_rules,
          trace_context,
          metadata
        FROM preferences
        WHERE suggested_rules IS NOT NULL
      `;

      const params = [];

      // Filter by platform if available
      if (platform) {
        query += ` AND (trace_context LIKE ? OR metadata LIKE ?)`;
        params.push(`%"platform":"${platform}"%`, `%"platform_group":"${platform}"%`);
      }

      query += ` ORDER BY timestamp DESC LIMIT ?`;
      params.push(limit * 10); // Get more to filter

      this.db.all(query, params, (err, rows) => {
        if (err) {
          return reject(err);
        }

        const accepted = [];
        const rejected = [];

        rows.forEach(row => {
          try {
            const userAction = JSON.parse(row.user_action);
            const suggestedRules = JSON.parse(row.suggested_rules);
            const traceContext = JSON.parse(row.trace_context);
            const metadata = row.metadata ? JSON.parse(row.metadata) : {};

            const actionType = userAction.type || 'ignored';
            if (actionType === 'ignored') return;

            // Match context similarity
            const contextMatch = this._matchContext(traceContext, context, userIntent, componentType);
            if (contextMatch < 0.3) return; // Skip if context too different

            suggestedRules.forEach(rule => {
              const example = {
                rule_id: rule.rule_id,
                description: rule.description,
                dimension: rule.dimension || metadata.dimension_group,
                context: {
                  user_intent: traceContext.user_intent,
                  component_type: traceContext.component_type || componentType,
                  platform: traceContext.platform || platform
                },
                match_score: contextMatch
              };

              if (actionType === 'accepted' && userAction.rule_id === rule.rule_id) {
                if (accepted.length < limit) {
                  accepted.push(example);
                }
              } else if (actionType === 'dismissed' && userAction.rule_id === rule.rule_id) {
                if (rejected.length < limit) {
                  rejected.push(example);
                }
              }
            });
          } catch (e) {
            // Skip malformed rows
          }
        });

        resolve({ accepted, rejected });
      });
    });
  }

  /**
   * Match context similarity (0.0-1.0)
   */
  _matchContext(traceContext, currentContext, userIntent, componentType) {
    let score = 0.0;
    let factors = 0;

    // Match user intent
    if (userIntent && traceContext.user_intent) {
      const intentMatch = this._fuzzyMatch(userIntent.toLowerCase(), traceContext.user_intent.toLowerCase());
      score += intentMatch;
      factors++;
    }

    // Match component type
    if (componentType && traceContext.component_type) {
      if (componentType === traceContext.component_type) {
        score += 1.0;
      }
      factors++;
    }

    // Match platform
    if (currentContext?.platform && traceContext.platform) {
      if (currentContext.platform === traceContext.platform) {
        score += 0.5;
      }
      factors++;
    }

    return factors > 0 ? score / factors : 0.0;
  }

  /**
   * Simple fuzzy string matching (0.0-1.0)
   */
  _fuzzyMatch(str1, str2) {
    if (str1 === str2) return 1.0;
    if (str1.includes(str2) || str2.includes(str1)) return 0.7;
    
    // Simple word overlap
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    const overlap = words1.filter(w => words2.includes(w)).length;
    const total = Math.max(words1.length, words2.length);
    
    return total > 0 ? overlap / total : 0.0;
  }

  /**
   * Get structured preference output for export/analysis
   * 
   * Returns comprehensive preference statistics in structured format
   */
  async getStructuredOutput(options = {}) {
    const {
      includeRuleStats = true,
      includeDimensionStats = true,
      includeExamples = false,
      ruleIds = null,
      limit = 100
    } = options;

    const output = {
      timestamp: new Date().toISOString(),
      summary: {},
      rules: {},
      dimensions: {},
      examples: null
    };

    // Overall summary
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN json_extract(user_action, '$.type') = 'accepted' THEN 1 ELSE 0 END) as accepted,
          SUM(CASE WHEN json_extract(user_action, '$.type') = 'dismissed' THEN 1 ELSE 0 END) as rejected,
          SUM(CASE WHEN json_extract(user_action, '$.type') = 'modified' THEN 1 ELSE 0 END) as modified
        FROM preferences
        WHERE json_extract(user_action, '$.type') != 'ignored'
      `, [], async (err, row) => {
        if (err) {
          return reject(err);
        }

        output.summary = {
          total: row.total || 0,
          accepted: row.accepted || 0,
          rejected: row.rejected || 0,
          modified: row.modified || 0,
          acceptanceRate: row.total > 0 ? (row.accepted || 0) / row.total : 0.0
        };

        // Rule-level stats
        if (includeRuleStats) {
          if (ruleIds && ruleIds.length > 0) {
            output.rules = await this.getRuleStats(ruleIds);
          }
        }

        // Dimension-level stats
        if (includeDimensionStats) {
          output.dimensions = await this.getDimensionStats();
        }

        // Examples (if requested)
        if (includeExamples) {
          output.examples = await this.getFewShotExamples(null, null, limit);
        }

        resolve(output);
      });
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = PreferenceStatsService;



