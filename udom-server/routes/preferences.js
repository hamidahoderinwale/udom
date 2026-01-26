const express = require('express');
const router = express.Router();
const PreferenceStatsService = require('../services/preference-stats-service');
const path = require('path');

function createPreferenceRoutes(db, dbPath) {
  // POST endpoint for preferences
  router.post('/', (req, res) => {
    const preference = req.body;
    
    db.run(`
      CREATE TABLE IF NOT EXISTS preferences (
        event_id TEXT PRIMARY KEY,
        timestamp INTEGER,
        session_id TEXT,
        snapshot_id TEXT,
        artifact_id TEXT,
        source TEXT,
        type TEXT,
        user_action TEXT,
        suggested_rules TEXT,
        trace_context TEXT,
        extensions TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, () => {
      // Ignore error if table already exists
    });
    
    // Migrate existing table if columns don't exist
    db.run(`ALTER TABLE preferences ADD COLUMN source TEXT`, () => {});
    db.run(`ALTER TABLE preferences ADD COLUMN type TEXT`, () => {});
    db.run(`ALTER TABLE preferences ADD COLUMN extensions TEXT`, () => {});
    db.run(`ALTER TABLE preferences ADD COLUMN metadata TEXT`, () => {});
    db.run(`UPDATE preferences SET source = 'user_feedback' WHERE source IS NULL`, () => {});
    
    db.run(
      'INSERT INTO preferences (event_id, timestamp, session_id, snapshot_id, artifact_id, source, type, user_action, suggested_rules, trace_context, extensions, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        preference.event_id,
        preference.timestamp,
        preference.session_id,
        preference.snapshot_id,
        preference.artifact_id,
        preference.source || 'user_feedback',
        preference.type || null,
        JSON.stringify(preference.user_action),
        JSON.stringify(preference.suggested_rules),
        JSON.stringify(preference.trace_context),
        preference.extensions ? JSON.stringify(preference.extensions) : null,
        preference.metadata ? JSON.stringify(preference.metadata) : null,
      ],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, event_id: preference.event_id });
      }
    );
  });

  // GET endpoint for preferences
  router.get('/', (req, res) => {
    const { snapshot_id, artifact_id, session_id, limit } = req.query;
    
    db.run(`
      CREATE TABLE IF NOT EXISTS preferences (
        event_id TEXT PRIMARY KEY,
        timestamp INTEGER,
        session_id TEXT,
        snapshot_id TEXT,
        artifact_id TEXT,
        source TEXT,
        type TEXT,
        user_action TEXT,
        suggested_rules TEXT,
        trace_context TEXT,
        extensions TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, () => {
      let query = 'SELECT * FROM preferences WHERE 1=1';
      const params = [];

      if (snapshot_id) {
        query += ' AND snapshot_id = ?';
        params.push(snapshot_id);
      }

      if (artifact_id) {
        query += ' AND artifact_id = ?';
        params.push(artifact_id);
      }

      if (session_id) {
        query += ' AND session_id = ?';
        params.push(session_id);
      }

      query += ' ORDER BY timestamp DESC';
      if (limit) {
        query += ` LIMIT ${parseInt(limit)}`;
      }

      db.all(query, params, (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        const preferences = rows.map(row => {
          const pref = {
            event_id: row.event_id,
            timestamp: row.timestamp,
            session_id: row.session_id,
            snapshot_id: row.snapshot_id,
            artifact_id: row.artifact_id,
            source: row.source || 'user_feedback',
            type: row.type || null,
            user_action: JSON.parse(row.user_action),
            suggested_rules: JSON.parse(row.suggested_rules),
            trace_context: JSON.parse(row.trace_context),
            created_at: row.created_at,
          };
          
          if (row.extensions) {
            pref.extensions = JSON.parse(row.extensions);
          }
          
          if (row.metadata) {
            pref.metadata = JSON.parse(row.metadata);
          }
          
          return pref;
        });
        
        res.json(preferences);
      });
    });
  });

  // GET preferences for a specific snapshot
  router.get('/snapshots/:snapshot_id/preferences', (req, res) => {
    const { snapshot_id } = req.params;
    
    db.all(
      'SELECT * FROM preferences WHERE snapshot_id = ? ORDER BY timestamp DESC',
      [snapshot_id],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        const preferences = rows.map(row => {
          const pref = {
            event_id: row.event_id,
            timestamp: row.timestamp,
            session_id: row.session_id,
            snapshot_id: row.snapshot_id,
            artifact_id: row.artifact_id,
            source: row.source || 'user_feedback',
            type: row.type || null,
            user_action: JSON.parse(row.user_action),
            suggested_rules: JSON.parse(row.suggested_rules),
            trace_context: JSON.parse(row.trace_context),
            created_at: row.created_at,
          };
          
          if (row.extensions) {
            pref.extensions = JSON.parse(row.extensions);
          }
          
          if (row.metadata) {
            pref.metadata = JSON.parse(row.metadata);
          }
          
          return pref;
        });
        
        res.json(preferences);
      }
    );
  });

  // GET preference statistics
  router.get('/stats', (req, res) => {
    db.all(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN json_extract(user_action, '$.type') = 'accepted' THEN 1 ELSE 0 END) as accepted,
        SUM(CASE WHEN json_extract(user_action, '$.type') = 'dismissed' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN json_extract(user_action, '$.type') = 'modified' THEN 1 ELSE 0 END) as modified,
        COUNT(DISTINCT snapshot_id) as unique_snapshots,
        COUNT(DISTINCT artifact_id) as unique_artifacts,
        COUNT(DISTINCT session_id) as unique_sessions
      FROM preferences
      WHERE json_extract(user_action, '$.type') != 'ignored'
    `, (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json(row[0] || {
        total: 0,
        accepted: 0,
        rejected: 0,
        modified: 0,
        unique_snapshots: 0,
        unique_artifacts: 0,
        unique_sessions: 0,
      });
    });
  });

  // GET preference statistics for specific rules
  router.get('/stats/rules', (req, res) => {
    const ruleIds = req.query.rule_ids ? req.query.rule_ids.split(',') : [];
    
    const preferenceStats = new PreferenceStatsService(dbPath);
    preferenceStats.getRuleStats(ruleIds)
      .then(stats => {
        res.json(stats);
        preferenceStats.close();
      })
      .catch(err => {
        res.status(500).json({ error: err.message });
        preferenceStats.close();
      });
  });

  // GET dimension-level preference statistics
  router.get('/stats/dimensions', (req, res) => {
    const preferenceStats = new PreferenceStatsService(dbPath);
    preferenceStats.getDimensionStats()
      .then(stats => {
        res.json(stats);
        preferenceStats.close();
      })
      .catch(err => {
        res.status(500).json({ error: err.message });
        preferenceStats.close();
      });
  });

  // GET preference examples
  router.get('/examples', async (req, res) => {
    try {
      const { limit = 10, type } = req.query;
      
      let query = 'SELECT * FROM preferences WHERE 1=1';
      const params = [];
      
      if (type) {
        query += ' AND json_extract(user_action, "$.type") = ?';
        params.push(type);
      }
      
      query += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(parseInt(limit));
      
      db.all(query, params, (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        const examples = rows.map(row => ({
          event_id: row.event_id,
          snapshot_id: row.snapshot_id,
          artifact_id: row.artifact_id,
          user_action: JSON.parse(row.user_action),
          suggested_rules: JSON.parse(row.suggested_rules),
          timestamp: row.timestamp,
        }));
        
        res.json(examples);
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET structured preferences
  router.get('/structured', (req, res) => {
    const { snapshot_id, artifact_id } = req.query;
    
    let query = 'SELECT * FROM preferences WHERE 1=1';
    const params = [];
    
    if (snapshot_id) {
      query += ' AND snapshot_id = ?';
      params.push(snapshot_id);
    }
    
    if (artifact_id) {
      query += ' AND artifact_id = ?';
      params.push(artifact_id);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    db.all(query, params, (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      const structured = rows.map(row => ({
        preference_id: row.event_id,
        snapshot_id: row.snapshot_id,
        artifact_id: row.artifact_id,
        action: JSON.parse(row.user_action),
        rules: JSON.parse(row.suggested_rules),
        context: JSON.parse(row.trace_context),
        timestamp: row.timestamp,
      }));
      
      res.json(structured);
    });
  });

  return router;
}

module.exports = createPreferenceRoutes;


