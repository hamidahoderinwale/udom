#!/usr/bin/env python3
"""
End-to-end pipeline script for generating training data.

Orchestrates: snapshots → rules → preferences → dataset
"""

import sys
import os
from pathlib import Path
import json
import requests
from typing import Dict, List, Optional
from datetime import datetime
from tqdm import tqdm

# Load environment variables
try:
    from dotenv import load_dotenv
    rl_path = Path(__file__).parent.parent
    load_dotenv(rl_path / '.env', override=False)
    load_dotenv(rl_path.parent / '.env', override=False)  # Root .env
except ImportError:
    pass

# Add paths
sys.path.append(str(Path(__file__).parent.parent))

from utils.loaders.prompt_loader import PromptLoader
from core.synthetic_preference_generator import (
    SyntheticPreferenceGenerator,
    load_rules_from_generated_file
)


class TrainingDataGenerator:
    """End-to-end training data generation pipeline"""
    
    def __init__(self, config_path: Optional[Path] = None):
        """Initialize generator with configuration"""
        if config_path is None:
            config_path = Path(__file__).parent.parent / 'config' / 'openrouter.json'
        
        with open(config_path, 'r') as f:
            self.config = json.load(f)
        
        # Load API key from environment
        self.openrouter_key = os.getenv('OPENROUTER_APIKEY')
        if not self.openrouter_key:
            print("Warning: OPENROUTER_APIKEY not found")
            print("  Set it in .env file or export OPENROUTER_APIKEY='your_key_here'")
            print("  Rule generation will be skipped, but other operations can continue")
        
        self.udom_server_url = 'http://localhost:3000'
        self.openrouter_url = 'https://openrouter.ai/api/v1/chat/completions'
        
        # Initialize components
        self.prompt_loader = PromptLoader()
        self.preference_generator = SyntheticPreferenceGenerator(
            confidence_threshold_high=0.7,
            confidence_threshold_low=0.4,
            min_novelty_score=self.config['generation_defaults']['min_novelty_score'],
            require_platform_context=True,
            synthetic_weight=0.3
        )
        
        # Load generator prompt
        generator_prompt = self.prompt_loader.load_prompt('generator')
        self.generator_text = generator_prompt['prompt_text']
        
        # Model config
        model_config = self.config['models']['rule_generation']
        self.model = model_config['model']
        self.temperature = model_config['temperature']
        self.max_tokens = model_config['max_tokens']
        
        # Output paths
        self.output_paths = self.config['output_paths']
        self.rules_output = Path(self.output_paths['generated_rules']) / 'rules.jsonl'
        self.dataset_output = Path(self.output_paths['training_dataset'])
    
    def fetch_snapshots(self, limit: int = 100, artifact_type: Optional[str] = None) -> List[Dict]:
        """Fetch snapshots from udom-server"""
        url = f"{self.udom_server_url}/snapshots"
        params = {'limit': limit}
        if artifact_type:
            params['artifact_type'] = artifact_type
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error fetching snapshots: {e}")
            return []
    
    def transform_snapshot(self, snapshot: Dict) -> Dict:
        """Transform snapshot to generator input format"""
        elements = snapshot.get('elements', [])
        action_types = set()
        property_types = set()
        element_types = set()
        
        for element in elements:
            element_types.add(element.get('type', 'unknown'))
            props = element.get('properties', {})
            property_types.update(props.keys())
            
            if element.get('spatial'):
                property_types.add('spatial')
            if element.get('visual'):
                property_types.add('visual')
            if element.get('text'):
                property_types.add('text')
        
        relations = snapshot.get('relations', [])
        for relation in relations:
            action_types.add(f"relation_{relation.get('type', 'unknown')}")
        
        provenance = snapshot.get('observations', {}).get('provenance', {})
        platform_metadata = {
            'platform': provenance.get('tool', 'figma'),
            'platform_version': provenance.get('tool_version', '1.0.0'),
            'extraction_method': provenance.get('extraction_method', 'plugin_api'),
            'extraction_parameters': {
                'schema_version': snapshot.get('metadata', {}).get('schema_version', '1.0.0'),
                'extractor_version': provenance.get('extractor_version', '1.0.0')
            }
        }
        
        return {
            'trace': [],  # Simplified - use actual trace in production
            'artifacts': {
                'before': snapshot,
                'after': snapshot
            },
            'platform_semantics': {
                'action_types': list(action_types),
                'property_types': list(property_types),
                'element_types': list(element_types)
            },
            'platform_metadata': platform_metadata,
            'generation_config': self.config['generation_defaults']
        }
    
    def generate_rules(self, generator_input: Dict, batch_id: str) -> Dict:
        """Generate rules using OpenRouter API"""
        if not self.openrouter_key:
            raise ValueError("OPENROUTER_APIKEY not set. Cannot generate rules. Set it in .env file or export OPENROUTER_APIKEY='your_key_here'")
        
        messages = [
            {'role': 'system', 'content': self.generator_text},
            {'role': 'user', 'content': json.dumps(generator_input, indent=2)}
        ]
        
        headers = {
            'Authorization': f'Bearer {self.openrouter_key}',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/hamidahoderinwale/udom',
            'X-Title': 'Taste Intent Rule Generator'
        }
        
        payload = {
            'model': self.model,
            'messages': messages,
            'temperature': self.temperature,
            'max_tokens': self.max_tokens,
            'response_format': {'type': 'json_object'}
        }
        
        response = requests.post(self.openrouter_url, json=payload, headers=headers, timeout=60)
        response.raise_for_status()
        
        result = response.json()
        
        # Handle API response
        if 'choices' not in result or not result['choices']:
            raise ValueError(f"Unexpected API response format: {result}")
        
        content = result['choices'][0]['message']['content']
        
        # Try to parse JSON from response
        try:
            rules_output = json.loads(content)
        except json.JSONDecodeError as e:
            # Try to extract JSON from markdown code blocks or other formatting
            import re
            # Look for JSON object in the response
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                try:
                    rules_output = json.loads(json_match.group())
                except json.JSONDecodeError:
                    # If still fails, return empty rules with error message
                    rules_output = {
                        'intent_rules': [],
                        'metadata': {
                            'error': 'Failed to parse JSON',
                            'raw_response_preview': content[:500]
                        }
                    }
            else:
                # No JSON found - model returned text explanation
                # Return empty rules with the explanation
                rules_output = {
                    'intent_rules': [],
                    'metadata': {
                        'error': 'No JSON in response',
                        'model_explanation': content[:500]
                    }
                }
        
        # Ensure metadata exists
        if 'metadata' not in rules_output:
            rules_output['metadata'] = {}
        rules_output['metadata']['batch_id'] = batch_id
        
        return rules_output
    
    def process_snapshots(self, snapshots: List[Dict], batch_size: int = 10) -> List[Dict]:
        """Process snapshots and generate rules"""
        self.rules_output.parent.mkdir(parents=True, exist_ok=True)
        
        all_rules = []
        batch_id = f"batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        for i, snapshot in enumerate(tqdm(snapshots[:batch_size], desc="Generating rules")):
            try:
                generator_input = self.transform_snapshot(snapshot)
                rules_output = self.generate_rules(generator_input, f"{batch_id}_{i}")
                rules_output['trace_id'] = snapshot.get('snapshot_id', f"trace_{i}")
                
                all_rules.append(rules_output)
                
                # Save incrementally
                with open(self.rules_output, 'a') as f:
                    f.write(json.dumps(rules_output) + '\n')
            
            except Exception as e:
                print(f"Error processing snapshot {i+1}: {e}")
                continue
        
        return all_rules
    
    def generate_preferences(self, rules_file: Path) -> List[Dict]:
        """Generate synthetic preferences from rules"""
        trace_rules = load_rules_from_generated_file(str(rules_file))
        
        all_pairs = []
        for trace_id, rules in trace_rules.items():
            trace_context = {'trace_id': trace_id}
            pairs = self.preference_generator.generate_preferences(
                rules,
                trace_context=trace_context,
                strategies=['confidence', 'quality', 'completeness', 'novelty', 'frequency']
            )
            all_pairs.extend(pairs)
        
        return self.preference_generator.format_for_dpo(all_pairs, include_weights=True)
    
    def save_dataset(self, preferences: List[Dict], output_path: Path):
        """Save preferences to dataset file"""
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w') as f:
            for example in preferences:
                f.write(json.dumps(example) + '\n')
        
        print(f"Saved {len(preferences)} examples to {output_path}")
    
    def run(self, snapshot_limit: int = 10, batch_size: int = 10):
        """Run the complete pipeline"""
        print("=" * 80)
        print("Training Data Generation Pipeline")
        print("=" * 80)
        
        # Step 1: Fetch snapshots
        print(f"\n1. Fetching snapshots (limit: {snapshot_limit})...")
        snapshots = self.fetch_snapshots(limit=snapshot_limit)
        print(f"   Fetched {len(snapshots)} snapshots")
        
        if not snapshots:
            print("   No snapshots found. Make sure udom-server is running.")
            return
        
        # Step 2: Generate rules
        print(f"\n2. Generating rules (batch size: {batch_size})...")
        rules = self.process_snapshots(snapshots, batch_size=batch_size)
        print(f"   Generated rules for {len(rules)} snapshots")
        
        if not rules:
            print("   No rules generated. Check API key and model configuration.")
            return
        
        # Step 3: Generate preferences
        print(f"\n3. Generating synthetic preferences...")
        if not self.rules_output.exists():
            print(f"   Rules file not found: {self.rules_output}")
            return
        
        preferences = self.generate_preferences(self.rules_output)
        print(f"   Generated {len(preferences)} preference pairs")
        
        # Step 4: Save dataset
        print(f"\n4. Saving dataset...")
        self.save_dataset(preferences, self.dataset_output)
        
        print("\n" + "=" * 80)
        print("Pipeline complete!")
        print("=" * 80)


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Generate training data pipeline')
    parser.add_argument('--snapshot-limit', type=int, default=10, help='Max snapshots to fetch')
    parser.add_argument('--batch-size', type=int, default=10, help='Batch size for processing')
    
    args = parser.parse_args()
    
    try:
        generator = TrainingDataGenerator()
        generator.run(
            snapshot_limit=args.snapshot_limit,
            batch_size=args.batch_size
        )
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()

