/**
 * Server-side recommendation service
 * Generates intent rule recommendations using OpenRouter API
 */

// Use built-in fetch (Node 18+) or require node-fetch for older versions
const fetch = globalThis.fetch || require('node-fetch');
const SyntheticRecommendationGenerator = require('./synthetic-generator');
const PreferenceStatsService = require('../preference-stats-service');

class RecommendationService {
  constructor(apiKey, model = 'anthropic/claude-3.5-sonnet', dbPath = null) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    this.cache = new Map(); // content_hash -> recommendations
    this.jobs = new Map(); // job_id -> { status, result, error }
    this.syntheticGenerator = new SyntheticRecommendationGenerator();
    this.preferenceStats = new PreferenceStatsService(dbPath);
  }

  /**
   * Generate recommendations for a snapshot
   * Returns immediately for synthetic, async job_id for LLM-based
   */
  async generateRecommendations(snapshot, previousSnapshot = null, context = {}) {
    const contentHash = snapshot.metadata.content_hash;
    const cacheKey = `${contentHash}_${previousSnapshot ? previousSnapshot.metadata.content_hash : 'none'}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      return {
        job_id: `cache_${Date.now()}`,
        status: 'completed',
        recommendations: cached,
        cached: true
      };
    }

    const userIntent = context.user_intent;
    const hasApiKey = this.apiKey && this.apiKey !== 'dummy';
    
    // Fast path: Synthetic recommendations only (no API key or no user intent)
    // Return immediately without async job
    if (!hasApiKey || !userIntent) {
      try {
        const syntheticRecs = this.syntheticGenerator.generateRecommendations(
          snapshot, 
          previousSnapshot, 
          context
        );
        
        // Apply lightweight preference ranking (non-blocking)
        const rankedRecs = await this.applyPreferenceRankingFast(syntheticRecs)
          .catch(() => syntheticRecs); // Fallback to unranked if ranking fails
        
        const finalRecs = rankedRecs.map(({ priority, preference_score, ...rest }) => rest);
        
        // Cache results
        this.cache.set(cacheKey, finalRecs);
        
        return {
          job_id: `synthetic_${Date.now()}`,
          status: 'completed',
          recommendations: finalRecs,
          cached: false,
          source: 'synthetic'
        };
      } catch (error) {
        // If synthetic fails, fall back to async job
      }
    }

    // Slow path: LLM-based recommendations (requires API call)
    // Create async job
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.jobs.set(jobId, { status: 'processing', result: null, error: null });

    // Process asynchronously
    this.processRecommendationJob(jobId, snapshot, previousSnapshot, context, cacheKey)
      .catch(err => {
        const job = this.jobs.get(jobId);
        if (job) {
          job.status = 'failed';
          job.error = err.message;
        }
      });

    return { job_id: jobId, status: 'processing' };
  }

  async processRecommendationJob(jobId, snapshot, previousSnapshot, context, cacheKey) {
    try {
      const userIntent = context.user_intent;
      const hasApiKey = this.apiKey && this.apiKey !== 'dummy';
      let recommendations = [];
      
      // Always generate synthetic recommendations first (fast, no API needed)
      const syntheticRecs = this.syntheticGenerator.generateRecommendations(
        snapshot, 
        previousSnapshot, 
        context
      );
      
      // If user provided intent and API key, enhance with LLM-based recommendations
      if (userIntent && hasApiKey) {
        try {
          // Skip few-shot examples for faster response (can be enabled later)
          const matcherInput = await this.buildMatcherInput(snapshot, previousSnapshot, {
            ...context,
            skip_examples: true // Skip slow DB queries for examples
          });
          const llmRecs = await this.callOpenRouter(matcherInput);
          
          // Combine synthetic + LLM recommendations
          // LLM recommendations get higher priority
          recommendations = [
            ...llmRecs.map(r => ({ ...r, source: 'llm', priority: 1 })),
            ...syntheticRecs.map(r => ({ ...r, source: 'synthetic', priority: 0 }))
          ];
        } catch (error) {
          // If LLM fails, fall back to synthetic only
          recommendations = syntheticRecs.map(r => ({ ...r, source: 'synthetic', priority: 0 }));
        }
      } else {
        // No user intent or no API key - use synthetic only
        recommendations = syntheticRecs.map(r => ({ ...r, source: 'synthetic', priority: 0 }));
      }
      
      // Apply preference-based ranking (with timeout protection)
      const rankedRecs = await Promise.race([
        this.applyPreferenceRanking(recommendations),
        new Promise(resolve => setTimeout(() => resolve(recommendations), 2000)) // 2s timeout
      ]);
      
      // Sort by priority, then preference-adjusted match_score
      rankedRecs.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return (b.preference_score || b.match_score || b.confidence) - 
               (a.preference_score || a.match_score || a.confidence);
      });
      
      // Remove internal fields before caching
      const finalRecs = rankedRecs.map(({ priority, preference_score, ...rest }) => rest);

      // Cache results
      this.cache.set(cacheKey, finalRecs);

      // Update job status
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'completed';
        job.result = finalRecs;
      }
    } catch (error) {
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
      }
      throw error;
    }
  }

  async buildMatcherInput(snapshot, previousSnapshot, context) {
    // Get few-shot examples (Option 2) - skip if requested for performance
    let examples = { accepted: [], rejected: [] };
    if (!context.skip_examples && this.preferenceStats) {
      examples = await this.preferenceStats.getFewShotExamples(
        snapshot, 
        context, 
        3 // Get 3 accepted + 3 rejected examples
      ).catch(() => ({ accepted: [], rejected: [] }));
    }

    return {
      trace: {
        recent_actions: context.recent_actions || [],
        current_state: context.current_state || {}
      },
      artifacts: {
        before: previousSnapshot || snapshot,
        after: snapshot
      },
      platform_semantics: {
        platform: 'figma',
        artifact_type: snapshot.metadata.artifact_type
      },
      matching_config: {
        max_rules: 3,
        min_confidence: 0.5,
        require_platform_match: true
      },
      // Include few-shot examples for LLM learning
      examples: {
        accepted: examples.accepted.map(e => ({
          rule_id: e.rule_id,
          description: e.description,
          dimension: e.dimension
        })),
        rejected: examples.rejected.map(e => ({
          rule_id: e.rule_id,
          description: e.description,
          dimension: e.dimension
        }))
      }
    };
  }

  async callOpenRouter(input) {
    // Build system prompt with few-shot examples (Option 2)
    let systemPrompt = `You are an intent rule matcher. Your role is to identify which intent rules from a knowledge base match a given action trace and artifact snapshot.

Analyze the provided trace and artifacts, then return matching intent rules in JSON format:
{
  "matched_rules": [
    {
      "rule_id": "string",
      "description": "string",
      "confidence": 0.0-1.0,
      "scope": "component|page|design_system",
      "match_score": 0.0-1.0
    }
  ]
}`;

    // Add few-shot examples to prompt if available
    if (input.examples && (input.examples.accepted.length > 0 || input.examples.rejected.length > 0)) {
      systemPrompt += `\n\n## Examples of Good Suggestions (Accepted by Users):\n`;
      input.examples.accepted.forEach(ex => {
        systemPrompt += `- ${ex.description} (dimension: ${ex.dimension || 'unknown'})\n`;
      });
      
      systemPrompt += `\n## Examples of Bad Suggestions (Rejected by Users):\n`;
      input.examples.rejected.forEach(ex => {
        systemPrompt += `- ${ex.description} (dimension: ${ex.dimension || 'unknown'})\n`;
      });
      
      systemPrompt += `\nPrefer suggesting rules similar to accepted examples. Avoid patterns similar to rejected examples.`;
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/Taste-AI/hamidah-project',
        'X-Title': 'Taste Intent Rule System',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(input, null, 2) }
        ],
        temperature: 0.3,
        max_tokens: 2048,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);
    
    return (content.matched_rules || []).map(rule => ({
      rule_id: rule.rule_id,
      description: rule.description,
      confidence: rule.confidence || 0.5,
      scope: rule.scope || 'component',
      match_score: rule.match_score || rule.confidence || 0.5
    }));
  }

  /**
   * Fast preference ranking (non-blocking, uses cached stats if available)
   */
  async applyPreferenceRankingFast(recommendations) {
    if (!recommendations || recommendations.length === 0) {
      return recommendations;
    }

    // Return immediately if no preference stats service
    if (!this.preferenceStats) {
      return recommendations;
    }

    // Try to get stats with timeout (500ms max)
    const ruleIds = recommendations.map(r => r.rule_id).filter(Boolean);
    if (ruleIds.length === 0) {
      return recommendations;
    }

    try {
      const statsPromise = Promise.all([
        this.preferenceStats.getRuleStats(ruleIds).catch(() => ({})),
        this.preferenceStats.getDimensionStats().catch(() => ({}))
      ]);

      // Race with timeout
      const timeoutPromise = new Promise((resolve) => 
        setTimeout(() => resolve([{}, {}]), 500)
      );

      const [ruleStats, dimensionStats] = await Promise.race([
        statsPromise,
        timeoutPromise
      ]);

      // Apply preference-based scoring
      return recommendations.map(rec => {
        const baseScore = rec.match_score || rec.confidence || 0.5;
        let preferenceScore = baseScore;

        const stats = ruleStats[rec.rule_id];
        if (stats && stats.total > 0) {
          const multiplier = 0.5 + (stats.acceptanceRate * 1.0);
          preferenceScore = baseScore * multiplier;
        }

        const dimension = rec.dimension;
        if (dimension && dimensionStats[dimension]) {
          const dimStats = dimensionStats[dimension];
          if (dimStats.acceptanceRate > 0.6) {
            preferenceScore *= 1.1;
          } else if (dimStats.acceptanceRate < 0.3) {
            preferenceScore *= 0.9;
          }
        }

        preferenceScore = Math.min(1.0, preferenceScore);

        return {
          ...rec,
          preference_score: preferenceScore,
          original_match_score: baseScore
        };
      });
    } catch (error) {
      // Return unranked if ranking fails
      return recommendations;
    }
  }

  /**
   * Apply preference-based ranking to recommendations (Option 1)
   * 
   * Boosts rules with high acceptance rates, demotes rules with low acceptance rates
   * Full version with no timeout (for async jobs)
   */
  async applyPreferenceRanking(recommendations) {
    if (!recommendations || recommendations.length === 0) {
      return recommendations;
    }

    // Get rule IDs from recommendations
    const ruleIds = recommendations
      .map(r => r.rule_id)
      .filter(Boolean);

    if (ruleIds.length === 0) {
      return recommendations;
    }

    // Get preference statistics
    const ruleStats = await this.preferenceStats.getRuleStats(ruleIds)
      .catch(() => ({}));

    // Get dimension statistics
    const dimensionStats = await this.preferenceStats.getDimensionStats()
      .catch(() => ({}));

    // Apply preference-based scoring
    return recommendations.map(rec => {
      const baseScore = rec.match_score || rec.confidence || 0.5;
      let preferenceScore = baseScore;

      // Rule-level preference boost/demote
      const stats = ruleStats[rec.rule_id];
      if (stats && stats.total > 0) {
        // Acceptance rate multiplier: 0.5x to 1.5x
        // Rules with 100% acceptance get 1.5x boost
        // Rules with 0% acceptance get 0.5x demote
        const multiplier = 0.5 + (stats.acceptanceRate * 1.0);
        preferenceScore = baseScore * multiplier;
      }

      // Dimension-level preference boost
      const dimension = rec.dimension;
      if (dimension && dimensionStats[dimension]) {
        const dimStats = dimensionStats[dimension];
        if (dimStats.acceptanceRate > 0.6) {
          // Boost if dimension has high acceptance rate
          preferenceScore *= 1.1;
        } else if (dimStats.acceptanceRate < 0.3) {
          // Demote if dimension has low acceptance rate
          preferenceScore *= 0.9;
        }
      }

      // Cap at 1.0
      preferenceScore = Math.min(1.0, preferenceScore);

      return {
        ...rec,
        preference_score: preferenceScore,
        // Keep original score for reference
        original_match_score: baseScore
      };
    });
  }

  getJobStatus(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }

    return {
      job_id: jobId,
      status: job.status,
      recommendations: job.result,
      error: job.error
    };
  }

  getCachedRecommendations(snapshotId, snapshots) {
    const snapshot = snapshots.find(s => s.metadata.snapshot_id === snapshotId);
    if (!snapshot) return null;

    const contentHash = snapshot.metadata.content_hash;
    for (const [key, recommendations] of this.cache.entries()) {
      if (key.startsWith(contentHash)) {
        return recommendations;
      }
    }
    return null;
  }
}

module.exports = RecommendationService;

