"""
Platform-Aware Keyword Classifier

Shared utility for classifying design dimensions using platform-specific learned keywords.
Used by both intent rule generation and preference generation.

Features:
- Base keywords (curated domain knowledge)
- Platform-specific keyword learning from rules
- Performance tracking and reward-based keyword selection
- Dimension classification with platform awareness
"""

from typing import List, Dict, Optional, Tuple, Set
from dataclasses import dataclass
from collections import defaultdict
import json
import re
from pathlib import Path


@dataclass
class ClassificationResult:
    """Result of dimension classification"""
    dimension: str
    confidence: float
    method: str  # 'explicit' | 'keywords' | 'scope' | 'fallback'
    matched_keywords: List[str]
    platform: Optional[str] = None


class PlatformKeywordClassifier:
    """
    Platform-aware keyword classifier for design dimensions.
    
    Learns platform-specific keywords from rules with explicit dimensions,
    tracks performance, and rewards accurate keywords.
    """
    
    # Base design dimension keywords (curated domain knowledge)
    BASE_DESIGN_DIMENSIONS = {
        'layout': ['layout', 'grid', 'alignment', 'position', 'arrangement', 'structure', 'composition'],
        'interaction': ['interaction', 'flow', 'navigation', 'click', 'hover', 'transition', 'state', 'behavior'],
        'content': ['content', 'text', 'copy', 'message', 'information', 'data', 'label'],
        'visual_hierarchy': ['hierarchy', 'emphasis', 'prominence', 'importance', 'level', 'rank'],
        'spacing': ['spacing', 'margin', 'padding', 'gap', 'rhythm', 'whitespace', 'distance'],
        'typography': ['typography', 'font', 'type', 'text style', 'letter', 'line height', 'kerning'],
        'color': ['color', 'palette', 'hue', 'saturation', 'contrast', 'tone', 'shade'],
        'visual_elements': ['shadow', 'border', 'radius', 'gradient', 'effect', 'filter', 'opacity'],
    }
    
    # Scope to dimension mapping
    SCOPE_MAPPING = {
        'structural': 'layout',
        'relational': 'interaction',
        'compositional': 'layout',
        'artifact_property': 'visual_elements',
    }
    
    # Stop words to filter out
    STOP_WORDS = {
        'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 
        'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 
        'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'use', 'she'
    }
    
    def __init__(self):
        """Initialize the classifier with empty learned keywords and performance tracking."""
        # Platform-specific learned keywords
        # Structure: {platform: {dimension: {keyword: reward_score}}}
        self.platform_keywords: Dict[str, Dict[str, Dict[str, float]]] = defaultdict(
            lambda: defaultdict(dict)
        )
        
        # Keyword performance tracking
        # Structure: {platform: {dimension: {keyword: {correct: int, total: int}}}}
        self.keyword_performance: Dict[str, Dict[str, Dict[str, Dict[str, int]]]] = defaultdict(
            lambda: defaultdict(lambda: defaultdict(lambda: {'correct': 0, 'total': 0}))
        )
    
    def classify_dimension(
        self,
        description: str,
        scope: Optional[str] = None,
        explicit_dimension: Optional[str] = None,
        platform: Optional[str] = None
    ) -> ClassificationResult:
        """
        Classify a rule into a design dimension.
        
        Parameters:
        - description: Rule description text
        - scope: Rule scope (structural, relational, compositional, artifact_property)
        - explicit_dimension: Explicitly set dimension (ground truth, returns immediately)
        - platform: Platform name (e.g., 'figma') for platform-specific keywords
        
        Returns:
        - ClassificationResult: dimension, confidence, method, matched_keywords, platform
        
        Features:
        - Method priority: explicit → platform-aware keywords → scope mapping → fallback
        - Platform-aware: Uses learned platform-specific keywords (weighted by reward)
        - Base keywords: Curated domain knowledge (layout, interaction, content, etc.)
        - Confidence: Normalized by match count (3+ matches = high confidence)
        - Performance tracking: Records accuracy if explicit_dimension provided
        """
        # Method 1: Use explicit dimension if provided
        if explicit_dimension:
            return ClassificationResult(
                dimension=explicit_dimension,
                confidence=1.0,
                method='explicit',
                matched_keywords=[],
                platform=platform
            )
        
        # Method 2: Classify using platform-aware keywords
        description_lower = description.lower()
        description_words = set(re.findall(r'\b\w{3,}\b', description_lower))
        
        dimension_scores = {}
        matched_keywords_by_dim = {}
        
        # Score each dimension
        for dimension, base_keywords in self.BASE_DESIGN_DIMENSIONS.items():
            score = 0.0
            matched = []
            
            # Check base keywords
            for keyword in base_keywords:
                if keyword in description_lower:
                    score += 1.0
                    matched.append(keyword)
            
            # Check platform-specific learned keywords
            if platform and platform in self.platform_keywords:
                if dimension in self.platform_keywords[platform]:
                    for keyword, reward in self.platform_keywords[platform][dimension].items():
                        if keyword in description_lower:
                            # Weight by reward score (higher reward = more confident)
                            score += reward
                            matched.append(f"{keyword}({reward:.2f})")
            
            if score > 0:
                dimension_scores[dimension] = score
                matched_keywords_by_dim[dimension] = matched
        
        # Method 3: Fall back to scope mapping
        if not dimension_scores and scope:
            mapped_dim = self.SCOPE_MAPPING.get(scope, 'general')
            return ClassificationResult(
                dimension=mapped_dim,
                confidence=0.5,
                method='scope',
                matched_keywords=[],
                platform=platform
            )
        
        # Return best scoring dimension
        if dimension_scores:
            best_dimension = max(dimension_scores.items(), key=lambda x: x[1])[0]
            max_score = dimension_scores[best_dimension]
            # Normalize confidence (rough heuristic)
            confidence = min(1.0, max_score / 3.0)  # 3+ matches = high confidence
            
            # Track performance if we have ground truth
            if explicit_dimension:
                self._track_performance(
                    description_words, 
                    best_dimension, 
                    explicit_dimension, 
                    platform
                )
            
            return ClassificationResult(
                dimension=best_dimension,
                confidence=confidence,
                method='keywords',
                matched_keywords=matched_keywords_by_dim.get(best_dimension, []),
                platform=platform
            )
        
        # Method 4: Fallback to general
        return ClassificationResult(
            dimension='general',
            confidence=0.3,
            method='fallback',
            matched_keywords=[],
            platform=platform
        )
    
    def learn_from_rules(
        self,
        rules: List[Dict],
        min_confidence: float = 0.6
    ):
        """
        Learn platform-specific keywords from rules with explicit dimensions.
        
        Parameters:
        - rules: List of rule dicts with 'design_dimension' and 'platform_context'
        - min_confidence: Minimum confidence threshold (unused, kept for API compatibility)
        
        Features:
        - Extracts: design_dimension, platform from platform_context
        - Processes: description text → significant words (3+ chars, not stop words)
        - Stores: platform → dimension → keyword → reward_score (initialized to 0.0)
        - Reward scores updated later via update_rewards() based on performance
        """
        for rule in rules:
            dimension = rule.get('design_dimension')
            platform_context = rule.get('platform_context', {})
            platform = platform_context.get('platform', 'unknown').lower()
            description = rule.get('description', '')
            
            if not dimension or not description:
                continue
            
            # Extract significant words from description
            description_lower = description.lower()
            words = set(re.findall(r'\b\w{3,}\b', description_lower))
            words = words - self.STOP_WORDS
            
            # Initialize platform dimension if needed
            if platform not in self.platform_keywords:
                self.platform_keywords[platform] = defaultdict(dict)
            
            # Add words as potential keywords (will be rewarded based on performance)
            for word in words:
                if word not in self.platform_keywords[platform][dimension]:
                    self.platform_keywords[platform][dimension][word] = 0.0
    
    def update_rewards(self, min_accuracy: float = 0.6):
        """
        Update keyword reward scores based on classification performance.
        
        Parameters:
        - min_accuracy: Minimum accuracy threshold (default: 0.6)
        
        Features:
        - Computes: accuracy = correct / total for each keyword
        - Updates: reward_score = accuracy (if accuracy ≥ min_accuracy)
        - Removes: keywords with accuracy < min_accuracy
        - Tracks: performance per platform → dimension → keyword
        """
        for platform, platform_dims in self.keyword_performance.items():
            for dimension, keywords in platform_dims.items():
                for keyword, perf in keywords.items():
                    if perf['total'] > 0:
                        accuracy = perf['correct'] / perf['total']
                        
                        if accuracy >= min_accuracy:
                            # Reward score = accuracy (0.0 to 1.0)
                            if platform not in self.platform_keywords:
                                self.platform_keywords[platform] = defaultdict(dict)
                            self.platform_keywords[platform][dimension][keyword] = accuracy
                        else:
                            # Remove low-performing keywords
                            if (platform in self.platform_keywords and 
                                dimension in self.platform_keywords[platform]):
                                self.platform_keywords[platform][dimension].pop(keyword, None)
    
    def _track_performance(
        self,
        description_words: Set[str],
        predicted_dimension: str,
        ground_truth_dimension: str,
        platform: Optional[str]
    ):
        """Track keyword performance for learning."""
        if not platform:
            return
        
        is_correct = (predicted_dimension == ground_truth_dimension)
        
        # Update performance for each word in description
        for word in description_words:
            if word not in self.keyword_performance[platform][predicted_dimension]:
                self.keyword_performance[platform][predicted_dimension][word] = {
                    'correct': 0, 
                    'total': 0
                }
            
            self.keyword_performance[platform][predicted_dimension][word]['total'] += 1
            if is_correct:
                self.keyword_performance[platform][predicted_dimension][word]['correct'] += 1
    
    def get_platform_keywords(
        self, 
        platform: str, 
        dimension: Optional[str] = None
    ) -> Dict[str, Dict[str, float]]:
        """
        Get learned keywords for a platform.
        
        Args:
            platform: Platform name (e.g., 'figma')
            dimension: Optional dimension filter
            
        Returns:
            Dict of {dimension: {keyword: reward_score}} or single dimension dict
        """
        if platform not in self.platform_keywords:
            return {}
        
        if dimension:
            return {dimension: self.platform_keywords[platform].get(dimension, {})}
        
        return dict(self.platform_keywords[platform])
    
    def get_all_keywords(self, platform: Optional[str] = None) -> Dict[str, List[str]]:
        """
        Get all keywords (base + learned) for dimensions.
        
        Args:
            platform: Optional platform filter
            
        Returns:
            Dict of {dimension: [keywords]}
        """
        dimensions = {dim: list(keywords) for dim, keywords in self.BASE_DESIGN_DIMENSIONS.items()}
        
        # Add learned platform-specific keywords
        platforms_to_check = [platform] if platform else self.platform_keywords.keys()
        
        for plat in platforms_to_check:
            if plat in self.platform_keywords:
                for dimension, keywords in self.platform_keywords[plat].items():
                    if dimension in dimensions:
                        # Add keywords with high reward scores
                        learned = [kw for kw, score in keywords.items() if score > 0.5]
                        dimensions[dimension].extend(learned)
                        # Remove duplicates while preserving order
                        dimensions[dimension] = list(dict.fromkeys(dimensions[dimension]))
        
        return dimensions
    
    def save(self, filepath: str):
        """Save learned platform keywords to JSON file."""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        
        with open(filepath, 'w') as f:
            json.dump({
                'platform_keywords': {
                    k: {dk: dict(dv) for dk, dv in v.items()} 
                    for k, v in self.platform_keywords.items()
                },
                'keyword_performance': {
                    k: {
                        dk: {kw: dict(pv) for kw, pv in dv.items()} 
                        for dk, dv in v.items()
                    } 
                    for k, v in self.keyword_performance.items()
                }
            }, f, indent=2)
    
    def load(self, filepath: str):
        """Load learned platform keywords from JSON file."""
        filepath = Path(filepath)
        if not filepath.exists():
            return
        
        with open(filepath, 'r') as f:
            data = json.load(f)
            
            # Load platform keywords
            self.platform_keywords = defaultdict(
                lambda: defaultdict(dict),
                {
                    k: defaultdict(dict, v) 
                    for k, v in data.get('platform_keywords', {}).items()
                }
            )
            
            # Load performance tracking
            self.keyword_performance = defaultdict(
                lambda: defaultdict(lambda: defaultdict(lambda: {'correct': 0, 'total': 0})),
                {
                    k: {
                        dk: {
                            kw: {'correct': pv.get('correct', 0), 'total': pv.get('total', 0)}
                            for kw, pv in dv.items()
                        }
                        for dk, dv in v.items()
                    }
                    for k, v in data.get('keyword_performance', {}).items()
                }
            )


# Global singleton instance (can be shared across modules)
_global_classifier: Optional[PlatformKeywordClassifier] = None


def get_classifier() -> PlatformKeywordClassifier:
    """Get or create global classifier instance."""
    global _global_classifier
    if _global_classifier is None:
        _global_classifier = PlatformKeywordClassifier()
    return _global_classifier


def set_classifier(classifier: PlatformKeywordClassifier):
    """Set global classifier instance."""
    global _global_classifier
    _global_classifier = classifier

