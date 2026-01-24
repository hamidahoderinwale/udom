"""
Synthetic Preference Generator for Intent Rules

Generates preference pairs from generated rules using multiple heuristics:
1. Confidence-based: Higher confidence rules preferred over lower
2. Quality-based: Rules passing constitutional checks preferred
3. Completeness-based: Complete platform context preferred
4. Novelty-based: Novel patterns preferred over duplicates
5. Pattern frequency: Common patterns preferred over rare (for training stability)
6. Constitutional: Rules that recognize constitutional signals (iteration, correlation, etc.) preferred

Constitutional Principles Applied:
- Iteration Signal: Rules recognizing iteration patterns are preferred
- Semantic Depth: Rules with richer semantic content preferred
- Platform-Grounded: Rules with complete context preferred

Multi-dimensional grouping:
- Design dimensions: layout, interaction/flow, content, visual_hierarchy, spacing, typography, color
- Platform types: figma, canva, sketch, vscode, browser
- Artifact types: text, vector, frame, component, etc.

Preferences are generated within each dimension/type group for more targeted training.
"""

from typing import List, Dict, Optional, Tuple, Set
import random
from dataclasses import dataclass
import json
from collections import defaultdict

# Import shared platform keyword classifier
try:
    from .platform_keyword_classifier import PlatformKeywordClassifier, get_classifier
except ImportError:
    from platform_keyword_classifier import PlatformKeywordClassifier, get_classifier


@dataclass
class IntentRule:
    """
    Intent rule structure matching TypeScript types
    
    Features:
    - rule_id: Unique identifier
    - description: Human-readable rule description
    - scope: 'artifact_property' | 'structural' | 'relational' | 'compositional'
    - abstraction_level: 'specific' | 'intermediate' | 'general'
    - triggering_actions: List of actions that trigger this rule
    - artifact_properties: Optional list of relevant properties
    - confidence: Confidence score (0.0-1.0, default: 0.5)
    - platform_context: Platform-specific context (platform, version, etc.)
    - training_metadata: Training-related metadata
    - design_dimension: Design dimension (layout, interaction, content, visual_hierarchy, spacing, typography, color, etc.)
    """
    rule_id: str
    description: str
    scope: str  # 'artifact_property' | 'structural' | 'relational' | 'compositional'
    abstraction_level: str  # 'specific' | 'intermediate' | 'general'
    triggering_actions: List[str]
    artifact_properties: Optional[List[str]] = None
    confidence: float = 0.5
    platform_context: Optional[Dict] = None
    training_metadata: Optional[Dict] = None
    design_dimension: Optional[str] = None  # 'layout', 'interaction', 'content', 'visual_hierarchy', 'spacing', 'typography', 'color', etc.


@dataclass
class PreferencePair:
    """
    A preference pair for DPO training
    
    Features:
    - preferred: IntentRule that is preferred (for DPO: chosen)
    - rejected: IntentRule that is rejected (for DPO: not chosen)
    - source: Generation strategy ('confidence' | 'quality' | 'completeness' | 'novelty' | 'frequency')
    - synthetic: Whether pair is synthetic (default: True)
    - weight: Weight for DPO loss (default: 1.0, synthetic typically 0.3)
    - trace_context: Original trace that generated these rules (for DPO input)
    - dimension_group: Design dimension group (layout, interaction, etc.)
    - platform_group: Platform type group (figma, canva, etc.)
    - artifact_group: Artifact type group (text, vector, frame, etc.)
    """
    preferred: IntentRule
    rejected: IntentRule
    source: str  # 'confidence' | 'quality' | 'completeness' | 'novelty' | 'frequency'
    synthetic: bool = True
    weight: float = 1.0  # For weighting synthetic vs real preferences
    trace_context: Optional[Dict] = None  # Original trace that generated these rules
    dimension_group: Optional[str] = None  # Design dimension this pair belongs to
    platform_group: Optional[str] = None  # Platform type this pair belongs to
    artifact_group: Optional[str] = None  # Artifact type this pair belongs to


class SyntheticPreferenceGenerator:
    """
    Generate synthetic preference pairs from intent rules using multiple heuristics.
    
    This enables bootstrapping DPO training before collecting real user preferences.
    
    Multi-dimensional grouping:
    - Groups rules by design dimension (layout, interaction, content, etc.)
    - Groups rules by platform type (figma, canva, etc.)
    - Groups rules by artifact type (text, vector, frame, etc.)
    - Generates preferences within each group for targeted training
    """
    
    def __init__(
        self,
        confidence_threshold_high: float = 0.7,
        confidence_threshold_low: float = 0.4,
        min_novelty_score: float = 0.3,
        require_platform_context: bool = True,
        synthetic_weight: float = 0.3,  # Lower weight for synthetic pairs
        group_by_dimension: bool = True,  # Group preferences by design dimension
        group_by_platform: bool = True,  # Group preferences by platform type
        group_by_artifact: bool = True,  # Group preferences by artifact type
        keyword_classifier: Optional[PlatformKeywordClassifier] = None,
    ):
        """
        Initialize generator with quality thresholds.
        
        Parameters:
        - confidence_threshold_high: Rules ≥ this = "good" (default: 0.7)
        - confidence_threshold_low: Rules ≤ this = "poor" (default: 0.4)
        - min_novelty_score: Min novelty to avoid duplicates (default: 0.3)
        - require_platform_context: Require platform context in rules (default: True)
        - synthetic_weight: Weight for synthetic pairs in DPO loss (default: 0.3)
        - group_by_dimension: Group by design dimension (layout, interaction, etc.)
        - group_by_platform: Group by platform type (figma, canva, etc.)
        - group_by_artifact: Group by artifact type (text, vector, frame, etc.)
        - keyword_classifier: Shared classifier (uses singleton if None)
        
        Features:
        - Uses shared PlatformKeywordClassifier (singleton pattern)
        - Multi-dimensional grouping for targeted training
        """
        self.confidence_threshold_high = confidence_threshold_high
        self.confidence_threshold_low = confidence_threshold_low
        self.min_novelty_score = min_novelty_score
        self.require_platform_context = require_platform_context
        self.synthetic_weight = synthetic_weight
        self.group_by_dimension = group_by_dimension
        self.group_by_platform = group_by_platform
        self.group_by_artifact = group_by_artifact
        
        # Use shared keyword classifier (singleton pattern)
        self.keyword_classifier = keyword_classifier or get_classifier()
    
    
    def generate_preferences(
        self,
        rules: List[IntentRule],
        trace_context: Optional[Dict] = None,
        strategies: Optional[List[str]] = None
    ) -> List[PreferencePair]:
        """
        Generate preference pairs from a list of rules.
        
        Parameters:
        - rules: List of IntentRule objects from same trace
        - trace_context: Original trace context (for DPO input)
        - strategies: List of strategies to use (default: ['confidence', 'quality', 'completeness', 'novelty', 'frequency', 'constitutional'])
        
        Returns:
        - List of PreferencePair objects (deduplicated)
        
        Features:
        - Multi-dimensional grouping: Groups by dimension/platform/artifact, generates within groups
        - Strategies: confidence, quality (constitutional), completeness, novelty, frequency
        - Deduplication: Removes duplicate preferred/rejected combinations
        - Group keys: Format "{dimension}_{platform}_{artifact}" or subsets based on enabled grouping
        """
        if strategies is None:
            strategies = ['confidence', 'quality', 'completeness', 'novelty', 'frequency', 'constitutional']
        
        # Classify rules by dimension, platform, and artifact type
        classified_rules = self._classify_rules(rules)
        
        all_pairs = []
        
        # Generate preferences within each group
        for group_key, group_rules in classified_rules.items():
            if len(group_rules) < 2:
                continue  # Need at least 2 rules to create a pair
            
            pairs = []
            
            # Strategy 1: Confidence-based
            if 'confidence' in strategies:
                pairs.extend(self._generate_confidence_pairs(group_rules, trace_context, group_key))
            
            # Strategy 2: Quality-based (constitutional)
            if 'quality' in strategies:
                pairs.extend(self._generate_quality_pairs(group_rules, trace_context, group_key))
            
            # Strategy 3: Completeness-based
            if 'completeness' in strategies:
                pairs.extend(self._generate_completeness_pairs(group_rules, trace_context, group_key))
            
            # Strategy 4: Novelty-based
            if 'novelty' in strategies:
                pairs.extend(self._generate_novelty_pairs(group_rules, trace_context, group_key))
            
            # Strategy 5: Pattern frequency-based
            if 'frequency' in strategies:
                pairs.extend(self._generate_frequency_pairs(group_rules, trace_context, group_key))
            
            # Strategy 6: Constitutional (iteration-aware, semantic depth)
            if 'constitutional' in strategies:
                pairs.extend(self._generate_constitutional_pairs(group_rules, trace_context, group_key))
            
            all_pairs.extend(pairs)
        
        # Deduplicate pairs (same preferred/rejected combination)
        all_pairs = self._deduplicate_pairs(all_pairs)
        
        return all_pairs
    
    def _classify_rules(self, rules: List[IntentRule]) -> Dict[str, List[IntentRule]]:
        """
        Classify rules into groups by dimension, platform, and artifact type.
        
        Returns:
            Dict mapping group_key -> list of rules in that group
            Group key format: "dimension:platform:artifact" or "dimension" etc.
        """
        groups = defaultdict(list)
        
        for rule in rules:
            # Classify design dimension
            dimension = self._classify_design_dimension(rule)
            
            # Classify platform
            platform = self._classify_platform(rule)
            
            # Classify artifact type
            artifact = self._classify_artifact_type(rule)
            
            # Create group keys based on enabled grouping options
            if self.group_by_dimension and self.group_by_platform and self.group_by_artifact:
                group_key = f"{dimension}:{platform}:{artifact}"
            elif self.group_by_dimension and self.group_by_platform:
                group_key = f"{dimension}:{platform}"
            elif self.group_by_dimension and self.group_by_artifact:
                group_key = f"{dimension}:{artifact}"
            elif self.group_by_platform and self.group_by_artifact:
                group_key = f"{platform}:{artifact}"
            elif self.group_by_dimension:
                group_key = dimension
            elif self.group_by_platform:
                group_key = platform
            elif self.group_by_artifact:
                group_key = artifact
            else:
                group_key = "all"  # No grouping
            
            groups[group_key].append(rule)
        
        return dict(groups)
    
    def _classify_design_dimension(self, rule: IntentRule) -> str:
        """
        Classify rule into a design dimension using shared platform-aware classifier.
        """
        platform = self._classify_platform(rule)
        
        result = self.keyword_classifier.classify_dimension(
            description=rule.description,
            scope=rule.scope,
            explicit_dimension=rule.design_dimension,
            platform=platform if platform != 'unknown' else None
        )
        
        return result.dimension
    
    def learn_keywords_from_rules(self, rules: List[IntentRule], min_confidence: float = 0.6):
        """
        Learn platform-specific keywords from rules with explicit dimensions.
        Delegates to shared classifier.
        """
        rule_dicts = [
            {
                'design_dimension': rule.design_dimension,
                'platform_context': rule.platform_context or {},
                'description': rule.description
            }
            for rule in rules
            if rule.design_dimension and rule.platform_context
        ]
        
        self.keyword_classifier.learn_from_rules(rule_dicts, min_confidence)
    
    def update_keyword_rewards(self, min_accuracy: float = 0.6):
        """
        Update keyword reward scores based on classification performance.
        Delegates to shared classifier.
        """
        self.keyword_classifier.update_rewards(min_accuracy)
    
    def get_platform_keywords(self, platform: str, dimension: Optional[str] = None) -> Dict[str, Dict[str, float]]:
        """Get learned keywords for a platform. Delegates to shared classifier."""
        return self.keyword_classifier.get_platform_keywords(platform, dimension)
    
    def save_learned_keywords(self, filepath: str):
        """Save learned platform keywords. Delegates to shared classifier."""
        self.keyword_classifier.save(filepath)
    
    def load_learned_keywords(self, filepath: str):
        """Load learned platform keywords. Delegates to shared classifier."""
        self.keyword_classifier.load(filepath)
    
    def _classify_platform(self, rule: IntentRule) -> str:
        """Classify rule by platform type."""
        if rule.platform_context and rule.platform_context.get('platform'):
            return rule.platform_context['platform'].lower()
        return 'unknown'
    
    def _classify_artifact_type(self, rule: IntentRule) -> str:
        """Classify rule by artifact type."""
        if rule.artifact_properties:
            # Infer from artifact properties
            props_lower = [p.lower() for p in rule.artifact_properties]
            if any('text' in p or 'font' in p for p in props_lower):
                return 'text'
            elif any('vector' in p or 'path' in p for p in props_lower):
                return 'vector'
            elif any('frame' in p or 'container' in p for p in props_lower):
                return 'frame'
            elif any('component' in p for p in props_lower):
                return 'component'
        
        # Infer from description
        desc_lower = rule.description.lower()
        if 'text' in desc_lower or 'typography' in desc_lower:
            return 'text'
        elif 'vector' in desc_lower or 'shape' in desc_lower:
            return 'vector'
        elif 'frame' in desc_lower or 'container' in desc_lower:
            return 'frame'
        elif 'component' in desc_lower:
            return 'component'
        
        return 'general'
    
    def _generate_confidence_pairs(
        self,
        rules: List[IntentRule],
        trace_context: Optional[Dict],
        group_key: Optional[str] = None
    ) -> List[PreferencePair]:
        """Generate pairs based on confidence scores"""
        pairs = []
        
        high_conf_rules = [r for r in rules if r.confidence >= self.confidence_threshold_high]
        low_conf_rules = [r for r in rules if r.confidence <= self.confidence_threshold_low]
        
        # Extract group metadata
        dimension, platform, artifact = self._parse_group_key(group_key)
        
        for preferred in high_conf_rules:
            for rejected in low_conf_rules:
                # Ensure they're different rules
                if preferred.rule_id != rejected.rule_id:
                    pairs.append(PreferencePair(
                        preferred=preferred,
                        rejected=rejected,
                        source='confidence',
                        synthetic=True,
                        weight=self.synthetic_weight,
                        trace_context=trace_context,
                        dimension_group=dimension,
                        platform_group=platform,
                        artifact_group=artifact
                    ))
        
        return pairs
    
    def _generate_quality_pairs(
        self,
        rules: List[IntentRule],
        trace_context: Optional[Dict],
        group_key: Optional[str] = None
    ) -> List[PreferencePair]:
        """Generate pairs based on constitutional quality checks"""
        pairs = []
        
        quality_rules = []
        poor_quality_rules = []
        
        for rule in rules:
            quality_score = self._compute_quality_score(rule)
            
            if quality_score >= 0.8:
                quality_rules.append(rule)
            elif quality_score <= 0.5:
                poor_quality_rules.append(rule)
        
        # Extract group metadata
        dimension, platform, artifact = self._parse_group_key(group_key)
        
        for preferred in quality_rules:
            for rejected in poor_quality_rules:
                if preferred.rule_id != rejected.rule_id:
                    pairs.append(PreferencePair(
                        preferred=preferred,
                        rejected=rejected,
                        source='quality',
                        synthetic=True,
                        weight=self.synthetic_weight,
                        trace_context=trace_context,
                        dimension_group=dimension,
                        platform_group=platform,
                        artifact_group=artifact
                    ))
        
        return pairs
    
    def _generate_completeness_pairs(
        self,
        rules: List[IntentRule],
        trace_context: Optional[Dict],
        group_key: Optional[str] = None
    ) -> List[PreferencePair]:
        """Generate pairs based on platform context completeness"""
        pairs = []
        
        complete_rules = []
        incomplete_rules = []
        
        for rule in rules:
            if self._is_complete(rule):
                complete_rules.append(rule)
            else:
                incomplete_rules.append(rule)
        
        # Extract group metadata
        dimension, platform, artifact = self._parse_group_key(group_key)
        
        for preferred in complete_rules:
            for rejected in incomplete_rules:
                if preferred.rule_id != rejected.rule_id:
                    pairs.append(PreferencePair(
                        preferred=preferred,
                        rejected=rejected,
                        source='completeness',
                        synthetic=True,
                        weight=self.synthetic_weight,
                        trace_context=trace_context,
                        dimension_group=dimension,
                        platform_group=platform,
                        artifact_group=artifact
                    ))
        
        return pairs
    
    def _generate_novelty_pairs(
        self,
        rules: List[IntentRule],
        trace_context: Optional[Dict],
        group_key: Optional[str] = None
    ) -> List[PreferencePair]:
        """Generate pairs based on novelty scores"""
        pairs = []
        
        novel_rules = []
        duplicate_rules = []
        
        for rule in rules:
            if rule.training_metadata:
                novelty = rule.training_metadata.get('novelty_score', 0.5)
                if novelty >= 0.7:
                    novel_rules.append(rule)
                elif novelty <= 0.3:
                    duplicate_rules.append(rule)
        
        # Extract group metadata
        dimension, platform, artifact = self._parse_group_key(group_key)
        
        for preferred in novel_rules:
            for rejected in duplicate_rules:
                if preferred.rule_id != rejected.rule_id:
                    pairs.append(PreferencePair(
                        preferred=preferred,
                        rejected=rejected,
                        source='novelty',
                        synthetic=True,
                        weight=self.synthetic_weight,
                        trace_context=trace_context,
                        dimension_group=dimension,
                        platform_group=platform,
                        artifact_group=artifact
                    ))
        
        return pairs
    
    def _generate_frequency_pairs(
        self,
        rules: List[IntentRule],
        trace_context: Optional[Dict],
        group_key: Optional[str] = None
    ) -> List[PreferencePair]:
        """Generate pairs based on pattern frequency (common > rare for training stability)"""
        pairs = []
        
        common_rules = []
        rare_rules = []
        
        for rule in rules:
            if rule.training_metadata:
                frequency = rule.training_metadata.get('pattern_frequency', 'uncommon')
                if frequency == 'common':
                    common_rules.append(rule)
                elif frequency == 'rare':
                    rare_rules.append(rule)
        
        # Extract group metadata
        dimension, platform, artifact = self._parse_group_key(group_key)
        
        for preferred in common_rules:
            for rejected in rare_rules:
                if preferred.rule_id != rejected.rule_id:
                    pairs.append(PreferencePair(
                        preferred=preferred,
                        rejected=rejected,
                        source='frequency',
                        synthetic=True,
                        weight=self.synthetic_weight,
                        trace_context=trace_context,
                        dimension_group=dimension,
                        platform_group=platform,
                        artifact_group=artifact
                    ))
        
        return pairs
    
    def _generate_constitutional_pairs(
        self,
        rules: List[IntentRule],
        trace_context: Optional[Dict],
        group_key: Optional[str] = None
    ) -> List[PreferencePair]:
        """
        Generate pairs based on constitutional principles.
        
        Constitutional Principles Applied:
        - Iteration Signal: Rules recognizing iteration patterns are preferred
        - Semantic Depth: Rules with richer semantic content preferred  
        - Platform-Grounded: Rules with complete context preferred
        
        A rule is considered "constitutionally strong" if it:
        1. Explicitly mentions iteration/refinement patterns
        2. Has semantic richness (mentions purpose, not just action)
        3. Has complete platform context
        """
        pairs = []
        
        constitutional_rules = []
        weak_rules = []
        
        for rule in rules:
            score = self._compute_constitutional_score(rule)
            if score >= 0.7:
                constitutional_rules.append((rule, score))
            elif score <= 0.4:
                weak_rules.append((rule, score))
        
        # Extract group metadata
        dimension, platform, artifact = self._parse_group_key(group_key)
        
        for preferred, _ in constitutional_rules:
            for rejected, _ in weak_rules:
                if preferred.rule_id != rejected.rule_id:
                    pairs.append(PreferencePair(
                        preferred=preferred,
                        rejected=rejected,
                        source='constitutional',
                        synthetic=True,
                        weight=self.synthetic_weight * 1.2,  # Slightly higher weight for constitutional pairs
                        trace_context=trace_context,
                        dimension_group=dimension,
                        platform_group=platform,
                        artifact_group=artifact
                    ))
        
        return pairs
    
    def _compute_constitutional_score(self, rule: IntentRule) -> float:
        """
        Compute constitutional score for a rule.
        
        Checks for:
        1. Iteration signal detection (principle #1)
        2. Semantic depth (principle #16)
        3. Platform grounding (principle #17)
        4. Constitutional signals in training_metadata
        """
        score = 0.0
        
        # Check for iteration signal keywords in description
        iteration_keywords = [
            'iterative', 'refine', 'adjust', 'return', 'revisit', 
            'again', 'further', 'continue', 'polish', 'tweak'
        ]
        desc_lower = rule.description.lower()
        if any(kw in desc_lower for kw in iteration_keywords):
            score += 0.25
        
        # Check for semantic depth (mentions purpose/why, not just what)
        semantic_keywords = [
            'for', 'to improve', 'to enhance', 'for readability', 'for hierarchy',
            'alignment', 'consistency', 'balance', 'emphasis', 'clarity'
        ]
        if any(kw in desc_lower for kw in semantic_keywords):
            score += 0.25
        
        # Check platform grounding completeness
        if rule.platform_context:
            pc = rule.platform_context
            if pc.get('platform') and pc.get('extraction_method'):
                score += 0.15
            if pc.get('api_endpoints') or pc.get('data_source'):
                score += 0.1
        
        # Check for constitutional signals in training_metadata
        if rule.training_metadata:
            signals = rule.training_metadata.get('constitutional_signals', [])
            if signals:
                score += 0.15 * min(len(signals), 2)  # Up to 0.3 for signals
            
            # Check iteration_detected flag
            if rule.training_metadata.get('iteration_detected'):
                score += 0.15
        
        return min(1.0, score)
    
    def _has_iteration_signal(self, rule: IntentRule) -> bool:
        """
        Check if a rule explicitly recognizes iteration patterns.
        
        Constitutional Principle #1: When a component is returned to 
        in a subsequent action, this indicates iterative refinement.
        """
        # Check description for iteration language
        iteration_keywords = [
            'iterative', 'refine', 'adjust', 'return', 'revisit',
            'again', 'further', 'continue', 'polish', 'tweak',
            'repeat', 'cycle', 'loop'
        ]
        desc_lower = rule.description.lower()
        if any(kw in desc_lower for kw in iteration_keywords):
            return True
        
        # Check training_metadata for iteration flag
        if rule.training_metadata:
            if rule.training_metadata.get('iteration_detected'):
                return True
            signals = rule.training_metadata.get('constitutional_signals', [])
            if 'iteration' in signals or 'iteration_signal' in signals:
                return True
        
        return False
    
    def _parse_group_key(self, group_key: Optional[str]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """Parse group key into dimension, platform, artifact components."""
        if not group_key or group_key == "all":
            return None, None, None
        
        parts = group_key.split(':')
        dimension = parts[0] if len(parts) > 0 else None
        platform = parts[1] if len(parts) > 1 else None
        artifact = parts[2] if len(parts) > 2 else None
        
        return dimension, platform, artifact
    
    def _compute_quality_score(self, rule: IntentRule) -> float:
        """
        Compute constitutional quality score for a rule.
        
        Checks:
        - Schema compliance (required fields present)
        - Description quality (length, clarity)
        - Platform context completeness
        - Training metadata presence
        """
        score = 0.0
        checks = 0
        
        # Required fields check
        if rule.rule_id and rule.description and rule.scope:
            score += 0.2
        checks += 1
        
        # Description quality
        if len(rule.description) <= 150 and len(rule.description.split()) <= 20:
            score += 0.2
        checks += 1
        
        # Platform context completeness
        if rule.platform_context:
            if rule.platform_context.get('platform') and rule.platform_context.get('extraction_method'):
                score += 0.2
            if rule.platform_context.get('api_endpoints'):
                score += 0.1
        checks += 1
        
        # Training metadata
        if rule.training_metadata:
            if rule.training_metadata.get('suitable_for_training'):
                score += 0.2
            if rule.training_metadata.get('novelty_score', 0) >= self.min_novelty_score:
                score += 0.1
        checks += 1
        
        return score
    
    def _is_complete(self, rule: IntentRule) -> bool:
        """Check if rule has complete platform context"""
        if not rule.platform_context:
            return False
        
        required = ['platform', 'extraction_method']
        return all(key in rule.platform_context for key in required)
    
    def _deduplicate_pairs(self, pairs: List[PreferencePair]) -> List[PreferencePair]:
        """Remove duplicate preference pairs"""
        seen = set()
        unique_pairs = []
        
        for pair in pairs:
            key = (pair.preferred.rule_id, pair.rejected.rule_id)
            if key not in seen:
                seen.add(key)
                unique_pairs.append(pair)
        
        return unique_pairs
    
    def generate_from_trace_batch(
        self,
        trace_rules: Dict[str, List[IntentRule]],
        strategies: Optional[List[str]] = None
    ) -> List[PreferencePair]:
        """
        Generate preferences from a batch of traces.
        
        Args:
            trace_rules: Dict mapping trace_id -> list of rules
            strategies: Which strategies to use
        
        Returns:
            List of all preference pairs
        """
        all_pairs = []
        
        for trace_id, rules in trace_rules.items():
            trace_context = {'trace_id': trace_id}
            pairs = self.generate_preferences(rules, trace_context, strategies)
            all_pairs.extend(pairs)
        
        return all_pairs
    
    def format_for_dpo(
        self,
        pairs: List[PreferencePair],
        include_weights: bool = True,
        include_grouping: bool = True
    ) -> List[Dict]:
        """
        Format preference pairs for DPO training.
        
        Returns format:
        {
            "input": {...trace_context...},
            "preferred": {...rule...},
            "rejected": {...rule...},
            "source": "synthetic" | "user_feedback" | "production" | "manual",
            "type": "auto_suggestion" | "user_request" | "manual_entry" | "batch_import",
            "weight": 0.3 (if synthetic),
            "dimension_group": "layout" (if grouping enabled),
            "platform_group": "figma" (if grouping enabled),
            "artifact_group": "text" (if grouping enabled)
        }
        """
        dpo_examples = []
        
        for pair in pairs:
            example = {
                'input': pair.trace_context or {},
                'preferred': self._rule_to_dict(pair.preferred),
                'rejected': self._rule_to_dict(pair.rejected),
                'source': 'synthetic' if pair.synthetic else 'production',  # Required field
                'type': 'batch_import',  # Synthetic preferences are batch imported
                'synthetic': pair.synthetic,
            }
            
            if include_weights and pair.synthetic:
                example['weight'] = pair.weight
            
            if include_grouping:
                if pair.dimension_group:
                    example['dimension_group'] = pair.dimension_group
                if pair.platform_group:
                    example['platform_group'] = pair.platform_group
                if pair.artifact_group:
                    example['artifact_group'] = pair.artifact_group
            
            dpo_examples.append(example)
        
        return dpo_examples
    
    def get_group_statistics(self, pairs: List[PreferencePair]) -> Dict[str, Dict]:
        """
        Get statistics about preference pairs grouped by dimension/platform/artifact.
        
        Returns:
            Dict with statistics for each group
        """
        stats = defaultdict(lambda: {
            'count': 0,
            'sources': defaultdict(int),
            'dimensions': set(),
            'platforms': set(),
            'artifacts': set(),
        })
        
        for pair in pairs:
            # Create group key
            if pair.dimension_group and pair.platform_group and pair.artifact_group:
                group_key = f"{pair.dimension_group}:{pair.platform_group}:{pair.artifact_group}"
            elif pair.dimension_group and pair.platform_group:
                group_key = f"{pair.dimension_group}:{pair.platform_group}"
            elif pair.dimension_group:
                group_key = pair.dimension_group
            else:
                group_key = "ungrouped"
            
            stats[group_key]['count'] += 1
            stats[group_key]['sources'][pair.source] += 1
            if pair.dimension_group:
                stats[group_key]['dimensions'].add(pair.dimension_group)
            if pair.platform_group:
                stats[group_key]['platforms'].add(pair.platform_group)
            if pair.artifact_group:
                stats[group_key]['artifacts'].add(pair.artifact_group)
        
        # Convert sets to lists for JSON serialization
        result = {}
        for key, data in stats.items():
            result[key] = {
                'count': data['count'],
                'sources': dict(data['sources']),
                'dimensions': list(data['dimensions']),
                'platforms': list(data['platforms']),
                'artifacts': list(data['artifacts']),
            }
        
        return result
    
    def _rule_to_dict(self, rule: IntentRule) -> Dict:
        """Convert IntentRule to dictionary"""
        return {
            'rule_id': rule.rule_id,
            'description': rule.description,
            'scope': rule.scope,
            'abstraction_level': rule.abstraction_level,
            'triggering_actions': rule.triggering_actions,
            'artifact_properties': rule.artifact_properties or [],
            'confidence': rule.confidence,
            'platform_context': rule.platform_context or {},
            'training_metadata': rule.training_metadata or {},
        }


def load_rules_from_generated_file(filepath: str) -> Dict[str, List[IntentRule]]:
    """
    Load rules from generated rules JSON file.
    
    Expected format: Each line is a JSON object with:
    {
        "trace_id": "...",
        "intent_rules": [...],
        "metadata": {...}
    }
    """
    trace_rules = {}
    
    with open(filepath, 'r') as f:
        for line in f:
            if line.strip():
                data = json.loads(line)
                trace_id = data.get('trace_id') or data.get('metadata', {}).get('batch_id', 'unknown')
                rules_data = data.get('intent_rules', [])
                
                rules = []
                for rule_data in rules_data:
                    rule = IntentRule(
                        rule_id=rule_data['rule_id'],
                        description=rule_data['description'],
                        scope=rule_data['scope'],
                        abstraction_level=rule_data['abstraction_level'],
                        triggering_actions=rule_data['triggering_actions'],
                        artifact_properties=rule_data.get('artifact_properties'),
                        confidence=rule_data['confidence'],
                        platform_context=rule_data.get('platform_context'),
                        training_metadata=rule_data.get('training_metadata'),
                    )
                    rules.append(rule)
                
                trace_rules[trace_id] = rules
    
    return trace_rules



