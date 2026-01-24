#!/usr/bin/env python3
"""
Export Training Dataset

Converts preference events and synthetic preferences to DPO training format.
Exports to JSONL for training pipeline.
"""

import json
import sqlite3
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional
from collections import defaultdict
from tqdm import tqdm

# jsonlines is in requirements.txt - install with: pip install jsonlines
try:
    import jsonlines
except ImportError:
    print("Error: jsonlines not installed. Install with: pip install jsonlines")
    import sys
    sys.exit(1)

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.environment import create_environment_from_preferences
from core.synthetic_preference_generator import SyntheticPreferenceGenerator, IntentRule, PreferencePair


class DatasetExporter:
    """
    Export preference data to DPO training format.
    
    Features:
    - Loads real preferences from database or JSON
    - Generates synthetic preferences from rules
    - Converts to DPO format (preferred vs rejected)
    - Splits train/val/test
    - Validates and exports to JSONL
    """
    
    def __init__(
        self,
        db_path: Optional[str] = None,
        snapshots_dir: Optional[str] = None,
        output_dir: str = "data/training_dataset",
        train_split: float = 0.8,
        val_split: float = 0.1,
        test_split: float = 0.1,
    ):
        """
        Initialize exporter.
        
        Parameters:
        - db_path: Path to SQLite database (if None, uses default)
        - snapshots_dir: Directory with JSON snapshots (if None, uses default)
        - output_dir: Output directory for training datasets
        - train_split, val_split, test_split: Data split ratios (must sum to 1.0)
        """
        self.db_path = db_path or Path(__file__).parent.parent.parent / "udom-server" / "snapshots.db"
        self.snapshots_dir = snapshots_dir or Path(__file__).parent.parent.parent / "udom-server" / "snapshots"
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        assert abs(train_split + val_split + test_split - 1.0) < 0.01, "Splits must sum to 1.0"
        self.train_split = train_split
        self.val_split = val_split
        self.test_split = test_split
        
        self.preference_generator = SyntheticPreferenceGenerator()
    
    def load_preferences_from_db(self) -> List[Dict[str, Any]]:
        """Load preference events from SQLite database."""
        preferences = []
        
        if not Path(self.db_path).exists():
            print(f"Database not found at {self.db_path}, skipping real preferences")
            return preferences
        
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT event_id, timestamp, session_id, snapshot_id, artifact_id,
                       source, type, user_action, suggested_rules, trace_context,
                       extensions, metadata
                FROM preferences
                ORDER BY timestamp DESC
            """)
            
            for row in cursor.fetchall():
                pref = {
                    'event_id': row['event_id'],
                    'timestamp': row['timestamp'],
                    'session_id': row['session_id'],
                    'snapshot_id': row['snapshot_id'],
                    'artifact_id': row['artifact_id'],
                    'source': row['source'] or 'user_feedback',
                    'type': row['type'],
                    'user_action': json.loads(row['user_action']),
                    'suggested_rules': json.loads(row['suggested_rules']),
                    'trace_context': json.loads(row['trace_context']),
                }
                
                if row['extensions']:
                    pref['extensions'] = json.loads(row['extensions'])
                if row['metadata']:
                    pref['metadata'] = json.loads(row['metadata'])
                
                preferences.append(pref)
        finally:
            conn.close()
        
        print(f"Loaded {len(preferences)} preference events from database")
        return preferences
    
    def load_snapshots(self) -> Dict[str, Dict[str, Any]]:
        """Load uDOM snapshots from JSON files."""
        snapshots = {}
        
        if not Path(self.snapshots_dir).exists():
            print(f"Snapshots directory not found at {self.snapshots_dir}")
            return snapshots
        
        # Load from JSON files (organized by year/month)
        for json_file in Path(self.snapshots_dir).rglob("*.json"):
            if json_file.name == "_index.json":
                continue
            
            try:
                with open(json_file, 'r') as f:
                    snapshot = json.load(f)
                    if 'metadata' in snapshot and 'snapshot_id' in snapshot['metadata']:
                        snapshots[snapshot['metadata']['snapshot_id']] = snapshot
            except (json.JSONDecodeError, IOError, KeyError):
                continue
        
        print(f"Loaded {len(snapshots)} snapshots")
        return snapshots
    
    def load_changes(self) -> Dict[str, List[Dict[str, Any]]]:
        """Load changes from database (if available)."""
        changes = defaultdict(list)
        
        if not Path(self.db_path).exists():
            return dict(changes)
        
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            # Check if changes table exists
            cursor.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='changes'
            """)
            if not cursor.fetchone():
                return dict(changes)
            
            cursor.execute("""
                SELECT snapshot_id, change_type, change_scope, property_name,
                       old_value, new_value, timestamp
                FROM changes
            """)
            
            for row in cursor.fetchall():
                change = {
                    'change_type': row['change_type'],
                    'change_scope': row['change_scope'],
                    'property_name': row['property_name'],
                    'old_value': row['old_value'],
                    'new_value': row['new_value'],
                    'timestamp': row['timestamp'],
                }
                changes[row['snapshot_id']].append(change)
        finally:
            conn.close()
        
        print(f"Loaded changes for {len(changes)} snapshots")
        return dict(changes)
    
    def create_preference_pairs_from_events(
        self,
        preferences: List[Dict[str, Any]],
        snapshots: Dict[str, Dict[str, Any]],
        changes: Dict[str, List[Dict[str, Any]]],
    ) -> List[Dict[str, Any]]:
        """
        Convert preference events to DPO preference pairs.
        
        For each preference event:
        - If accepted: preferred = accepted rule, rejected = other suggested rules
        - If rejected: preferred = other suggested rules, rejected = rejected rule
        - If multiple rules: create pairs from accepted vs rejected
        """
        pairs = []
        
        for pref in tqdm(preferences, desc="Creating preference pairs"):
            user_action = pref.get('user_action', {})
            action_type = user_action.get('type', 'ignored')
            suggested_rules = pref.get('suggested_rules', [])
            
            if action_type == 'ignored' or len(suggested_rules) < 2:
                continue
            
            snapshot_id = pref['snapshot_id']
            snapshot = snapshots.get(snapshot_id)
            if not snapshot:
                continue
            
            # Build input context
            trace_context = pref.get('trace_context', {})
            input_context = {
                'snapshot_id': snapshot_id,
                'artifact_id': pref.get('artifact_id'),
                'user_intent': trace_context.get('user_intent'),
                'component_id': trace_context.get('component_id'),
                'platform': trace_context.get('platform', 'figma'),
                'component_type': snapshot.get('metadata', {}).get('artifact_type'),
            }
            
            # Create pairs based on user action
            if action_type == 'accepted':
                accepted_rule_id = user_action.get('rule_id')
                if accepted_rule_id:
                    # Find accepted rule
                    accepted_rule = next(
                        (r for r in suggested_rules if r.get('rule_id') == accepted_rule_id),
                        None
                    )
                    if accepted_rule:
                        # Pair accepted with each rejected rule
                        for rule in suggested_rules:
                            if rule.get('rule_id') != accepted_rule_id:
                                pairs.append({
                                    'input': input_context,
                                    'preferred': accepted_rule,
                                    'rejected': rule,
                                    'source': pref.get('source', 'user_feedback'),
                                    'type': pref.get('type', 'auto_suggestion'),
                                    'weight': 1.0,  # Real preferences weighted higher
                                    'metadata': {
                                        'event_id': pref.get('event_id'),
                                        'timestamp': pref.get('timestamp'),
                                        'dimension_group': accepted_rule.get('dimension'),
                                        'platform_group': input_context.get('platform'),
                                    }
                                })
            
            elif action_type == 'dismissed':
                dismissed_rule_id = user_action.get('rule_id')
                if dismissed_rule_id:
                    # Find dismissed rule
                    dismissed_rule = next(
                        (r for r in suggested_rules if r.get('rule_id') == dismissed_rule_id),
                        None
                    )
                    if dismissed_rule:
                        # Pair other rules (preferred) with dismissed (rejected)
                        for rule in suggested_rules:
                            if rule.get('rule_id') != dismissed_rule_id:
                                pairs.append({
                                    'input': input_context,
                                    'preferred': rule,
                                    'rejected': dismissed_rule,
                                    'source': pref.get('source', 'user_feedback'),
                                    'type': pref.get('type', 'auto_suggestion'),
                                    'weight': 1.0,
                                    'metadata': {
                                        'event_id': pref.get('event_id'),
                                        'timestamp': pref.get('timestamp'),
                                        'dimension_group': rule.get('dimension'),
                                        'platform_group': input_context.get('platform'),
                                    }
                                })
        
        print(f"Created {len(pairs)} preference pairs from user feedback")
        return pairs
    
    def add_synthetic_pairs(
        self,
        snapshots: Dict[str, Dict[str, Any]],
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Generate synthetic preference pairs from rules."""
        # Load generated rules if available
        rules_dir = Path(__file__).parent.parent / "data" / "generated_rules"
        if not rules_dir.exists():
            print("No generated rules found, skipping synthetic pairs")
            return []
        
        all_rules = []
        for rules_file in rules_dir.glob("*.jsonl"):
            with jsonlines.open(rules_file) as reader:
                for rule_data in reader:
                    rule = IntentRule(
                        rule_id=rule_data.get('rule_id', ''),
                        description=rule_data.get('description', ''),
                        scope=rule_data.get('scope', 'structural'),
                        abstraction_level=rule_data.get('abstraction_level', 'intermediate'),
                        triggering_actions=rule_data.get('triggering_actions', []),
                        artifact_properties=rule_data.get('artifact_properties'),
                        confidence=rule_data.get('confidence', 0.5),
                        platform_context=rule_data.get('platform_context'),
                        training_metadata=rule_data.get('training_metadata'),
                        design_dimension=rule_data.get('design_dimension'),
                    )
                    all_rules.append(rule)
        
        if not all_rules:
            print("No rules found in generated_rules directory")
            return []
        
        # Group rules by trace/snapshot (simplified: group by first 100)
        if limit:
            all_rules = all_rules[:limit]
        
        # Generate synthetic pairs
        synthetic_pairs = self.preference_generator.generate_preferences(all_rules)
        
        # Convert to DPO format
        dpo_pairs = self.preference_generator.format_for_dpo(
            synthetic_pairs,
            include_weights=True,
            include_grouping=True
        )
        
        print(f"Generated {len(dpo_pairs)} synthetic preference pairs")
        return dpo_pairs
    
    def split_dataset(
        self,
        pairs: List[Dict[str, Any]],
        shuffle: bool = True,
    ) -> tuple[List[Dict], List[Dict], List[Dict]]:
        """Split dataset into train/val/test."""
        if shuffle:
            import random
            random.shuffle(pairs)
        
        total = len(pairs)
        train_end = int(total * self.train_split)
        val_end = train_end + int(total * self.val_split)
        
        train = pairs[:train_end]
        val = pairs[train_end:val_end]
        test = pairs[val_end:]
        
        print(f"Split: {len(train)} train, {len(val)} val, {len(test)} test")
        return train, val, test
    
    def export_jsonl(
        self,
        pairs: List[Dict[str, Any]],
        filename: str,
    ):
        """Export pairs to JSONL file."""
        filepath = self.output_dir / filename
        with jsonlines.open(filepath, mode='w') as writer:
            for pair in pairs:
                writer.write(pair)
        print(f"Exported {len(pairs)} pairs to {filepath}")
    
    def export_dataset(
        self,
        include_synthetic: bool = True,
        synthetic_limit: Optional[int] = 1000,
        shuffle: bool = True,
    ):
        """
        Main export function.
        
        Parameters:
        - include_synthetic: Whether to include synthetic preference pairs
        - synthetic_limit: Max number of synthetic pairs to generate
        - shuffle: Whether to shuffle before splitting
        """
        print("=" * 80)
        print("Exporting Training Dataset")
        print("=" * 80)
        
        # Load data
        print("\n1. Loading data...")
        preferences = self.load_preferences_from_db()
        snapshots = self.load_snapshots()
        changes = self.load_changes()
        
        # Create preference pairs from real user feedback
        print("\n2. Creating preference pairs from user feedback...")
        real_pairs = self.create_preference_pairs_from_events(preferences, snapshots, changes)
        
        # Add synthetic pairs
        all_pairs = real_pairs.copy()
        if include_synthetic:
            print("\n3. Generating synthetic preference pairs...")
            synthetic_pairs = self.add_synthetic_pairs(snapshots, limit=synthetic_limit)
            all_pairs.extend(synthetic_pairs)
        
        if not all_pairs:
            print("\n⚠️  No preference pairs generated. Check data sources.")
            return
        
        # Split dataset
        print("\n4. Splitting dataset...")
        train, val, test = self.split_dataset(all_pairs, shuffle=shuffle)
        
        # Export
        print("\n5. Exporting to JSONL...")
        self.export_jsonl(train, "train.jsonl")
        self.export_jsonl(val, "val.jsonl")
        self.export_jsonl(test, "test.jsonl")
        
        # Export metadata
        metadata = {
            'total_pairs': len(all_pairs),
            'real_pairs': len(real_pairs),
            'synthetic_pairs': len(all_pairs) - len(real_pairs),
            'train_count': len(train),
            'val_count': len(val),
            'test_count': len(test),
            'train_split': self.train_split,
            'val_split': self.val_split,
            'test_split': self.test_split,
        }
        with open(self.output_dir / "metadata.json", 'w') as f:
            json.dump(metadata, f, indent=2)
        
        print("\n" + "=" * 80)
        print("Export complete!")
        print(f"Output directory: {self.output_dir}")
        print(f"Total pairs: {len(all_pairs)} ({len(real_pairs)} real, {len(all_pairs) - len(real_pairs)} synthetic)")
        print("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Export training dataset for DPO")
    parser.add_argument(
        "--db-path",
        type=str,
        help="Path to SQLite database (default: udom-server/snapshots.db)"
    )
    parser.add_argument(
        "--snapshots-dir",
        type=str,
        help="Directory with JSON snapshots (default: udom-server/snapshots)"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="data/training_dataset",
        help="Output directory for training datasets"
    )
    parser.add_argument(
        "--no-synthetic",
        action="store_true",
        help="Skip synthetic preference generation"
    )
    parser.add_argument(
        "--synthetic-limit",
        type=int,
        default=1000,
        help="Max synthetic pairs to generate"
    )
    parser.add_argument(
        "--train-split",
        type=float,
        default=0.8,
        help="Training split ratio"
    )
    parser.add_argument(
        "--val-split",
        type=float,
        default=0.1,
        help="Validation split ratio"
    )
    
    args = parser.parse_args()
    
    exporter = DatasetExporter(
        db_path=args.db_path,
        snapshots_dir=args.snapshots_dir,
        output_dir=args.output_dir,
        train_split=args.train_split,
        val_split=args.val_split,
        test_split=1.0 - args.train_split - args.val_split,
    )
    
    exporter.export_dataset(
        include_synthetic=not args.no_synthetic,
        synthetic_limit=args.synthetic_limit,
    )


if __name__ == "__main__":
    main()

