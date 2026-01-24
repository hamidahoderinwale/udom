# uDOM Database Server

Express server providing REST API and storage for uDOM snapshots, preferences, and recommendations. Supports both SQLite and JSON file storage.

## Documentation

- **Live Documentation**: [https://earnest-lebkuchen-7c5a3e.netlify.app/](https://earnest-lebkuchen-7c5a3e.netlify.app/)
- **Snapshot Viewer**: http://localhost:3000/viewer (when server is running)

## Quick Start

```bash
# Install dependencies
npm install

# Start server
npm start

# Server runs on http://localhost:3000
```

## Populate Sample Data

To populate the database with sample snapshots for testing:

```bash
node populate-sample-data.js
```

This creates:
- 3 sample snapshots (2 Figma components, 1 React component)
- 2 sample contributors

## API Endpoints

### Health Check
```
GET /health
```

### Store Snapshot
```
POST /snapshots
Content-Type: application/json

{
  "metadata": { ... },
  "elements": [ ... ],
  "relations": [ ... ],
  "observations": { ... }
}
```

### Query Snapshots
```
GET /snapshots?artifact_type=figma_component&timestamp_from=1234567890
```

### Get Snapshot by ID
```
GET /snapshots/:snapshot_id
```

## Database Schema

### snapshots
- `snapshot_id` (TEXT PRIMARY KEY)
- `artifact_id` (TEXT)
- `artifact_type` (TEXT)
- `capture_context` (TEXT JSON)
- `timestamp` (INTEGER)
- `udom_data` (TEXT JSON)
- `created_at` (DATETIME)

### contributors
- `contributor_id` (TEXT PRIMARY KEY)
- `display_name` (TEXT)
- `affiliation` (TEXT)
- `role` (TEXT)
- `organization_type` (TEXT)
- `share_snapshots` (BOOLEAN)
- `share_demographics` (BOOLEAN)
- `created_at` (TIMESTAMP)

## Using Datasette (Recommended)

For exploration and querying:

```bash
pip install datasette
datasette snapshots.db --port 8000 --cors
```

Browse at `http://localhost:8000` for:
- Web UI for browsing snapshots
- SQL query interface
- JSON API
- Faceted browsing and filtering

## Features

- **Dual Storage**: SQLite database + JSON file storage (prioritizes JSON)
- **REST API**: Full CRUD operations for snapshots and preferences
- **Recommendation Service**: Synthetic + LLM-based rule suggestions
- **Preference Analytics**: Statistics and few-shot example generation
- **Snapshot Viewer**: Enhanced web UI with intent visualization
- **Intent Capture**: Automatic change summaries and intent tracking

## API Endpoints

### Snapshots
- `POST /snapshots` - Store snapshot
- `GET /snapshots` - Query snapshots (with filters)
- `GET /snapshots/:id` - Get snapshot by ID
- `GET /snapshots/:id/recommendations` - Get recommendations for snapshot
- `POST /snapshots/:id/recommendations/generate` - Generate new recommendations

### Preferences
- `POST /preferences` - Store user preference (accept/reject)
- `GET /preferences/stats` - Get preference statistics
- `GET /preferences/examples` - Get few-shot examples for rule matching

### Viewer
- `GET /viewer` - Snapshot viewer web interface
- `GET /design-system.css` - Design system CSS

## Environment Variables

- `PORT`: Server port (default: 3000)
- `DB_PATH`: Database file path (default: `./snapshots.db`)
- `OPENROUTER_APIKEY`: OpenRouter API key for LLM recommendations (optional)
- `OPENROUTER_MODEL`: Model to use (default: `anthropic/claude-3.5-sonnet`)
