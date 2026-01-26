const express = require('express');
const router = express.Router();

function createDiffRoutes(diffService) {
  // Store changes (diff data)
  router.post('/changes', async (req, res) => {
    try {
      const { diff, action_id } = req.body;
      await diffService.storeChanges(diff, action_id || null);
      res.json({ success: true, changes_stored: diff.summary.total_property_changes + diff.summary.added_count + diff.summary.removed_count });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get changes for a snapshot
  router.get('/snapshots/:id/changes', async (req, res) => {
    try {
      const changes = await diffService.getChangesForSnapshot(req.params.id);
      res.json({ changes });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get diff between two snapshots
  router.get('/snapshots/:id1/diff/:id2', async (req, res) => {
    try {
      const changes = await diffService.getDiffBetweenSnapshots(req.params.id1, req.params.id2);
      res.json({ changes });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get changes for an artifact
  router.get('/artifacts/:artifact_id/changes', async (req, res) => {
    try {
      const { artifact_id } = req.params;
      const timestampFrom = req.query.timestamp_from ? parseInt(req.query.timestamp_from) : null;
      const timestampTo = req.query.timestamp_to ? parseInt(req.query.timestamp_to) : null;
      
      const changes = await diffService.getChangesForArtifact(artifact_id, timestampFrom, timestampTo);
      res.json({ changes });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = createDiffRoutes;


