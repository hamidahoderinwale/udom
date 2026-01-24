const sqlite3 = require('sqlite3').verbose();
const path = require('path');

function initializeDatabase(dbPath) {
  const db = new sqlite3.Database(dbPath);

  db.serialize(() => {
    // Snapshots table
    db.run(`
      CREATE TABLE IF NOT EXISTS snapshots (
        snapshot_id TEXT PRIMARY KEY,
        artifact_id TEXT,
        artifact_type TEXT,
        category TEXT,
        capture_context TEXT,
        timestamp INTEGER,
        blob_ref TEXT,
        udom_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Migrate existing table if needed (add new columns)
    db.run(`
      ALTER TABLE snapshots ADD COLUMN category TEXT
    `, () => {
      // Ignore error if column already exists
    });
    
    db.run(`
      ALTER TABLE snapshots ADD COLUMN blob_ref TEXT
    `, () => {
      // Ignore error if column already exists
    });

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_artifact_id ON snapshots(artifact_id)
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_artifact_type ON snapshots(artifact_type)
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON snapshots(timestamp)
    `);
    
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_category ON snapshots(category)
    `);

    // Relations table for derivation chains
    db.run(`
      CREATE TABLE IF NOT EXISTS relations (
        relation_id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        from_snapshot TEXT NOT NULL,
        to_snapshot TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_snapshot) REFERENCES snapshots(snapshot_id),
        FOREIGN KEY (to_snapshot) REFERENCES snapshots(snapshot_id)
      )
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_snapshot)
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_snapshot)
    `);

    // Preferences table
    db.run(`
      CREATE TABLE IF NOT EXISTS preferences (
        preference_id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        user_action TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id)
      )
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_preferences_snapshot ON preferences(snapshot_id)
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_preferences_timestamp ON preferences(timestamp)
    `);

    // Contributors table
    db.run(`
      CREATE TABLE IF NOT EXISTS contributors (
        contributor_id TEXT PRIMARY KEY,
        display_name TEXT,
        affiliation TEXT,
        role TEXT,
        organization_type TEXT,
        share_snapshots BOOLEAN DEFAULT 1,
        share_demographics BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_contributors_org_type ON contributors(organization_type)
    `);
  });

  return db;
}

module.exports = { initializeDatabase };

