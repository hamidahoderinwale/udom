# Taste RL - Intent Rule Learning System

A production-ready pipeline for generating, collecting, and training on intent rules derived from design artifact traces using constitutional AI principles.

## Overview

The Taste RL system learns high-level design intent patterns from low-level user actions (clicks, drags, property changes) captured in uDOM snapshots. It uses a **constitutional approach** inspired by [Constitutional AI](https://arxiv.org/pdf/2212.08073) to guide rule generation and preference learning without extensive human labeling.

## Architecture

```
uDOM Snapshots → Rule Generation → Preference Learning → DPO Training
      ↓                ↓                    ↓                  ↓
  Artifact        LLM + Synthetic      Constitutional    Fine-tuned
  Traces          Preference Gen       Principles        Model
```

## Key Features

- **Constitutional Principles**: Explicit principles guide rule generation and preference learning
- **Multi-dimensional Grouping**: Preferences grouped by design dimension, platform, and artifact type
- **Synthetic Bootstrapping**: Generate high-quality training data before collecting user preferences
- **Confidence Scoring**: Multi-stage confidence pipeline with preference-based adjustments
- **Intent Capture**: Automatic capture of user intent, inferred intent, and change summaries
- **Platform-Agnostic Core**: Works with Figma, Canva, Sketch, and other design tools
- **Production-Ready**: Clean codebase, proper error handling, comprehensive validation

## Documentation

- **Live Documentation**: [https://earnest-lebkuchen-7c5a3e.netlify.app/rl-docs](https://earnest-lebkuchen-7c5a3e.netlify.app/rl-docs)
- **Local**: Open `docs/index.html` in your browser
- **Constitutional Principles**: [docs/constitution.html](docs/constitution.html)

## Quick Start

### Prerequisites

```bash
pip install -r requirements.txt
export OPENROUTER_APIKEY="your_key_here"
# Or add to .env file (see rl/.env.example)
```

### Run Pipeline

```bash
# 1. Explore prompts and validate schema
jupyter notebook notebooks/01_prompt_exploration.ipynb

# 2. Generate rules from snapshots
jupyter notebook notebooks/03_rule_generation.ipynb

# 3. Build training dataset
jupyter notebook notebooks/04_dataset_building.ipynb

# 4. Analyze dataset quality
jupyter notebook notebooks/05_dataset_analysis.ipynb

# 5. Validate before training
jupyter notebook notebooks/06_pre_training_validation.ipynb
```

## Project Structure

```
rl/
├── core/                      # Core RL components
│   ├── synthetic_preference_generator.py
│   ├── platform_keyword_classifier.py
│   └── design_environment.py
├── data/
│   ├── constitution/         # Constitutional principles (JSON)
│   ├── prompts/              # System prompts
│   ├── schemas/              # JSON schemas
│   ├── generated_rules/      # Output: generated intent rules
│   └── training_dataset/     # Output: DPO training data
├── docs/                      # Documentation
│   ├── index.html            # Main documentation (live on Netlify)
│   ├── constitution.html     # Constitutional principles viewer
│   ├── styles.css            # Documentation styles
│   ├── script.js             # Documentation scripts
│   ├── implementation/       # Implementation details (Markdown)
│   │   ├── DPO_EXPLANATION.md
│   │   ├── MULTI_DIMENSIONAL_GROUPING.md
│   │   └── ...
│   └── SYSTEM_PROMPTS_USAGE.md
├── evaluation/               # Quality metrics and evaluation
├── notebooks/                 # Analysis notebooks (01-06)
│   ├── 01_prompt_exploration.ipynb
│   ├── 02_synthetic_preferences.ipynb
│   ├── 03_rule_generation.ipynb
│   ├── 04_dataset_building.ipynb
│   ├── 05_dataset_analysis.ipynb
│   └── 06_pre_training_validation.ipynb
├── scripts/                   # Utility scripts
│   ├── generate_training_data.py
│   └── test_pipeline.py
├── training/                  # DPO training utilities
└── utils/                     # Loaders and validators
    ├── loaders/              # Data loaders
    └── validators/           # Schema validators
```

## Constitutional Principles

The system uses explicit principles to guide behavior:

- **Action Rules**: How to interpret user action sequences (iteration, temporal batching, proximity clustering)
- **Interpretation Rules**: How to describe intent (descriptive not prescriptive, observable grounding)
- **Quality Signals**: What makes a rule high-quality (novelty, completeness, confidence calibration)
- **Preference Rules**: Which rules are preferred (iteration-aware, semantic depth, style awareness)

See `data/constitution/CONSTITUTION.json` for the complete master constitution.

## Data Pipeline

### 1. Rule Generation

Generate intent rules from uDOM snapshots using LLM (OpenRouter API):

```python
from utils.loaders.snapshot_loader import SnapshotLoader
from utils.loaders.prompt_loader import PromptLoader

loader = SnapshotLoader()
snapshots = loader.load_recent(limit=10)

prompt_loader = PromptLoader()
generator_prompt = prompt_loader.get_prompt_text('generator')
# Use with OpenRouter API to generate rules
```

### 2. Preference Generation

Generate synthetic preference pairs using multiple strategies:

```python
from core.synthetic_preference_generator import SyntheticPreferenceGenerator

generator = SyntheticPreferenceGenerator(
    confidence_threshold_high=0.7,
    confidence_threshold_low=0.4,
    synthetic_weight=0.3,
    group_by_dimension=True,
    group_by_platform=True
)

pairs = generator.generate_from_trace_batch(
    trace_rules,
    strategies=['confidence', 'quality', 'constitutional']
)
```

### 3. Dataset Building

Format preferences for DPO training:

```python
dpo_examples = generator.format_for_dpo(
    pairs,
    include_weights=True,
    include_grouping=True
)
```

## Configuration

- `config/training_config.json`: DPO training hyperparameters
- `openrouter_config.json`: OpenRouter API configuration
- `data/constitution/CONSTITUTION.json`: Master constitutional principles

## API Integration

### Load Prompts

```python
from utils.loaders.prompt_loader import PromptLoader

loader = PromptLoader()
prompt = loader.load_prompt('generator', version='1.3.0')
```

### Load Snapshots

```python
from utils.loaders.snapshot_loader import SnapshotLoader

loader = SnapshotLoader()
snapshots = loader.load_all(use_api=True)  # Via HTTP API
snapshots = loader.load_all(use_json=True)  # Via JSON files
```

## Confidence Scoring

Confidence scores indicate how reliable a rule suggestion is. The system uses a multi-stage pipeline:

### Confidence Sources

1. **Rule Confidence (Base)**: 
   - LLM-generated: Confidence from model (0.0-1.0)
   - Synthetic: Hardcoded based on pattern strength (0.65-0.85)

2. **Match Score (Contextual)**: How well rule matches current snapshot
   - LLM matcher: Semantic similarity
   - Synthetic: Pattern matching strength

### Adjustment Pipeline

```
Base Confidence (0.5-0.85)
    ↓
Preference Ranking (0.5x - 1.5x multiplier)
    ↓
Type Boost (+0.02 to +0.1)
    ↓
Final Confidence (capped at 1.0)
```

**Preference-Based Ranking:**
- High acceptance rate: Up to 1.5x boost
- Low acceptance rate: Down to 0.5x demote
- Dimension-level boost: +10% if dimension acceptance > 60%

**Type Boosts:**
- Accessibility/Readability: +0.1
- Consistency/Standardization: +0.05
- Enhancement/Simplification: +0.03

### Filtering

- Minimum threshold: 0.5 (configurable)
- Auto-apply requires: confidence ≥ 0.5 AND specific action keywords
- Display: Shown as percentage in UI (e.g., "75%")

## Intent & Action Summaries

The system captures and displays user intent and action summaries to provide context for rule generation.

### Intent Capture

1. **User Intent (Explicit)**: 
   - Captured when user provides intent text (e.g., "make this more premium")
   - Stored in: `snapshot.observations.intent.user_intent`

2. **Inferred Intent (Automatic)**:
   - Captured when comparing with previous snapshot
   - Structure: `{action_type, focus_area, confidence}`
   - **Implementation**: Heuristic-based inference using diff analysis
     - Computes diff between previous and current snapshots
     - Analyzes change patterns (added/removed/modified elements, property changes)
     - Infers action type: `create` (many additions), `modify` (mixed changes), `refine` (property tweaks), `explore` (minimal changes)
     - Infers focus area: `spacing`, `typography`, `color`, `layout`, `hierarchy`, `interaction` based on property paths
     - Calculates confidence (0.3-0.95) based on change clarity and focus area dominance
   - **Optional Enhancement**: Server-side OpenRouter API enhancement available via `POST /snapshots/enhance-intent` endpoint

3. **Change Summary (Automatic)**:
   - Generated from snapshot differences
   - Format: "Changes: X added, Y removed, Z modified, N property changes"
   - Stored in: `snapshot.observations.intent.change_summary`

### Display

All captured intent data is displayed in the uDOM Snapshot Viewer:
- Snapshot cards show intent preview
- Details modal shows full intent section
- Statistics show "With Intent" count and breakdown

## Quality Validation

```python
from utils.validators.schema_validator import SchemaValidator
from evaluation.quality_metrics import QualityMetrics

validator = SchemaValidator()
is_valid, errors = validator.validate_rule(rule_dict)

metrics = QualityMetrics()
rule_metrics = metrics.compute_rule_quality(rules)
```

## Training

The system generates DPO-ready training data:

```json
{
  "input": {"trace": [...], "artifacts": {...}},
  "preferred": {"rule_id": "...", "description": "...", ...},
  "rejected": {"rule_id": "...", "description": "...", ...},
  "source": "constitutional",
  "synthetic": true,
  "weight": 0.36,
  "dimension_group": "spacing",
  "platform_group": "figma"
}
```

## Requirements

See `requirements.txt` for Python dependencies. Key packages:
- `jsonschema` - Schema validation
- `requests` - HTTP API access
- `numpy` - Numerical operations
- `tqdm` - Progress bars
- `python-dotenv` - Environment variable loading
- `transformers` - HuggingFace transformers (for rule generation)
- `torch` - PyTorch (for model training)
- `trl` - Transformers Reinforcement Learning (for DPO)

## Environment Variables

Create a `.env` file in the `rl/` directory (see `.env.example`):

```bash
OPENROUTER_APIKEY=your_openrouter_key_here
HF_TOKEN=your_huggingface_token_here  # Optional, for model access
```

## Code Organization

The codebase follows clean, modular principles:
- **Separation of concerns**: Loaders, validators, generators are separate modules
- **Design system**: Consistent styling via `design-system.css`
- **Documentation**: Comprehensive inline docs and external documentation
- **Type hints**: Python type hints throughout for better IDE support
- **Error handling**: Robust error handling with clear messages

## License

See LICENSE file for details.

## References

- [Constitutional AI: Harmlessness from AI Feedback](https://arxiv.org/pdf/2212.08073) - Anthropic (2022)
