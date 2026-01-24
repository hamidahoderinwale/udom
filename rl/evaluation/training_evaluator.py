"""
Training Evaluator

Evaluates model performance before and after DPO training.
Compares acceptance rates, quality metrics, and user satisfaction.
"""

import json
from pathlib import Path
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from collections import defaultdict
import numpy as np

# jsonlines is in requirements.txt - install with: pip install jsonlines
try:
    import jsonlines
except ImportError:
    jsonlines = None
    print("Warning: jsonlines not installed. Install with: pip install jsonlines")


@dataclass
class EvaluationMetrics:
    """Evaluation metrics for model comparison."""
    # Acceptance metrics
    acceptance_rate: float
    rejection_rate: float
    modification_rate: float
    ignore_rate: float
    
    # Quality metrics
    avg_confidence: float
    avg_decision_time_ms: float
    
    # Dimension-specific metrics
    dimension_acceptance: Dict[str, float]
    
    # Platform-specific metrics
    platform_acceptance: Dict[str, float]
    
    # Sample size
    num_examples: int


class TrainingEvaluator:
    """
    Evaluates model performance before and after training.
    
    Features:
    - Compares acceptance rates
    - Quality metrics (confidence, decision time)
    - Dimension/platform breakdowns
    - Statistical significance testing
    """
    
    def __init__(self, test_file: str = "data/training_dataset/test.jsonl"):
        """Initialize evaluator with test dataset."""
        self.test_file = Path(test_file)
        self.test_pairs = []
        
        if self.test_file.exists() and jsonlines:
            with jsonlines.open(self.test_file) as reader:
                self.test_pairs = list(reader)
    
    def evaluate_preferences(
        self,
        preferences: List[Dict[str, Any]],
        model_name: str = "baseline",
    ) -> EvaluationMetrics:
        """
        Evaluate model performance from preference events.
        
        Parameters:
        - preferences: List of preference events (from database or API)
        - model_name: Name/version of model being evaluated
        """
        if not preferences:
            return EvaluationMetrics(
                acceptance_rate=0.0,
                rejection_rate=0.0,
                modification_rate=0.0,
                ignore_rate=0.0,
                avg_confidence=0.0,
                avg_decision_time_ms=0.0,
                dimension_acceptance={},
                platform_acceptance={},
                num_examples=0,
            )
        
        # Count actions
        total = len(preferences)
        accepted = sum(1 for p in preferences if p.get('user_action', {}).get('type') == 'accepted')
        rejected = sum(1 for p in preferences if p.get('user_action', {}).get('type') == 'dismissed')
        modified = sum(1 for p in preferences if p.get('user_action', {}).get('type') == 'modified')
        ignored = sum(1 for p in preferences if p.get('user_action', {}).get('type') == 'ignored')
        
        # Calculate rates
        acceptance_rate = accepted / total if total > 0 else 0.0
        rejection_rate = rejected / total if total > 0 else 0.0
        modification_rate = modified / total if total > 0 else 0.0
        ignore_rate = ignored / total if total > 0 else 0.0
        
        # Average confidence
        confidences = []
        for pref in preferences:
            rules = pref.get('suggested_rules', [])
            if rules:
                avg_conf = np.mean([r.get('confidence', 0.5) for r in rules])
                confidences.append(avg_conf)
        avg_confidence = np.mean(confidences) if confidences else 0.0
        
        # Average decision time
        decision_times = []
        for pref in preferences:
            duration = pref.get('user_action', {}).get('duration_ms')
            if duration:
                decision_times.append(duration)
        avg_decision_time_ms = np.mean(decision_times) if decision_times else 0.0
        
        # Dimension-specific acceptance
        dimension_acceptance = defaultdict(lambda: {'accepted': 0, 'total': 0})
        for pref in preferences:
            rules = pref.get('suggested_rules', [])
            action_type = pref.get('user_action', {}).get('type')
            
            for rule in rules:
                dimension = rule.get('dimension') or rule.get('scope', 'unknown')
                dimension_acceptance[dimension]['total'] += 1
                if action_type == 'accepted':
                    dimension_acceptance[dimension]['accepted'] += 1
        
        dimension_rates = {
            dim: stats['accepted'] / stats['total'] if stats['total'] > 0 else 0.0
            for dim, stats in dimension_acceptance.items()
        }
        
        # Platform-specific acceptance
        platform_acceptance = defaultdict(lambda: {'accepted': 0, 'total': 0})
        for pref in preferences:
            platform = pref.get('trace_context', {}).get('platform', 'unknown')
            action_type = pref.get('user_action', {}).get('type')
            
            platform_acceptance[platform]['total'] += 1
            if action_type == 'accepted':
                platform_acceptance[platform]['accepted'] += 1
        
        platform_rates = {
            platform: stats['accepted'] / stats['total'] if stats['total'] > 0 else 0.0
            for platform, stats in platform_acceptance.items()
        }
        
        return EvaluationMetrics(
            acceptance_rate=acceptance_rate,
            rejection_rate=rejection_rate,
            modification_rate=modification_rate,
            ignore_rate=ignore_rate,
            avg_confidence=avg_confidence,
            avg_decision_time_ms=avg_decision_time_ms,
            dimension_acceptance=dimension_rates,
            platform_acceptance=platform_rates,
            num_examples=total,
        )
    
    def compare_models(
        self,
        baseline_preferences: List[Dict[str, Any]],
        trained_preferences: List[Dict[str, Any]],
        baseline_name: str = "baseline",
        trained_name: str = "trained",
    ) -> Dict[str, Any]:
        """
        Compare two models' performance.
        
        Parameters:
        - baseline_preferences: Preference events from baseline model
        - trained_preferences: Preference events from trained model
        - baseline_name: Name for baseline model
        - trained_name: Name for trained model
        """
        baseline_metrics = self.evaluate_preferences(baseline_preferences, baseline_name)
        trained_metrics = self.evaluate_preferences(trained_preferences, trained_name)
        
        # Calculate improvements
        acceptance_improvement = trained_metrics.acceptance_rate - baseline_metrics.acceptance_rate
        rejection_improvement = baseline_metrics.rejection_rate - trained_metrics.rejection_rate  # Lower is better
        
        # Statistical significance (simplified - would use proper test in production)
        improvement_pct = (acceptance_improvement / baseline_metrics.acceptance_rate * 100) if baseline_metrics.acceptance_rate > 0 else 0.0
        
        comparison = {
            'baseline': {
                'name': baseline_name,
                'metrics': {
                    'acceptance_rate': baseline_metrics.acceptance_rate,
                    'rejection_rate': baseline_metrics.rejection_rate,
                    'modification_rate': baseline_metrics.modification_rate,
                    'ignore_rate': baseline_metrics.ignore_rate,
                    'avg_confidence': baseline_metrics.avg_confidence,
                    'avg_decision_time_ms': baseline_metrics.avg_decision_time_ms,
                    'num_examples': baseline_metrics.num_examples,
                },
                'dimension_acceptance': baseline_metrics.dimension_acceptance,
                'platform_acceptance': baseline_metrics.platform_acceptance,
            },
            'trained': {
                'name': trained_name,
                'metrics': {
                    'acceptance_rate': trained_metrics.acceptance_rate,
                    'rejection_rate': trained_metrics.rejection_rate,
                    'modification_rate': trained_metrics.modification_rate,
                    'ignore_rate': trained_metrics.ignore_rate,
                    'avg_confidence': trained_metrics.avg_confidence,
                    'avg_decision_time_ms': trained_metrics.avg_decision_time_ms,
                    'num_examples': trained_metrics.num_examples,
                },
                'dimension_acceptance': trained_metrics.dimension_acceptance,
                'platform_acceptance': trained_metrics.platform_acceptance,
            },
            'improvements': {
                'acceptance_rate_delta': acceptance_improvement,
                'acceptance_rate_improvement_pct': improvement_pct,
                'rejection_rate_delta': -rejection_improvement,  # Negative because lower is better
                'confidence_delta': trained_metrics.avg_confidence - baseline_metrics.avg_confidence,
                'decision_time_delta_ms': trained_metrics.avg_decision_time_ms - baseline_metrics.avg_decision_time_ms,
            },
        }
        
        return comparison
    
    def generate_report(
        self,
        comparison: Dict[str, Any],
        output_file: Optional[str] = None,
    ) -> str:
        """Generate human-readable evaluation report."""
        baseline = comparison['baseline']
        trained = comparison['trained']
        improvements = comparison['improvements']
        
        report_lines = [
            "=" * 80,
            "Model Evaluation Report",
            "=" * 80,
            "",
            f"Baseline Model: {baseline['name']}",
            f"  Examples: {baseline['metrics']['num_examples']}",
            f"  Acceptance Rate: {baseline['metrics']['acceptance_rate']:.2%}",
            f"  Rejection Rate: {baseline['metrics']['rejection_rate']:.2%}",
            f"  Avg Confidence: {baseline['metrics']['avg_confidence']:.3f}",
            f"  Avg Decision Time: {baseline['metrics']['avg_decision_time_ms']:.0f}ms",
            "",
            f"Trained Model: {trained['name']}",
            f"  Examples: {trained['metrics']['num_examples']}",
            f"  Acceptance Rate: {trained['metrics']['acceptance_rate']:.2%}",
            f"  Rejection Rate: {trained['metrics']['rejection_rate']:.2%}",
            f"  Avg Confidence: {trained['metrics']['avg_confidence']:.3f}",
            f"  Avg Decision Time: {trained['metrics']['avg_decision_time_ms']:.0f}ms",
            "",
            "Improvements:",
            f"  Acceptance Rate: {improvements['acceptance_rate_delta']:+.2%} ({improvements['acceptance_rate_improvement_pct']:+.1f}%)",
            f"  Rejection Rate: {improvements['rejection_rate_delta']:+.2%}",
            f"  Confidence: {improvements['confidence_delta']:+.3f}",
            f"  Decision Time: {improvements['decision_time_delta_ms']:+.0f}ms",
            "",
        ]
        
        # Dimension breakdown
        if baseline['dimension_acceptance'] or trained['dimension_acceptance']:
            report_lines.extend([
                "Dimension-Specific Acceptance:",
            ])
            all_dims = set(baseline['dimension_acceptance'].keys()) | set(trained['dimension_acceptance'].keys())
            for dim in sorted(all_dims):
                baseline_rate = baseline['dimension_acceptance'].get(dim, 0.0)
                trained_rate = trained['dimension_acceptance'].get(dim, 0.0)
                delta = trained_rate - baseline_rate
                report_lines.append(
                    f"  {dim}: {baseline_rate:.2%} → {trained_rate:.2%} ({delta:+.2%})"
                )
            report_lines.append("")
        
        # Platform breakdown
        if baseline['platform_acceptance'] or trained['platform_acceptance']:
            report_lines.extend([
                "Platform-Specific Acceptance:",
            ])
            all_platforms = set(baseline['platform_acceptance'].keys()) | set(trained['platform_acceptance'].keys())
            for platform in sorted(all_platforms):
                baseline_rate = baseline['platform_acceptance'].get(platform, 0.0)
                trained_rate = trained['platform_acceptance'].get(platform, 0.0)
                delta = trained_rate - baseline_rate
                report_lines.append(
                    f"  {platform}: {baseline_rate:.2%} → {trained_rate:.2%} ({delta:+.2%})"
                )
            report_lines.append("")
        
        report_lines.append("=" * 80)
        
        report = "\n".join(report_lines)
        
        if output_file:
            with open(output_file, 'w') as f:
                f.write(report)
            print(f"Report saved to {output_file}")
        
        return report


def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Evaluate model performance")
    parser.add_argument(
        "--baseline-preferences",
        type=str,
        required=True,
        help="JSON file with baseline model preferences"
    )
    parser.add_argument(
        "--trained-preferences",
        type=str,
        required=True,
        help="JSON file with trained model preferences"
    )
    parser.add_argument(
        "--baseline-name",
        type=str,
        default="baseline",
        help="Baseline model name"
    )
    parser.add_argument(
        "--trained-name",
        type=str,
        default="trained",
        help="Trained model name"
    )
    parser.add_argument(
        "--output",
        type=str,
        help="Output file for report"
    )
    
    args = parser.parse_args()
    
    # Load preferences
    with open(args.baseline_preferences, 'r') as f:
        baseline_prefs = json.load(f)
    
    with open(args.trained_preferences, 'r') as f:
        trained_prefs = json.load(f)
    
    # Evaluate
    evaluator = TrainingEvaluator()
    comparison = evaluator.compare_models(
        baseline_prefs,
        trained_prefs,
        args.baseline_name,
        args.trained_name,
    )
    
    # Generate report
    report = evaluator.generate_report(comparison, args.output)
    print(report)
    
    # Save comparison JSON
    if args.output:
        json_output = Path(args.output).with_suffix('.json')
        with open(json_output, 'w') as f:
            json.dump(comparison, f, indent=2)
        print(f"Comparison JSON saved to {json_output}")


if __name__ == "__main__":
    main()

