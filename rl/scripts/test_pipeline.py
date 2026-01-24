#!/usr/bin/env python3
"""
Quick test script to verify the preference training pipeline data connection.
Tests snapshot loading, rule generation setup, and preference generation.
"""

import sys
from pathlib import Path

# Add rl/ to path
rl_path = Path(__file__).parent.parent
if str(rl_path) not in sys.path:
    sys.path.insert(0, str(rl_path))

from utils.loaders.snapshot_loader import SnapshotLoader
from utils.loaders.prompt_loader import PromptLoader
from core.synthetic_preference_generator import SyntheticPreferenceGenerator, IntentRule

def test_snapshot_loading():
    """Test 1: Verify snapshots can be loaded"""
    print("=" * 60)
    print("TEST 1: Snapshot Loading")
    print("=" * 60)
    
    loader = SnapshotLoader()
    stats = loader.get_stats()
    
    print(f"[PASS] Storage type: {stats.get('storage')}")
    print(f"[PASS] Total snapshots: {stats.get('total_snapshots')}")
    print(f"[PASS] By type: {stats.get('by_type', {})}")
    
    snapshots = loader.load_recent(limit=5)
    print(f"[PASS] Loaded {len(snapshots)} recent snapshots")
    
    if snapshots:
        sample = snapshots[0]
        print(f"[PASS] Sample snapshot ID: {sample.get('metadata', {}).get('snapshot_id', 'unknown')[:12]}...")
        print(f"[PASS] Sample artifact type: {sample.get('metadata', {}).get('artifact_type', 'unknown')}")
    
    return len(snapshots) > 0

def test_prompt_loading():
    """Test 2: Verify prompts can be loaded"""
    print("\n" + "=" * 60)
    print("TEST 2: Prompt Loading")
    print("=" * 60)
    
    loader = PromptLoader()
    
    try:
        generator_prompt = loader.load_prompt('generator')
        print(f"[PASS] Generator prompt loaded: {generator_prompt.get('name')} v{generator_prompt.get('version')}")
        print(f"[PASS] Prompt length: {len(generator_prompt.get('prompt_text', '')):,} chars")
    except Exception as e:
        print(f"[FAIL] Failed to load generator prompt: {e}")
        return False
    
    try:
        matcher_prompt = loader.load_prompt('matcher')
        print(f"[PASS] Matcher prompt loaded: {matcher_prompt.get('name')} v{matcher_prompt.get('version')}")
    except Exception as e:
        print(f"[FAIL] Failed to load matcher prompt: {e}")
        return False
    
    return True

def test_preference_generation():
    """Test 3: Verify preference generation works"""
    print("\n" + "=" * 60)
    print("TEST 3: Preference Generation")
    print("=" * 60)
    
    # Disable grouping for test to ensure pairs are generated
    generator = SyntheticPreferenceGenerator(
        confidence_threshold_high=0.7,
        confidence_threshold_low=0.4,
        min_novelty_score=0.3,
        synthetic_weight=0.3,
        group_by_dimension=False,  # Disable grouping for test
        group_by_platform=False,
        group_by_artifact=False,
        require_platform_context=False  # More lenient for test
    )
    
    # Create sample rules
    sample_rules = [
        IntentRule(
            rule_id='test_rule_1',
            description='Increase spacing for better readability',
            scope='artifact_property',
            abstraction_level='intermediate',
            triggering_actions=['modify_property'],
            confidence=0.85,
            platform_context={'platform': 'figma', 'extraction_method': 'plugin_api'},
            training_metadata={'suitable_for_training': True, 'novelty_score': 0.8, 'pattern_frequency': 'common'}
        ),
        IntentRule(
            rule_id='test_rule_2',
            description='User changes something',
            scope='structural',
            abstraction_level='general',
            triggering_actions=['modify'],
            confidence=0.35,
            platform_context={'platform': 'figma'},
            training_metadata={'suitable_for_training': False, 'novelty_score': 0.2, 'pattern_frequency': 'rare'}
        ),
    ]
    
    try:
        pairs = generator.generate_preferences(
            sample_rules,
            trace_context={'trace_id': 'test', 'platform': 'figma'},
            strategies=['confidence', 'quality']
        )
        print(f"[PASS] Generated {len(pairs)} preference pairs")
        
        if pairs:
            pair = pairs[0]
            print(f"[PASS] Sample pair source: {pair.source}")
            print(f"[PASS] Preferred: {pair.preferred.description[:50]}...")
            print(f"[PASS] Rejected: {pair.rejected.description[:50]}...")
        
        return len(pairs) > 0
    except Exception as e:
        print(f"[FAIL] Preference generation failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_dataset_formatting():
    """Test 4: Verify DPO dataset formatting"""
    print("\n" + "=" * 60)
    print("TEST 4: DPO Dataset Formatting")
    print("=" * 60)
    
    # Disable grouping for test
    generator = SyntheticPreferenceGenerator(
        group_by_dimension=False,
        group_by_platform=False,
        group_by_artifact=False,
        require_platform_context=False
    )
    
    sample_rules = [
        IntentRule(
            rule_id='test_rule_1',
            description='Increase spacing for better readability',
            scope='artifact_property',
            abstraction_level='intermediate',
            triggering_actions=['modify_property'],
            confidence=0.85,
            platform_context={'platform': 'figma'},
            training_metadata={'suitable_for_training': True, 'novelty_score': 0.8, 'pattern_frequency': 'common'}
        ),
        IntentRule(
            rule_id='test_rule_2',
            description='User changes something',
            scope='structural',
            abstraction_level='general',
            triggering_actions=['modify'],
            confidence=0.35,
            platform_context={'platform': 'figma'},
            training_metadata={'suitable_for_training': False, 'novelty_score': 0.2, 'pattern_frequency': 'rare'}
        ),
    ]
    
    pairs = generator.generate_preferences(
        sample_rules,
        trace_context={'trace_id': 'test', 'platform': 'figma'},
        strategies=['confidence']
    )
    
    try:
        dpo_examples = generator.format_for_dpo(pairs, include_weights=True)
        print(f"[PASS] Formatted {len(dpo_examples)} DPO examples")
        
        if dpo_examples:
            example = dpo_examples[0]
            required_fields = ['input', 'preferred', 'rejected']
            missing = [f for f in required_fields if f not in example]
            
            if missing:
                print(f"[FAIL] Missing fields: {missing}")
                return False
            
            print(f"[PASS] Example has all required fields: {required_fields}")
            print(f"[PASS] Example weight: {example.get('weight', 'N/A')}")
            print(f"[PASS] Example source: {example.get('source', 'N/A')}")
        
        return len(dpo_examples) > 0
    except Exception as e:
        print(f"[FAIL] Dataset formatting failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all tests"""
    print("\n" + "=" * 60)
    print("PREFERENCE TRAINING PIPELINE - DATA CONNECTION TEST")
    print("=" * 60)
    
    results = []
    
    results.append(("Snapshot Loading", test_snapshot_loading()))
    results.append(("Prompt Loading", test_prompt_loading()))
    results.append(("Preference Generation", test_preference_generation()))
    results.append(("Dataset Formatting", test_dataset_formatting()))
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    for test_name, passed in results:
        status = "[PASS]" if passed else "[FAIL]"
        print(f"{status}: {test_name}")
    
    all_passed = all(passed for _, passed in results)
    
    if all_passed:
        print("\n[SUCCESS] All tests passed! Pipeline is ready.")
        print("\nNext steps:")
        print("1. Run notebook 03_rule_generation.ipynb to generate rules from snapshots")
        print("2. Run notebook 04_dataset_building.ipynb to build training dataset")
        print("3. Run notebook 06_pre_training_validation.ipynb to validate")
        print("4. Run DPO training")
    else:
        print("\n[WARNING] Some tests failed. Fix issues before proceeding.")
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())

