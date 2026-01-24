"""
Schema validation utilities for uDOM snapshots, rules, and preferences

Requires jsonschema package for full schema validation.
Install with: pip install jsonschema
"""

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import jsonschema
from jsonschema import validate, ValidationError


class SchemaValidator:
    """Validate data against JSON schemas"""
    
    def __init__(self, schemas_dir: Optional[Path] = None):
        """Initialize validator with schema directory"""
        if schemas_dir is None:
            schemas_dir = Path(__file__).parent.parent / 'data' / 'schemas'
        
        self.schemas_dir = Path(schemas_dir)
        self._schemas: Dict[str, Dict] = {}
    
    def load_schema(self, name: str) -> Dict:
        """Load a schema by name"""
        if name in self._schemas:
            return self._schemas[name]
        
        schema_path = self.schemas_dir / f"{name}.json"
        if not schema_path.exists():
            raise FileNotFoundError(f"Schema {name} not found at {schema_path}")
        
        with open(schema_path, 'r') as f:
            schema = json.load(f)
        
        self._schemas[name] = schema
        return schema
    
    def validate_snapshot(self, snapshot: Dict, schema_name: str = 'figma_udom_completed') -> Tuple[bool, List[str]]:
        """Validate a completed snapshot against schema"""
        errors = []
        schema = self.load_schema(schema_name)
        
        try:
            validate(instance=snapshot, schema=schema)
            return True, []
        except ValidationError as e:
            errors.append(f"Validation error: {e.message}")
            if e.path:
                errors.append(f"  Path: {'.'.join(str(p) for p in e.path)}")
            return False, errors
        except Exception as e:
            errors.append(f"Unexpected error: {e}")
            return False, errors
    
    def validate_rule(self, rule: Dict) -> Tuple[bool, List[str]]:
        """Validate an intent rule against system prompt schema"""
        errors = []
        
        # Required fields
        required_fields = [
            'rule_id', 'description', 'scope', 'abstraction_level',
            'triggering_actions', 'confidence', 'platform_context'
        ]
        
        for field in required_fields:
            if field not in rule:
                errors.append(f"Missing required field: {field}")
        
        # Confidence range
        if 'confidence' in rule:
            conf = rule['confidence']
            if not isinstance(conf, (int, float)) or conf < 0.0 or conf > 1.0:
                errors.append(f"Invalid confidence: {conf} (must be 0.0-1.0)")
        
        # Description length
        if 'description' in rule:
            desc = rule['description']
            words = len(desc.split())
            if words > 20:
                errors.append(f"Description too long: {words} words (max 20)")
        
        # Scope enum
        if 'scope' in rule:
            valid_scopes = ['artifact_property', 'structural', 'relational', 'compositional']
            if rule['scope'] not in valid_scopes:
                errors.append(f"Invalid scope: {rule['scope']} (must be one of {valid_scopes})")
        
        # Abstraction level enum
        if 'abstraction_level' in rule:
            valid_levels = ['specific', 'intermediate', 'general']
            if rule['abstraction_level'] not in valid_levels:
                errors.append(f"Invalid abstraction_level: {rule['abstraction_level']}")
        
        # Platform context
        if 'platform_context' in rule:
            pc = rule['platform_context']
            if not isinstance(pc, dict):
                errors.append("platform_context must be a dictionary")
            else:
                if 'platform' not in pc:
                    errors.append("platform_context missing 'platform'")
                if 'extraction_method' not in pc:
                    errors.append("platform_context missing 'extraction_method'")
        
        return len(errors) == 0, errors
    
    def validate_preference_pair(self, pair: Dict) -> Tuple[bool, List[str]]:
        """Validate a DPO preference pair"""
        errors = []
        
        # Required fields
        required_fields = ['input', 'preferred', 'rejected']
        
        for field in required_fields:
            if field not in pair:
                errors.append(f"Missing required field: {field}")
        
        # Validate preferred and rejected rules
        if 'preferred' in pair:
            is_valid, rule_errors = self.validate_rule(pair['preferred'])
            if not is_valid:
                errors.extend([f"Preferred rule: {e}" for e in rule_errors])
        
        if 'rejected' in pair:
            is_valid, rule_errors = self.validate_rule(pair['rejected'])
            if not is_valid:
                errors.extend([f"Rejected rule: {e}" for e in rule_errors])
        
        # Weight (optional but should be 0.0-1.0 if present)
        if 'weight' in pair:
            weight = pair['weight']
            if not isinstance(weight, (int, float)) or weight < 0.0 or weight > 1.0:
                errors.append(f"Invalid weight: {weight} (must be 0.0-1.0)")
        
        return len(errors) == 0, errors
    
    def validate_batch(self, items: List[Dict], validator_func) -> Dict:
        """Validate a batch of items"""
        results = {
            'total': len(items),
            'valid': 0,
            'invalid': 0,
            'errors': []
        }
        
        for i, item in enumerate(items):
            is_valid, errors = validator_func(item)
            if is_valid:
                results['valid'] += 1
            else:
                results['invalid'] += 1
                results['errors'].append({
                    'index': i,
                    'errors': errors
                })
        
        return results


def validate_snapshot_file(file_path: Path) -> Dict:
    """Validate a snapshot file"""
    validator = SchemaValidator()
    
    with open(file_path, 'r') as f:
        snapshot = json.load(f)
    
    is_valid, errors = validator.validate_snapshot(snapshot)
    
    return {
        'valid': is_valid,
        'errors': errors,
        'file': str(file_path)
    }


def validate_rules_file(file_path: Path) -> Dict:
    """Validate a rules JSONL file"""
    validator = SchemaValidator()
    
    rules = []
    with open(file_path, 'r') as f:
        for line_num, line in enumerate(f, 1):
            if line.strip():
                try:
                    rule_data = json.loads(line)
                    # Extract rules from output format
                    if 'intent_rules' in rule_data:
                        rules.extend(rule_data['intent_rules'])
                    else:
                        rules.append(rule_data)
                except json.JSONDecodeError as e:
                    return {
                        'valid': False,
                        'errors': [f"Line {line_num}: Invalid JSON - {e}"],
                        'file': str(file_path)
                    }
    
    results = validator.validate_batch(rules, validator.validate_rule)
    results['file'] = str(file_path)
    
    return results


def validate_preferences_file(file_path: Path) -> Dict:
    """Validate a preferences JSONL file"""
    validator = SchemaValidator()
    
    preferences = []
    with open(file_path, 'r') as f:
        for line_num, line in enumerate(f, 1):
            if line.strip():
                try:
                    pref = json.loads(line)
                    preferences.append(pref)
                except json.JSONDecodeError as e:
                    return {
                        'valid': False,
                        'errors': [f"Line {line_num}: Invalid JSON - {e}"],
                        'file': str(file_path)
                    }
    
    results = validator.validate_batch(preferences, validator.validate_preference_pair)
    results['file'] = str(file_path)
    
    return results


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Validate data files')
    parser.add_argument('file', type=Path, help='File to validate')
    parser.add_argument('--type', choices=['snapshot', 'rules', 'preferences'], 
                       required=True, help='Type of file')
    
    args = parser.parse_args()
    
    if args.type == 'snapshot':
        result = validate_snapshot_file(args.file)
    elif args.type == 'rules':
        result = validate_rules_file(args.file)
    elif args.type == 'preferences':
        result = validate_preferences_file(args.file)
    
    if result['valid']:
        print(f"VALID: {args.file}")
        if 'total' in result:
            print(f"  Valid items: {result['valid']}/{result['total']}")
    else:
        print(f"INVALID: {args.file}")
        for error in result['errors']:
            if isinstance(error, dict):
                print(f"  Item {error['index']}: {', '.join(error['errors'])}")
            else:
                print(f"  {error}")

