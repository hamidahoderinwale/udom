const express = require('express');
const cors = require('cors');
const path = require('path');
const JsonStorage = require('./json-storage');
const RecommendationService = require('./services/recommendations/recommendation-service');
const DiffService = require('./services/diff-service');
const { initializeDatabase } = require('./db/setup');

// Route modules
const createHealthRoutes = require('./routes/health');
const createSnapshotRoutes = require('./routes/snapshots');
const createPreferenceRoutes = require('./routes/preferences');
const createRecommendationRoutes = require('./routes/recommendations');
const createDiffRoutes = require('./routes/diff');
const createPromptRoutes = require('./routes/prompts');
const createRelationRoutes = require('./routes/relations');
const createViewerRoutes = require('./routes/viewer');

const app = express();
app.use(express.json());
app.use(cors());

// Serve static files from public directory
app.use('/public', express.static(path.join(__dirname, 'public')));

// Storage setup - use JSON file storage
const jsonStorage = new JsonStorage();
jsonStorage.initialize().catch(() => {});

// SQLite setup (kept for backward compatibility / migration)
const dbPath = path.join(__dirname, 'snapshots.db');
const db = initializeDatabase(dbPath);

// Recommendation service setup
const openRouterApiKey = process.env.OPENROUTER_APIKEY || '';
const openRouterModel = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
const recommendationService = new RecommendationService(openRouterApiKey || 'dummy', openRouterModel, dbPath);

// Diff service setup
const diffService = new DiffService(dbPath);
diffService.initialize().catch(() => {});

// Register routes
app.use(createHealthRoutes(jsonStorage));
app.use('/snapshots', createSnapshotRoutes(jsonStorage, db));
app.use('/preferences', createPreferenceRoutes(db, dbPath));
app.use(createRecommendationRoutes(jsonStorage, recommendationService));
app.use(createDiffRoutes(diffService));
app.use('/api/prompts', createPromptRoutes());
app.use('/relations', createRelationRoutes(db));
app.use(createViewerRoutes());

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`uDOM Server running on http://localhost:${PORT}`);
  
  try {
    await jsonStorage.initialize();
  } catch (error) {
    // Silent initialization error
  }
});
