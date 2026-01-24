/**
 * JSON file-based storage for uDOM snapshots
 * Stores snapshots in organized directory structure: snapshots/YYYY/MM/DD/snapshot_id.json
 */

const fs = require('fs').promises;
const path = require('path');

class JsonStorage {
  constructor() {
    this.baseDir = path.join(__dirname, 'snapshots');
    this.indexFile = path.join(this.baseDir, '_index.json');
    this.index = { snapshots: {}, last_updated: null };
  }

  async initialize() {
    try {
      // Ensure base directory exists
      await fs.mkdir(this.baseDir, { recursive: true });
      
      // Load index if it exists
      try {
        const indexData = await fs.readFile(this.indexFile, 'utf8');
        this.index = JSON.parse(indexData);
      } catch (error) {
        // Index doesn't exist yet, start fresh
        this.index = { snapshots: {}, last_updated: null };
      }
    } catch (error) {
      throw error;
    }
  }

  async storeSnapshot(snapshot) {
    const snapshotId = snapshot.metadata.snapshot_id;
    const timestamp = snapshot.metadata.timestamp || Date.now();
    const date = new Date(timestamp);
    
    // Create directory structure: snapshots/YYYY/MM/DD/
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dirPath = path.join(this.baseDir, String(year), month, day);
    
    await fs.mkdir(dirPath, { recursive: true });
    
    // Write snapshot file
    const filePath = path.join(dirPath, `${snapshotId}.json`);
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
    
    // Update index
    this.index.snapshots[snapshotId] = {
      snapshot_id: snapshotId,
      artifact_id: snapshot.metadata.artifact_id,
      artifact_type: snapshot.metadata.artifact_type,
      timestamp: timestamp,
      filepath: filePath,
      date_path: `${year}/${month}/${day}`
    };
    this.index.last_updated = Date.now();
    
    // Save index
    await this.saveIndex();
    
    return { filepath: filePath, snapshot_id: snapshotId };
  }

  async getSnapshot(snapshotId) {
    // Check index first
    const entry = this.index.snapshots[snapshotId];
    if (entry && entry.filepath) {
      try {
        const data = await fs.readFile(entry.filepath, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        // File might have been moved, try to find it
      }
    }
    
    // Fallback: search in directory structure
    const files = await this.findAllSnapshotFiles();
    for (const filePath of files) {
      if (path.basename(filePath, '.json') === snapshotId) {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
      }
    }
    
    return null;
  }

  async querySnapshots(filters = {}) {
    const {
      artifact_id,
      artifact_type,
      timestamp_from,
      timestamp_to,
      limit = 100
    } = filters;
    
    const snapshots = [];
    const files = await this.findAllSnapshotFiles();
    
    for (const filePath of files) {
      try {
        const data = await fs.readFile(filePath, 'utf8');
        const snapshot = JSON.parse(data);
        const metadata = snapshot.metadata || {};
        
        // Apply filters
        if (artifact_id && metadata.artifact_id !== artifact_id) continue;
        if (artifact_type && metadata.artifact_type !== artifact_type) continue;
        if (timestamp_from && metadata.timestamp < timestamp_from) continue;
        if (timestamp_to && metadata.timestamp > timestamp_to) continue;
        
        snapshots.push(snapshot);
        
        if (snapshots.length >= limit) break;
      } catch (error) {
        // Skip invalid files
        continue;
      }
    }
    
    // Sort by timestamp descending
    snapshots.sort((a, b) => {
      const tsA = a.metadata?.timestamp || 0;
      const tsB = b.metadata?.timestamp || 0;
      return tsB - tsA;
    });
    
    return snapshots;
  }

  async deleteSnapshot(snapshotId) {
    const entry = this.index.snapshots[snapshotId];
    if (entry && entry.filepath) {
      try {
        await fs.unlink(entry.filepath);
        delete this.index.snapshots[snapshotId];
        await this.saveIndex();
        return true;
      } catch (error) {
        return false;
      }
    }
    return false;
  }

  getStats() {
    const snapshots = Object.values(this.index.snapshots);
    const byType = {};
    
    snapshots.forEach(entry => {
      const type = entry.artifact_type || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
    });
    
    const timestamps = snapshots.map(s => s.timestamp).filter(Boolean);
    const lastUpdated = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;
    
    return {
      total_snapshots: snapshots.length,
      by_type: byType,
      storage_dir: this.baseDir,
      last_updated: lastUpdated
    };
  }

  async findAllSnapshotFiles() {
    const files = [];
    
    async function traverseDir(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await traverseDir(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== '_index.json') {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }
    
    await traverseDir(this.baseDir);
    return files;
  }

  async saveIndex() {
    try {
      await fs.writeFile(this.indexFile, JSON.stringify(this.index, null, 2), 'utf8');
    } catch (error) {
      // Silent fail - index save errors are non-critical
    }
  }
}

module.exports = JsonStorage;
