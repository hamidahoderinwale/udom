"""
RL Environment Converters

Functions to convert between preference events and RL environment components.
"""

from typing import Dict, List, Optional, Tuple, Any
from .types import Observation, Action, Reward, ActionType, UserResponse
from .environment import DesignEnvironment


def from_preference_event(
    preference_event: Dict[str, Any],
    snapshot: Dict[str, Any],
    previous_snapshot: Optional[Dict[str, Any]] = None,
    changes: Optional[List[Dict[str, Any]]] = None,
    preference_weight: float = 1.0,
    change_weight: float = 0.5,
    temporal_weight: float = 0.2,
) -> Tuple[Observation, Action, Reward]:
    """
    Convert a PreferenceEvent to environment components
    
    Bridges preference tracking system → RL environment.
    
    Parameters:
    - preference_event: PreferenceEvent dict (snapshot_id, artifact_id, suggested_rules, user_action, trace_context)
    - snapshot: Current uDOM snapshot
    - previous_snapshot: Previous snapshot (for diffing)
    - changes: List of changes from diffing system
    - preference_weight, change_weight, temporal_weight: Reward component weights
    
    Returns:
    - (observation, action, reward) tuple
    
    Features:
    - Extracts: snapshot_id, artifact_id, user_intent, component_id from event
    - Builds observation with temporal_context (time_since_last_snapshot_ms, time_since_selection_ms)
    - Creates action from suggested_rules (single vs multiple based on count)
    - Computes reward from user_action (type, duration_ms) and changes
    """
    # Build observation
    observation = Observation(
        snapshot_id=preference_event['snapshot_id'],
        artifact_id=preference_event['artifact_id'],
        snapshot=snapshot,
        previous_snapshot=previous_snapshot,
        user_intent=preference_event.get('trace_context', {}).get('user_intent'),
        component_id=preference_event.get('trace_context', {}).get('component_id'),
        interaction_history=preference_event.get('trace_context', {}),
        temporal_context={
            'time_since_last_snapshot_ms': preference_event.get('trace_context', {}).get('time_since_last_snapshot_ms'),
            'time_since_selection_ms': preference_event.get('trace_context', {}).get('time_since_selection_ms'),
        },
    )
    
    # Build action (suggested rules)
    suggested_rules = preference_event.get('suggested_rules', [])
    action = Action(
        action_type=ActionType.SUGGEST_MULTIPLE if len(suggested_rules) > 1 else ActionType.SUGGEST_RULE,
        suggested_rules=suggested_rules,
        confidence_scores=[r.get('match_score', 0.5) for r in suggested_rules],
    )
    
    # Build reward from user response
    user_action = preference_event.get('user_action', {})
    user_response = UserResponse(user_action.get('type', 'ignored'))
    duration_ms = user_action.get('duration_ms')
    
    # Create temporary environment to compute reward
    env = DesignEnvironment(
        preference_weight=preference_weight,
        change_weight=change_weight,
        temporal_weight=temporal_weight,
    )
    
    reward = env._compute_reward(
        action=action,
        user_response=user_response,
        changes=changes,
        duration_ms=duration_ms,
    )
    
    return observation, action, reward


def create_environment_from_preferences(
    preference_events: List[Dict[str, Any]],
    snapshots: Dict[str, Dict[str, Any]],  # snapshot_id -> snapshot
    changes: Dict[str, List[Dict[str, Any]]],  # snapshot_id -> list of changes
    preference_weight: float = 1.0,
    change_weight: float = 0.5,
    temporal_weight: float = 0.2,
) -> List[Dict[str, Any]]:
    """
    Convert preference events to RL environment trajectories
    
    Parameters:
    - preference_events: List of PreferenceEvent dicts
    - snapshots: Dict mapping snapshot_id → uDOM snapshot
    - changes: Dict mapping snapshot_id → list of changes
    - preference_weight, change_weight, temporal_weight: Reward weights
    
    Returns:
    - List of trajectory step dicts (formatted for training)
    
    Features:
    - Processes each preference event → observation, action, reward
    - Links previous snapshots via trace_context.previous_snapshot_id
    - Formats each step for DPO training (input, action, reward, metadata)
    - Skips events with missing snapshots
    """
    env = DesignEnvironment(
        preference_weight=preference_weight,
        change_weight=change_weight,
        temporal_weight=temporal_weight,
    )
    trajectories = []
    
    for event in preference_events:
        snapshot_id = event['snapshot_id']
        snapshot = snapshots.get(snapshot_id)
        
        if not snapshot:
            continue
        
        # Get previous snapshot if available
        previous_snapshot_id = event.get('trace_context', {}).get('previous_snapshot_id')
        previous_snapshot = snapshots.get(previous_snapshot_id) if previous_snapshot_id else None
        
        # Get changes for this snapshot
        snapshot_changes = changes.get(snapshot_id, [])
        
        # Convert to environment components
        observation, action, reward = from_preference_event(
            preference_event=event,
            snapshot=snapshot,
            previous_snapshot=previous_snapshot,
            changes=snapshot_changes,
            preference_weight=preference_weight,
            change_weight=change_weight,
            temporal_weight=temporal_weight,
        )
        
        # Format for training
        trajectory_step = env.format_for_training(
            observation=observation,
            action=action,
            reward=reward,
        )
        
        trajectories.append(trajectory_step)
    
    return trajectories

