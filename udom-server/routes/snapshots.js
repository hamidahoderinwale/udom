const express = require('express');
const router = express.Router();
const { enhanceSnapshots } = require('../enhance-intent');

function createSnapshotRoutes(jsonStorage, db) {
  // POST endpoint for storing snapshots
  router.post('/', async (req, res) => {
    const snapshot = req.body;

    if (!snapshot.metadata || !snapshot.metadata.snapshot_id) {
      return res.status(400).json({ error: 'Invalid snapshot format' });
    }

    try {
      const result = await jsonStorage.storeSnapshot(snapshot);
      res.json({ 
        success: true, 
        snapshot_id: snapshot.metadata.snapshot_id,
        filepath: result.filepath
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  // GET endpoint for querying snapshots
  router.get('/', async (req, res) => {
    const { artifact_id, artifact_type, timestamp_from, timestamp_to, limit } = req.query;

    try {
      const filters = {};
      if (artifact_id) filters.artifact_id = artifact_id;
      if (artifact_type) filters.artifact_type = artifact_type;
      if (timestamp_from) filters.timestamp_from = parseInt(timestamp_from);
      if (timestamp_to) filters.timestamp_to = parseInt(timestamp_to);
      if (limit) filters.limit = parseInt(limit) || 100;

      const snapshots = await jsonStorage.querySnapshots(filters);
      res.json(snapshots);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Get snapshot by ID
  router.get('/:snapshot_id', async (req, res) => {
    const { snapshot_id } = req.params;

    try {
      const snapshot = await jsonStorage.getSnapshot(snapshot_id);
      if (!snapshot) {
        return res.status(404).json({ error: 'Snapshot not found' });
      }
      res.json(snapshot);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Delete snapshot by ID
  router.delete('/:snapshot_id', async (req, res) => {
    const { snapshot_id } = req.params;

    try {
      const deleted = await jsonStorage.deleteSnapshot(snapshot_id);
      if (!deleted) {
        return res.status(404).json({ error: 'Snapshot not found' });
      }
      res.json({ success: true, deleted: snapshot_id });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Enhance intent for snapshots
  router.post('/enhance-intent', async (req, res) => {
    try {
      const { enhanceSnapshots } = require('../enhance-intent');
      const { useOpenRouter = false } = req.body;
      const apiKey = useOpenRouter ? process.env.OPENROUTER_APIKEY : null;
      const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
      
      await enhanceSnapshots({
        apiKey,
        model,
        useOpenRouter: useOpenRouter && !!apiKey,
      });
      
      res.json({ success: true, message: 'Intent enhancement completed' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = createSnapshotRoutes;

