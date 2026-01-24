"""
RL Environment Types

Type definitions for the RL environment: observations, actions, rewards, and results.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum


class ActionType(Enum):
    """
    Types of actions the agent can take
    
    Features:
    - SUGGEST_RULE: Single rule suggestion
    - SUGGEST_MULTIPLE: Multiple rules (batch)
    - NO_SUGGESTION: Agent chooses not to suggest
    """
    SUGGEST_RULE = "suggest_rule"
    SUGGEST_MULTIPLE = "suggest_multiple"
    NO_SUGGESTION = "no_suggestion"


class UserResponse(Enum):
    """
    User responses to suggestions
    
    Features:
    - ACCEPTED: User accepted and applied suggestion
    - REJECTED: User explicitly rejected
    - MODIFIED: User accepted but modified it
    - IGNORED: User saw but took no action
    """
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    MODIFIED = "modified"
    IGNORED = "ignored"


@dataclass
class Observation:
    """
    State observation (what the agent sees)
    
    Features:
    - snapshot_id, artifact_id: Identifiers
    - snapshot: Full uDOM snapshot (current state)
    - previous_snapshot: Previous state (for diffing)
    - user_intent: User-provided intent text
    - component_id, component_type: Selected component info
    - platform: Platform name (figma, canva, etc.)
    - interaction_history: Recent selections, actions, session stats
    - temporal_context: Time deltas (since last snapshot, since selection)
    """
    snapshot_id: str
    artifact_id: str
    snapshot: Dict[str, Any]  # Full uDOM snapshot
    previous_snapshot: Optional[Dict[str, Any]] = None
    user_intent: Optional[str] = None
    component_id: Optional[str] = None
    component_type: Optional[str] = None
    platform: Optional[str] = None
    interaction_history: Optional[Dict[str, Any]] = None
    temporal_context: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            'snapshot_id': self.snapshot_id,
            'artifact_id': self.artifact_id,
            'snapshot': self.snapshot,
            'previous_snapshot': self.previous_snapshot,
            'user_intent': self.user_intent,
            'component_id': self.component_id,
            'component_type': self.component_type,
            'platform': self.platform,
            'interaction_history': self.interaction_history or {},
            'temporal_context': self.temporal_context or {},
        }


@dataclass
class Action:
    """
    Action the agent takes (suggesting rules)
    
    Features:
    - action_type: Type of action (single/multiple/no suggestion)
    - suggested_rules: List of intent rules (rule_id, description, confidence, scope, dimension)
    - confidence_scores: Per-rule confidence scores
    - reasoning: Optional explanation for suggestions
    """
    action_type: ActionType
    suggested_rules: List[Dict[str, Any]]  # List of intent rules
    confidence_scores: List[float] = field(default_factory=list)
    reasoning: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'action_type': self.action_type.value,
            'suggested_rules': self.suggested_rules,
            'confidence_scores': self.confidence_scores,
            'reasoning': self.reasoning,
        }


@dataclass
class Reward:
    """
    Reward signal from environment
    
    Features:
    - value: Total reward (sum of weighted components)
    - source: Reward source type (user_preference | change_magnitude | temporal | composite)
    - components: Breakdown by component (preference, change_magnitude, temporal)
    - metadata: Additional info (user_response, num_suggestions, num_changes, duration_ms)
    """
    value: float
    source: str  # 'user_preference' | 'change_magnitude' | 'temporal' | 'composite'
    components: Dict[str, float] = field(default_factory=dict)  # Breakdown of reward components
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'value': self.value,
            'source': self.source,
            'components': self.components,
            'metadata': self.metadata,
        }


@dataclass
class StepResult:
    """
    Result of environment step
    
    Features:
    - observation: Next state observation
    - reward: Reward received for this step
    - done: Episode termination flag (accepted or max steps)
    - info: Step metadata (episode_step, total_reward, action_type, user_response, num_changes)
    """
    observation: Observation
    reward: Reward
    done: bool
    info: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'observation': self.observation.to_dict(),
            'reward': self.reward.to_dict(),
            'done': self.done,
            'info': self.info,
        }

