const express = require('express');
const router = express.Router();

function createHealthRoutes(jsonStorage) {
  // Health check
  router.get('/health', async (req, res) => {
    try {
      const stats = jsonStorage.getStats();
      res.json({ 
        status: 'ok', 
        timestamp: Date.now(),
        storage: 'json_files',
        stats: stats
      });
    } catch (error) {
      res.json({ status: 'ok', timestamp: Date.now(), storage: 'json_files', error: error.message });
    }
  });

  // API Config endpoint - returns OpenRouter config from environment
  router.get('/api/config', (req, res) => {
    const apiKey = process.env.OPENROUTER_APIKEY || '';
    const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
    
    res.json({
      openrouter: {
        apiKey: apiKey,
        model: model,
        configured: !!apiKey
      },
      preferenceStorageUrl: 'http://localhost:3000',
      promptsUrl: 'http://localhost:3000/api/prompts'
    });
  });

  // Get storage statistics
  router.get('/stats', async (req, res) => {
    try {
      const stats = jsonStorage.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = createHealthRoutes;

