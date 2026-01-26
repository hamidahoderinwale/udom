# Taste: Universal Design Intent Learning Platform

A comprehensive platform for capturing, analyzing, and learning design intent from user interactions across design tools. Taste combines universal structural awareness (uDOM) with machine learning to understand and predict design decisions.

**Features**: Smart design suggestions • Intent capture • Preference learning • Auto-apply simple changes • Enhanced analytics dashboard

## Projects Overview

### 1. uDOM Core (`/components`, `/index.html`)

**Universal Structural Awareness Schema**

A unified schema for capturing design artifacts, workspace tools, and procedural workflows. Provides agents with structural and visual knowledge for design tasks.

- **Documentation**: Complete architecture documentation in `index.html`
- **Schema**: Universal design artifact representation
- **Components**: Modular documentation system

**Quick Start**: 
- **Live Documentation**: [https://earnest-lebkuchen-7c5a3e.netlify.app/](https://earnest-lebkuchen-7c5a3e.netlify.app/)
- **Local**: Open `index.html` in your browser to view complete documentation

---

### 2. Figma Plugin (`/figma-plugin`)

**Design Intent Capture & Suggestions**

Figma plugin that captures uDOM snapshots, generates design suggestions, and collects user preferences for training.

**Features**:
- Automatic snapshot capture on component selection
- One-click design suggestions (intent inferred from context)
- Smart auto-apply for simple changes (typography, spacing)
- User preference tracking (accept/reject) with analytics
- Real-time connection status and capture statistics

**Setup**:
```bash
cd figma-plugin
npm install
npm run build
./start-servers.sh  # Starts udom-server and mcp-server
```

Load plugin in Figma Desktop: Plugins > Development > Import plugin from manifest

**Documentation**: 
- See [figma-plugin/README.md](figma-plugin/README.md) for detailed setup
- Live docs: [https://earnest-lebkuchen-7c5a3e.netlify.app/](https://earnest-lebkuchen-7c5a3e.netlify.app/)

---

### 3. uDOM Server (`/udom-server`)

**Database & API Server**

Express server providing REST API and storage for uDOM snapshots, preferences, and recommendations.

**Features**:
- SQLite + JSON file storage
- REST API for snapshots, preferences, recommendations
- Preference statistics and analytics dashboard
- Intent visualization and pattern analysis
- Recommendation service (synthetic + LLM)
- Enhanced snapshot viewer with preference/intent display

**Quick Start**:
```bash
cd udom-server
npm install
npm start
# Server runs on http://localhost:3000
```

**API Endpoints**:
- `GET /health` - Health check
- `POST /snapshots` - Store snapshot
- `GET /snapshots` - Query snapshots
- `POST /preferences` - Store user preference
- `POST /snapshots/:id/recommendations/generate` - Generate suggestions
- `GET /preferences/stats` - Preference statistics

**Documentation**: See [udom-server/README.md](udom-server/README.md)

---

### 4. MCP Server (`/mcp-server`)

**Procedure Event Streaming**

WebSocket server for streaming procedural events (user actions) in real-time via MCP protocol.

**Features**:
- Real-time event streaming
- WebSocket-based communication
- Procedure event capture and forwarding

**Quick Start**:
```bash
cd mcp-server
npm install
npm start
# Server runs on ws://localhost:8080
```

---

### 5. RL System (`/rl`)

**Intent Rule Learning Pipeline**

Production-ready machine learning pipeline for generating, collecting, and training on intent rules using constitutional AI principles.

**Features**:
- Intent rule generation from uDOM snapshots
- Synthetic preference pair generation (6 strategies)
- Constitutional principles for quality guidance
- Multi-dimensional grouping (dimension/platform/artifact)
- DPO training utilities
- Comprehensive analysis notebooks

**Architecture**:
```
uDOM Snapshots → Rule Generation → Preference Learning → DPO Training
      ↓                ↓                    ↓                  ↓
  Artifact        LLM + Synthetic      Constitutional    Fine-tuned
  Traces          Preference Gen       Principles        Model
```

**Quick Start**:
```bash
cd rl
pip install -r requirements.txt
export OPENROUTER_API_KEY="your_key_here"

# Run notebooks in order:
jupyter notebook notebooks/01_prompt_exploration.ipynb
jupyter notebook notebooks/03_rule_generation.ipynb
jupyter notebook notebooks/04_dataset_building.ipynb
```

**Documentation**: 
- See [rl/README.md](rl/README.md) for detailed guide
- Live docs: [https://earnest-lebkuchen-7c5a3e.netlify.app/rl-docs](https://earnest-lebkuchen-7c5a3e.netlify.app/rl-docs)
- Constitutional principles: [rl/docs/constitution.html](rl/docs/constitution.html)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Design Tools (Figma)                     │
│                         ↓                                    │
│              ┌──────────────────────┐                       │
│              │   Figma Plugin       │                       │
│              │  - Capture snapshots │                       │
│              │  - Get suggestions   │                       │
│              │  - Track preferences │                       │
│              └──────────┬───────────┘                       │
│                         ↓                                    │
│         ┌──────────────────────────────────┐                │
│         │      uDOM Server                 │                │
│         │  - Store snapshots              │                │
│         │  - Generate recommendations     │                │
│         │  - Track preferences            │                │
│         └──────────┬───────────────────────┘                │
│                    ↓                                        │
│         ┌──────────────────────┐                            │
│         │   MCP Server        │                            │
│         │  - Stream events     │                            │
│         └──────────┬───────────┘                            │
│                    ↓                                        │
│         ┌──────────────────────┐                            │
│         │   RL System         │                            │
│         │  - Generate rules    │                            │
│         │  - Build dataset     │                            │
│         │  - Train model      │                            │
│         └──────────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

## Getting Started

### Full Stack Setup

1. **Install dependencies**:
```bash
# Figma plugin
cd figma-plugin && npm install

# Servers
cd ../udom-server && npm install
cd ../mcp-server && npm install

# RL system
cd ../rl && pip install -r requirements.txt
```

2. **Start servers**:
```bash
# Option 1: Use startup script
cd figma-plugin
./start-servers.sh

# Option 2: Manual start
cd udom-server && npm start &    # Port 3000
cd mcp-server && npm start &    # Port 8080
```

3. **Load Figma plugin**:
   - Open Figma Desktop
   - Plugins > Development > Import plugin from manifest
   - Select `figma-plugin` folder

4. **Run RL pipeline**:
```bash
cd rl
export OPENROUTER_API_KEY="your_key"
jupyter notebook notebooks/
```

## Documentation

- **Main Documentation**: 
  - Live: [https://earnest-lebkuchen-7c5a3e.netlify.app/](https://earnest-lebkuchen-7c5a3e.netlify.app/)
  - Local: Open `index.html` in browser
- **Taste RL Documentation**: 
  - Live: [https://earnest-lebkuchen-7c5a3e.netlify.app/rl-docs](https://earnest-lebkuchen-7c5a3e.netlify.app/rl-docs)
  - Local: Open `rl/docs/index.html` in browser
- **Project READMEs**:
  - [Figma Plugin](figma-plugin/README.md)
  - [uDOM Server](udom-server/README.md)
  - [RL System](rl/README.md)
- **Constitutional Principles**: [rl/docs/constitution.html](rl/docs/constitution.html)

## Key Concepts

### uDOM (Universal DOM)
A unified schema for representing design artifacts across platforms (Figma, Canva, Sketch, etc.). Captures structure, properties, relationships, and visual characteristics.

### Intent Rules
High-level abstractions describing design decisions (e.g., "increase spacing for premium feel" vs. low-level "change padding from 8px to 16px").

### Constitutional AI
Explicit principles guide rule generation and preference learning, inspired by [Constitutional AI](https://arxiv.org/pdf/2212.08073). No extensive human labeling required.

### Preference Learning
User feedback (accept/reject) improves suggestion quality through preference-based ranking and few-shot learning.

## Development

### Building Documentation
Documentation files are static HTML and don't require building. Simply open `index.html` in your browser.

### Project Structure
```
taste/
├── components/          # Documentation components
├── figma-plugin/        # Figma plugin (TypeScript)
├── udom-server/         # Database & API server (Node.js/Express)
├── mcp-server/          # Procedure event streaming (WebSocket)
├── rl/                  # Intent rule learning system (Python)
│   ├── core/           # Core RL components
│   ├── docs/           # Documentation (HTML)
│   ├── notebooks/      # Jupyter notebooks
│   └── scripts/        # Training data generation
├── assets/              # Shared assets (CSS, JS)
├── design-system.css    # Consolidated design system
├── index.html           # Main uDOM documentation
├── _redirects           # Netlify redirects
├── netlify.toml         # Netlify configuration
└── README.md           # This file
```

### Design System

The project uses a unified design system (`design-system.css`) across all documentation and UI:
- **Typography**: Geist font family (fallback to Inter)
- **Colors**: Warm light mode palette
- **Spacing**: Consistent scale (4px base unit)
- **Components**: Shared styles for cards, buttons, navigation

## License

MIT
