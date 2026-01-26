"""
Quality metrics for evaluating rules and preference pairs
"""

from typing import Dict, List, Optional
from collections import Counter
from dataclasses import dataclass


@dataclass
class RuleQualityMetrics:
    """Quality metrics for a set of rules"""
    total_rules: int
    avg_confidence: float
    min_confidence: float
    max_confidence: float
    scope_distribution: Dict[str, int]
    abstraction_distribution: Dict[str, int]
    completeness_score: float  # 0.0-1.0
    novelty_score: float  # 0.0-1.0
    quality_score: float  # 0.0-1.0


@dataclass
class PreferenceQualityMetrics:
    """Quality metrics for preference pairs"""
    total_pairs: int
    avg_confidence_gap: float
    min_confidence_gap: float
    max_confidence_gap: float
    source_distribution: Dict[str, int]
    weight_distribution: Dict[str, int]
    quality_score: float  # 0.0-1.0


class QualityMetrics:
    """Compute quality metrics for rules and preferences"""
    
    @staticmethod
    def compute_rule_quality(rules: List[Dict]) -> RuleQualityMetrics:
        """Compute quality metrics for a set of rules"""
        if not rules:
            return RuleQualityMetrics(
                total_rules=0,
                avg_confidence=0.0,
                min_confidence=0.0,
                max_confidence=0.0,
                scope_distribution={},
                abstraction_distribution={},
                completeness_score=0.0,
                novelty_score=0.0,
                quality_score=0.0
            )
        
        confidences = [r.get('confidence', 0.5) for r in rules]
        scopes = Counter(r.get('scope', 'unknown') for r in rules)
        abstraction_levels = Counter(r.get('abstraction_level', 'unknown') for r in rules)
        
        # Completeness: % with complete platform context
        complete_count = 0
        for rule in rules:
            pc = rule.get('platform_context', {})
            if pc.get('platform') and pc.get('extraction_method'):
                complete_count += 1
        completeness_score = complete_count / len(rules) if rules else 0.0
        
        # Novelty: average novelty score
        novelty_scores = []
        for rule in rules:
            tm = rule.get('training_metadata', {})
            if 'novelty_score' in tm:
                novelty_scores.append(tm['novelty_score'])
        novelty_score = sum(novelty_scores) / len(novelty_scores) if novelty_scores else 0.0
        
        # Overall quality score (weighted combination)
        quality_score = (
            0.4 * (sum(confidences) / len(confidences)) +
            0.3 * completeness_score +
            0.3 * novelty_score
        )
        
        return RuleQualityMetrics(
            total_rules=len(rules),
            avg_confidence=sum(confidences) / len(confidences),
            min_confidence=min(confidences),
            max_confidence=max(confidences),
            scope_distribution=dict(scopes),
            abstraction_distribution=dict(abstraction_levels),
            completeness_score=completeness_score,
            novelty_score=novelty_score,
            quality_score=quality_score
        )
    
    @staticmethod
    def compute_preference_quality(pairs: List[Dict]) -> PreferenceQualityMetrics:
        """Compute quality metrics for preference pairs"""
        if not pairs:
            return PreferenceQualityMetrics(
                total_pairs=0,
                avg_confidence_gap=0.0,
                min_confidence_gap=0.0,
                max_confidence_gap=0.0,
                source_distribution={},
                weight_distribution={},
                quality_score=0.0
            )
        
        # Confidence gaps
        confidence_gaps = []
        for pair in pairs:
            preferred = pair.get('preferred', {})
            rejected = pair.get('rejected', {})
            pref_conf = preferred.get('confidence', 0.5)
            rej_conf = rejected.get('confidence', 0.5)
            confidence_gaps.append(pref_conf - rej_conf)
        
        # Source distribution
        sources = Counter(p.get('source', 'unknown') for p in pairs)
        
        # Weight distribution
        weights = [p.get('weight', 1.0) for p in pairs]
        weight_bins = {
            'low (0.0-0.3)': sum(1 for w in weights if 0.0 <= w <= 0.3),
            'medium (0.3-0.7)': sum(1 for w in weights if 0.3 < w <= 0.7),
            'high (0.7-1.0)': sum(1 for w in weights if 0.7 < w <= 1.0)
        }
        
        # Quality score based on confidence gaps
        avg_gap = sum(confidence_gaps) / len(confidence_gaps) if confidence_gaps else 0.0
        quality_score = min(1.0, avg_gap * 2)  # Normalize to 0.0-1.0
        
        return PreferenceQualityMetrics(
            total_pairs=len(pairs),
            avg_confidence_gap=avg_gap,
            min_confidence_gap=min(confidence_gaps) if confidence_gaps else 0.0,
            max_confidence_gap=max(confidence_gaps) if confidence_gaps else 0.0,
            source_distribution=dict(sources),
            weight_distribution=weight_bins,
            quality_score=quality_score
        )
    
    @staticmethod
    def print_rule_metrics(metrics: RuleQualityMetrics):
        """Print rule quality metrics"""
        print("Rule Quality Metrics:")
        print(f"  Total rules: {metrics.total_rules}")
        print(f"  Confidence: {metrics.avg_confidence:.2f} (range: {metrics.min_confidence:.2f}-{metrics.max_confidence:.2f})")
        print(f"  Completeness: {metrics.completeness_score:.2%}")
        print(f"  Novelty: {metrics.novelty_score:.2f}")
        print(f"  Quality score: {metrics.quality_score:.2f}")
        print(f"\n  Scope distribution:")
        for scope, count in metrics.scope_distribution.items():
            print(f"    {scope}: {count}")
        print(f"\n  Abstraction distribution:")
        for level, count in metrics.abstraction_distribution.items():
            print(f"    {level}: {count}")
    
    @staticmethod
    def print_preference_metrics(metrics: PreferenceQualityMetrics):
        """Print preference quality metrics"""
        print("Preference Quality Metrics:")
        print(f"  Total pairs: {metrics.total_pairs}")
        print(f"  Confidence gap: {metrics.avg_confidence_gap:.2f} (range: {metrics.min_confidence_gap:.2f}-{metrics.max_confidence_gap:.2f})")
        print(f"  Quality score: {metrics.quality_score:.2f}")
        print(f"\n  Source distribution:")
        for source, count in metrics.source_distribution.items():
            print(f"    {source}: {count}")
        print(f"\n  Weight distribution:")
        for bin_name, count in metrics.weight_distribution.items():
            print(f"    {bin_name}: {count}")



