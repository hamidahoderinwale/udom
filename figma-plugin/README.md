# uDOM Figma Plugin

Captures uDOM snapshots from Figma components for design analysis and ML training.

## Setup

### Prerequisites
- Figma Desktop (web version does not support local plugins)
- Node.js 18+ installed
- All dependencies installed

### Installation

1. Install dependencies:
```bash
cd figma-plugin
npm install

cd ../udom-server
npm install

cd ../mcp-server
npm install
```

2. Build the plugin:
```bash
cd figma-plugin
npm run build
```

3. Start servers:
```bash
# Use the startup script
cd figma-plugin
./start-servers.sh

# Or start manually in separate terminals
cd udom-server && npm start    # Port 3000
cd mcp-server && npm start      # Port 8080
```

4. Load plugin in Figma Desktop:
   - Open Figma Desktop
   - Go to Plugins > Development > Import plugin from manifest...
   - Select the `figma-plugin` folder
   - Run from Plugins > Development > uDOM Capture

## Usage

### Automatic Capture (Default)

1. Open plugin: Plugins > Development > uDOM Capture
2. Select any component, frame, or node in Figma
3. The plugin automatically captures snapshots after 500ms of selection
4. A visual indicator shows when capture is happening
5. The widget displays capture count and last capture time

### Getting Design Suggestions

1. Select a component in Figma
2. Click "Get Suggestions" button
3. Suggestions appear based on snapshot context (intent inferred automatically)
4. Click "Accept" to apply (simple changes auto-apply) or "Reject" to dismiss
5. Preferences are tracked for training

**Smart Auto-Apply**: Simple changes like "increase font size" or "add more spacing" are automatically applied. Complex changes show a walkthrough option.

### Viewing Snapshots & Analytics

1. Click "View Snapshots" button in the plugin widget
2. Opens enhanced viewer at http://localhost:3000/viewer
3. View snapshots with intent data and preference statistics
4. Filter by intent presence, preferences, artifact type
5. See intent patterns and preference analytics
6. Download individual snapshots as JSON

## Features

- **Auto-capture**: Automatically captures snapshots on selection with debouncing
- **One-Click Suggestions**: Get design suggestions with a single click (intent inferred from context)
- **Smart Auto-Apply**: Simple changes (typography, spacing) applied automatically
- **Preference Tracking**: Accept/reject feedback improves future suggestions
- **Intent Capture**: User intent captured in snapshots (e.g., "make this more premium")
- **Before/After State**: Tracks previous snapshot state for change detection
- **Visual Feedback**: Shows capture status with pulse animation
- **Capture Counter**: Tracks total snapshots saved in current session
- **Connection Status**: Real-time server connection indicator
- **Enhanced Viewer**: Web interface with preference analytics and intent visualization
- **Rule Suggestions**: Synthetic + optional LLM-based suggestions (OpenRouter API key optional)

## Permissions

The plugin requires the following Figma permissions:

- **currentuser** - Access to current user information for provenance tracking (user ID and name)

These are declared in `manifest.json`.

## Documentation

- **Live Documentation**: [https://earnest-lebkuchen-7c5a3e.netlify.app/](https://earnest-lebkuchen-7c5a3e.netlify.app/)
- **RL Documentation**: [https://earnest-lebkuchen-7c5a3e.netlify.app/rl-docs](https://earnest-lebkuchen-7c5a3e.netlify.app/rl-docs)

## Architecture

### Plugin Components

**Artifact Adapter** (`src/adapters/artifact-adapter.ts`)
- Main extraction logic for Figma nodes to uDOM snapshots
- Handles structure extraction, relation mapping, provenance

**Structure Extractor** (`src/extractors/structure-extractor.ts`)
- Traverses Figma node tree
- Extracts properties: spatial, visual, text data
- Generates stable content-addressable IDs

**Composition Extractor** (`src/extractors/composition-extractor.ts`)
- Infers composition rules from auto-layout
- Extracts spacing rhythms and visual hierarchy
- Detects design constraints

**Database Client** (`src/api/db-client.ts`)
- HTTP client for snapshot storage
- Supports querying by artifact_id, type, timestamp

**Procedural Adapter** (`src/adapters/procedural-adapter.ts`)
- Captures document change events
- Logs events (WebSocket not available in plugin context)

**UI** (`ui.html`)
- Minimal widget interface
- Selection info and connection status
- Capture button with error feedback

### Backend Servers

**uDOM Server** (`../udom-server/server.js`)
- Express server on port 3000
- SQLite database for snapshot storage
- REST API for storing and querying

**MCP Server** (`../mcp-server/mcp-server.js`)
- WebSocket server on port 8080
- Broadcasts procedural events to connected clients

## Data Extraction

The plugin captures:

- **Structure**: Complete node hierarchy
- **Properties**: Width, height, name, type, layout modes
- **Visual**: Colors, borders, shadows, corner radius
- **Text**: Content, font family, size, weight, line height
- **Spatial**: Absolute positioning, relative layout
- **Relations**: Parent-child, sibling relationships
- **Composition**: Spacing rhythms, visual hierarchy, constraints
- **Provenance**: User, session, timestamp, tool metadata
- **Stable IDs**: Content-addressable identifiers

## API Reference

### Store Snapshot
```bash
POST http://localhost:3000/snapshots
Content-Type: application/json

{
  "metadata": { ... },
  "elements": [ ... ],
  "relations": [ ... ],
  "observations": { ... }
}
```

### Query Snapshots
```bash
# Get all snapshots (limited to 100)
GET http://localhost:3000/snapshots

# Filter by artifact_id
GET http://localhost:3000/snapshots?artifact_id=figma://file/ABC/node/1:42

# Filter by type and timestamp
GET http://localhost:3000/snapshots?artifact_type=figma_component&timestamp_from=1705968000000
```

### Get Snapshot by ID
```bash
GET http://localhost:3000/snapshots/:snapshot_id
```

### Health Check
```bash
GET http://localhost:3000/health
```

## Development

### Build Commands
```bash
npm run build   # Compile TypeScript and bundle
npm run watch   # Watch mode for development
```

### Rebuilding After Changes
After modifying `.ts` files:
```bash
npm run build
```

Then in Figma:
1. Close the plugin
2. Re-run from Plugins menu

### Project Structure
```
figma-plugin/
├── code.js              # Bundled plugin code (auto-generated)
├── manifest.json        # Figma plugin manifest
├── ui.html             # Plugin UI
├── start-servers.sh    # Startup script
├── package.json
├── tsconfig.json
└── src/
    ├── code.ts         # Main entry point
    ├── adapters/       # Artifact & procedural adapters
    ├── extractors/     # Structure & composition extractors
    ├── api/            # Database client
    ├── types/          # TypeScript type definitions
    └── utils/          # Helper utilities

udom-server/
├── server.js           # Express server
├── snapshots.db        # SQLite database (auto-created)
└── package.json

mcp-server/
├── mcp-server.js       # WebSocket server
└── package.json
```

## Troubleshooting

### Plugin won't load
- Check that `code.js` exists: `ls -lh code.js`
- Rebuild if needed: `npm run build`
- Verify using Figma Desktop (not web)
- Check console: Plugins > Development > Open Console

### Disconnected status
- Verify server running: `curl http://localhost:3000/health`
- Check port availability: `lsof -ti:3000`
- Restart servers if needed

### Capture fails
- Ensure node is selected in Figma
- Check server logs for errors
- Verify network access allowed (localhost)

### Build errors
- Delete intermediate .js files in src/
- Run `npm run build` with full permissions
- Check TypeScript errors: `tsc --noEmit`

## Limitations

- WebSocket streaming unavailable in Figma plugin context
- Procedural events logged to console only
- Requires Figma Desktop application
- Network access restricted to localhost
- No image export (requires additional API calls)

## Testing

### Quick Verification
```bash
# 1. Check build
ls -lh code.js  # Should show ~20KB file

# 2. Test server
curl http://localhost:3000/health

# 3. Capture a snapshot (in Figma)
# 4. Verify storage
curl http://localhost:3000/snapshots | jq
```

### Test Coverage
- Plugin load and UI rendering
- Selection tracking and updates
- Basic snapshot capture
- Complex component hierarchies
- Text extraction
- Visual properties
- Composition rules
- Relations mapping
- Error handling
- Database persistence

## Documentation

See the main [uDOM documentation](../README.md) for:
- Complete schema specification
- Data flow architecture
- Storage strategy
- Integration guides
