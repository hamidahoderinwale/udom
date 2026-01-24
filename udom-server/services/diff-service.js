/**
 * Diff Service - Manages change tracking and diff storage
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DiffService {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '../../snapshots.db');
    this.db = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        this.db.serialize(() => {
          // Changes table
          this.db.run(`
            CREATE TABLE IF NOT EXISTS changes (
              change_id TEXT PRIMARY KEY,
              snapshot_id TEXT NOT NULL,
              previous_snapshot_id TEXT,
              artifact_id TEXT NOT NULL,
              element_id TEXT,
              stable_id TEXT,
              change_type TEXT NOT NULL,
              change_scope TEXT,
              property_name TEXT,
              property_path TEXT,
              old_value TEXT,
              new_value TEXT,
              timestamp INTEGER NOT NULL,
              action_id TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id)
            )
          `);

          // Indexes for efficient queries
          this.db.run(`CREATE INDEX IF NOT EXISTS idx_changes_snapshot_id ON changes(snapshot_id)`);
          this.db.run(`CREATE INDEX IF NOT EXISTS idx_changes_previous_snapshot_id ON changes(previous_snapshot_id)`);
          this.db.run(`CREATE INDEX IF NOT EXISTS idx_changes_artifact_id ON changes(artifact_id)`);
          this.db.run(`CREATE INDEX IF NOT EXISTS idx_changes_element_id ON changes(element_id)`);
          this.db.run(`CREATE INDEX IF NOT EXISTS idx_changes_action_id ON changes(action_id)`);
          this.db.run(`CREATE INDEX IF NOT EXISTS idx_changes_timestamp ON changes(timestamp)`, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    });
  }

  /**
   * Store diff changes
   */
  async storeChanges(diff, actionId = null) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO changes (
          change_id, snapshot_id, previous_snapshot_id, artifact_id,
          element_id, stable_id, change_type, change_scope, property_name,
          property_path, old_value, new_value, timestamp, action_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const changes = [];
      
      // Store element changes
      for (const elemChange of diff.element_changes || []) {
        if (elemChange.property_changes && elemChange.property_changes.length > 0) {
          // Store each property change separately
          for (const propChange of elemChange.property_changes) {
            const changeId = `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            changes.push({
              change_id: changeId,
              snapshot_id: diff.snapshot_id,
              previous_snapshot_id: diff.previous_snapshot_id,
              artifact_id: diff.artifact_id,
              element_id: elemChange.element_id,
              stable_id: elemChange.stable_id,
              change_type: elemChange.change_type,
              change_scope: 'property',
              property_name: propChange.property,
              property_path: propChange.path,
              old_value: JSON.stringify(propChange.old_value),
              new_value: JSON.stringify(propChange.new_value),
              timestamp: diff.timestamp,
              action_id: actionId,
            });
          }
        } else {
          // Store element-level change (added/removed)
          const changeId = `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          changes.push({
            change_id: changeId,
            snapshot_id: diff.snapshot_id,
            previous_snapshot_id: diff.previous_snapshot_id,
            artifact_id: diff.artifact_id,
            element_id: elemChange.element_id,
            stable_id: elemChange.stable_id,
            change_type: elemChange.change_type,
            change_scope: 'element',
            property_name: null,
            property_path: null,
            old_value: elemChange.change_type === 'removed' ? JSON.stringify(elemChange.element) : null,
            new_value: elemChange.change_type === 'added' ? JSON.stringify(elemChange.element) : null,
            timestamp: diff.timestamp,
            action_id: actionId,
          });
        }
      }

      // Store composition rule changes
      if (diff.composition_rule_changes) {
        for (const ruleChange of diff.composition_rule_changes) {
          const changeId = `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          changes.push({
            change_id: changeId,
            snapshot_id: diff.snapshot_id,
            previous_snapshot_id: diff.previous_snapshot_id,
            artifact_id: diff.artifact_id,
            element_id: null,
            stable_id: null,
            change_type: 'modified',
            change_scope: 'composition_rule',
            property_name: ruleChange.property,
            property_path: ruleChange.path,
            old_value: JSON.stringify(ruleChange.old_value),
            new_value: JSON.stringify(ruleChange.new_value),
            timestamp: diff.timestamp,
            action_id: actionId,
          });
        }
      }

      // Insert all changes
      let completed = 0;
      const total = changes.length;
      
      if (total === 0) {
        resolve([]);
        return;
      }

      changes.forEach(change => {
        stmt.run(
          change.change_id,
          change.snapshot_id,
          change.previous_snapshot_id,
          change.artifact_id,
          change.element_id,
          change.stable_id,
          change.change_type,
          change.change_scope,
          change.property_name,
          change.property_path,
          change.old_value,
          change.new_value,
          change.timestamp,
          change.action_id,
          (err) => {
            if (err) {
              reject(err);
              return;
            }
            completed++;
            if (completed === total) {
              stmt.finalize();
              resolve(changes);
            }
          }
        );
      });
    });
  }

  /**
   * Get changes for a snapshot
   */
  async getChangesForSnapshot(snapshotId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM changes WHERE snapshot_id = ? ORDER BY timestamp ASC`,
        [snapshotId],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows.map(row => ({
            ...row,
            old_value: row.old_value ? JSON.parse(row.old_value) : null,
            new_value: row.new_value ? JSON.parse(row.new_value) : null,
          })));
        }
      );
    });
  }

  /**
   * Get diff between two snapshots
   */
  async getDiffBetweenSnapshots(snapshotId1, snapshotId2) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM changes 
         WHERE (snapshot_id = ? AND previous_snapshot_id = ?)
         OR (snapshot_id = ? AND previous_snapshot_id = ?)
         ORDER BY timestamp ASC`,
        [snapshotId2, snapshotId1, snapshotId1, snapshotId2],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows.map(row => ({
            ...row,
            old_value: row.old_value ? JSON.parse(row.old_value) : null,
            new_value: row.new_value ? JSON.parse(row.new_value) : null,
          })));
        }
      );
    });
  }

  /**
   * Get changes caused by an action
   */
  async getChangesForAction(actionId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM changes WHERE action_id = ? ORDER BY timestamp ASC`,
        [actionId],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows.map(row => ({
            ...row,
            old_value: row.old_value ? JSON.parse(row.old_value) : null,
            new_value: row.new_value ? JSON.parse(row.new_value) : null,
          })));
        }
      );
    });
  }

  /**
   * Get changes for an artifact within a time window
   */
  async getChangesForArtifact(artifactId, timestampFrom = null, timestampTo = null) {
    return new Promise((resolve, reject) => {
      let query = `SELECT * FROM changes WHERE artifact_id = ?`;
      const params = [artifactId];

      if (timestampFrom) {
        query += ` AND timestamp >= ?`;
        params.push(timestampFrom);
      }
      if (timestampTo) {
        query += ` AND timestamp <= ?`;
        params.push(timestampTo);
      }

      query += ` ORDER BY timestamp ASC`;

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows.map(row => ({
          ...row,
          old_value: row.old_value ? JSON.parse(row.old_value) : null,
          new_value: row.new_value ? JSON.parse(row.new_value) : null,
        })));
      });
    });
  }
}

module.exports = DiffService;
