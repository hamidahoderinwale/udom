const express = require('express');
const router = express.Router();

function createRecommendationRoutes(jsonStorage, recommendationService) {
  // Generate recommendations for a snapshot
  router.post('/snapshots/:id/recommendations/generate', async (req, res) => {
    try {
      const snapshotId = req.params.id;
      const snapshot = await jsonStorage.getSnapshot(snapshotId);
      
      if (!snapshot) {
        return res.status(404).json({ error: 'Snapshot not found' });
      }

      const snapshots = await jsonStorage.querySnapshots({
        artifact_id: snapshot.metadata.artifact_id,
        timestamp_to: snapshot.metadata.timestamp - 1,
        limit: 1
      });
      const previousSnapshot = snapshots.length > 0 ? snapshots[0] : null;

      const context = req.body.context || {};
      const result = await recommendationService.generateRecommendations(snapshot, previousSnapshot, context);
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get recommendation job status
  router.get('/jobs/:job_id', (req, res) => {
    const jobId = req.params.job_id;
    const status = recommendationService.getJobStatus(jobId);
    
    if (!status) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(status);
  });

  // Get cached recommendations for a snapshot
  router.get('/snapshots/:id/recommendations', async (req, res) => {
    if (!recommendationService) {
      return res.status(503).json({ error: 'Recommendation service not available' });
    }

    try {
      const snapshotId = req.params.id;
      const allSnapshots = await jsonStorage.querySnapshots({});
      const cached = recommendationService.getCachedRecommendations(snapshotId, allSnapshots);
      
      if (cached) {
        return res.json({ recommendations: cached, cached: true });
      }

      res.json({ recommendations: [], cached: false });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = createRecommendationRoutes;


