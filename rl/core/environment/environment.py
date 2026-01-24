"""
RL Environment Implementation

Main DesignEnvironment class that implements the RL environment interface.
"""

from typing import Dict, List, Optional, Tuple, Any
from .types import Observation, Action, Reward, StepResult, ActionType, UserResponse


class DesignEnvironment:
    """
    RL Environment for Taste's Creative Director Tool
    
    The environment represents the design tool (Figma) where:
    - State: Current design snapshot + context
    - Action: Suggesting design improvement rules
    - Reward: User preference (accept/reject) + change magnitude
    """
    
    def __init__(
        self,
        preference_weight: float = 1.0,
        change_weight: float = 0.5,
        temporal_weight: float = 0.2,
        max_suggestions: int = 5,
    ):
        """
        Initialize environment
        
        Parameters:
        - preference_weight: User preference reward weight (accept=+1, reject=-1, modified=+0.5, ignore=0)
        - change_weight: Change magnitude reward weight (based on num changes, property-level bonus)
        - temporal_weight: Temporal reward weight (faster decisions rewarded, 1-5s optimal)
        - max_suggestions: Max rules per action (default: 5)
        """
        self.preference_weight = preference_weight
        self.change_weight = change_weight
        self.temporal_weight = temporal_weight
        self.max_suggestions = max_suggestions
        
        # Environment state
        # Features tracked: current observation, last action/response, changes, episode step, reward history
        self.current_observation: Optional[Observation] = None
        self.last_action: Optional[Action] = None
        self.last_user_response: Optional[UserResponse] = None
        self.last_changes: Optional[List[Dict[str, Any]]] = None
        self.episode_step: int = 0
        self.episode_rewards: List[float] = []
        
    def reset(self, observation: Observation) -> Observation:
        """
        Reset environment to initial state
        
        Args:
            observation: Initial observation (snapshot + context)
            
        Returns:
            Initial observation
        """
        self.current_observation = observation
        self.last_action = None
        self.last_user_response = None
        self.last_changes = None
        self.episode_step = 0
        self.episode_rewards = []
        
        return self.current_observation
    
    def step(
        self,
        action: Action,
        user_response: UserResponse,
        changes: Optional[List[Dict[str, Any]]] = None,
        duration_ms: Optional[float] = None,
        next_observation: Optional[Observation] = None,
    ) -> StepResult:
        """
        Execute one step in the environment
        
        Parameters:
        - action: Agent's suggested rules
        - user_response: User feedback (accepted/rejected/modified/ignored)
        - changes: List of changes from diffing system (change_type, change_scope, property_name, etc.)
        - duration_ms: Decision time (suggestion shown → user action)
        - next_observation: Optional next state (updates current if provided)
        
        Returns:
        - StepResult: Next observation, computed reward, done flag, step info
        
        Features:
        - Computes composite reward (preference + change + temporal)
        - Episode ends on acceptance or max steps (10)
        - Tracks episode step, total reward, action type, response, change count
        """
        if self.current_observation is None:
            raise ValueError("Environment not reset. Call reset() first.")
        
        self.last_action = action
        self.last_user_response = user_response
        self.last_changes = changes
        self.episode_step += 1
        
        # Compute reward
        reward = self._compute_reward(
            action=action,
            user_response=user_response,
            changes=changes,
            duration_ms=duration_ms,
        )
        
        self.episode_rewards.append(reward.value)
        
        # Update observation if next state provided
        if next_observation:
            self.current_observation = next_observation
        
        # Done when user accepts (episode complete) or max steps reached
        done = (
            user_response == UserResponse.ACCEPTED or
            self.episode_step >= 10  # Max steps per episode
        )
        
        info = {
            'episode_step': self.episode_step,
            'total_reward': sum(self.episode_rewards),
            'action_type': action.action_type.value,
            'user_response': user_response.value,
            'num_changes': len(changes) if changes else 0,
        }
        
        return StepResult(
            observation=self.current_observation,
            reward=reward,
            done=done,
            info=info,
        )
    
    def _compute_reward(
        self,
        action: Action,
        user_response: UserResponse,
        changes: Optional[List[Dict[str, Any]]],
        duration_ms: Optional[float],
    ) -> Reward:
        """
        Compute reward from user response and resulting changes
        
        Reward components (weighted):
        1. Preference: +1.0 (accepted), -1.0 (rejected), +0.5 (modified), 0.0 (ignored)
        2. Change magnitude: Normalized by num changes (max 10 = 1.0), +0.2 bonus for property-level changes
        3. Temporal: Optimal 1-5s = 1.0, <1s = 0.5 (too fast), >5s decays linearly
        
        Features:
        - Composite reward (sum of weighted components)
        - Component breakdown for analysis
        - Metadata: user_response, num_suggestions, num_changes, duration_ms
        """
        components = {}
        
        # 1. User preference reward
        if user_response == UserResponse.ACCEPTED:
            preference_reward = 1.0
        elif user_response == UserResponse.REJECTED:
            preference_reward = -1.0
        elif user_response == UserResponse.MODIFIED:
            preference_reward = 0.5  # Partial acceptance
        else:  # IGNORED
            preference_reward = 0.0
        
        components['preference'] = preference_reward * self.preference_weight
        
        # 2. Change magnitude reward
        change_reward = 0.0
        if changes:
            # Reward based on number of meaningful changes
            num_changes = len(changes)
            # Normalize: 0-1 scale (assuming max 10 changes is "good")
            change_reward = min(num_changes / 10.0, 1.0)
            
            # Bonus for property-level changes (more specific)
            property_changes = sum(
                1 for c in changes 
                if c.get('change_scope') == 'property'
            )
            if property_changes > 0:
                change_reward += 0.2 * min(property_changes / 5.0, 1.0)
        
        components['change_magnitude'] = change_reward * self.change_weight
        
        # 3. Temporal reward (faster decisions = better, up to a point)
        temporal_reward = 0.0
        if duration_ms is not None:
            # Reward faster decisions (under 5 seconds = good)
            # But too fast (< 1 second) might indicate low thought
            if 1000 <= duration_ms <= 5000:
                temporal_reward = 1.0 - ((duration_ms - 1000) / 4000.0)
            elif duration_ms < 1000:
                temporal_reward = 0.5  # Too fast, might be accidental
            else:
                temporal_reward = max(0.0, 1.0 - ((duration_ms - 5000) / 10000.0))
        
        components['temporal'] = temporal_reward * self.temporal_weight
        
        # Total reward
        total_reward = sum(components.values())
        
        metadata = {
            'user_response': user_response.value,
            'num_suggestions': len(action.suggested_rules),
            'num_changes': len(changes) if changes else 0,
            'duration_ms': duration_ms,
        }
        
        return Reward(
            value=total_reward,
            source='composite',
            components=components,
            metadata=metadata,
        )
    
    def get_observation_space(self) -> Dict[str, Any]:
        """
        Define observation space (what the agent can observe)
        
        Features:
        - snapshot_id, artifact_id: Identifiers
        - snapshot, previous_snapshot: uDOM snapshots
        - user_intent, component_id, component_type, platform: Context
        - interaction_history, temporal_context: Behavioral/temporal data
        
        Returns:
        - Dict describing observation space structure (for RL libraries)
        """
        return {
            'snapshot_id': {'type': 'string'},
            'artifact_id': {'type': 'string'},
            'snapshot': {'type': 'object'},  # Full uDOM snapshot
            'previous_snapshot': {'type': 'object', 'optional': True},
            'user_intent': {'type': 'string', 'optional': True},
            'component_id': {'type': 'string', 'optional': True},
            'component_type': {'type': 'string', 'optional': True},
            'platform': {'type': 'string', 'optional': True},
            'interaction_history': {'type': 'object', 'optional': True},
            'temporal_context': {'type': 'object', 'optional': True},
        }
    
    def get_action_space(self) -> Dict[str, Any]:
        """
        Define action space (what actions the agent can take)
        
        Features:
        - action_type: Enum (suggest_rule, suggest_multiple, no_suggestion)
        - suggested_rules: Array of rules (max: max_suggestions)
          - Each rule: rule_id, description, confidence, scope, dimension
        - confidence_scores: Array of floats (per rule)
        - reasoning: Optional explanation string
        
        Returns:
        - Dict describing action space structure (for RL libraries)
        """
        return {
            'action_type': {
                'type': 'enum',
                'values': [at.value for at in ActionType],
            },
            'suggested_rules': {
                'type': 'array',
                'max_length': self.max_suggestions,
                'item_type': {
                    'rule_id': 'string',
                    'description': 'string',
                    'confidence': 'float',
                    'scope': 'string',
                    'dimension': 'string',
                },
            },
            'confidence_scores': {
                'type': 'array',
                'max_length': self.max_suggestions,
                'item_type': 'float',
            },
            'reasoning': {'type': 'string', 'optional': True},
        }
    
    def get_reward_range(self) -> Tuple[float, float]:
        """
        Define reward range
        
        Features:
        - Max: preference_weight*1.0 + change_weight*1.2 + temporal_weight*1.0
        - Min: preference_weight*-1.0 + change_weight*0.0 + temporal_weight*0.0
        
        Returns:
        - (min_reward, max_reward) tuple for RL libraries
        """
        max_reward = (
            self.preference_weight * 1.0 +  # Accepted
            self.change_weight * 1.2 +  # Max change reward
            self.temporal_weight * 1.0  # Fast decision
        )
        min_reward = (
            self.preference_weight * -1.0 +  # Rejected
            self.change_weight * 0.0 +  # No changes
            self.temporal_weight * 0.0  # Slow decision
        )
        return (min_reward, max_reward)
    
    def format_for_training(
        self,
        observation: Observation,
        action: Action,
        reward: Reward,
        next_observation: Optional[Observation] = None,
    ) -> Dict[str, Any]:
        """
        Format environment step for training (DPO format)
        
        Parameters:
        - observation: Current state
        - action: Action taken
        - reward: Reward received
        - next_observation: Optional next state
        
        Returns:
        - Dict with keys: input (observation), action, reward, next_observation, metadata
        - Metadata includes: episode_step, total_reward
        
        Features:
        - Converts all dataclasses to dicts (JSON-serializable)
        - Ready for DPO training pipeline
        """
        # Extract preferred/rejected rules from action based on reward
        # This assumes we have preference pairs from user feedback
        # For now, return the action-reward pair
        
        return {
            'input': observation.to_dict(),
            'action': action.to_dict(),
            'reward': reward.to_dict(),
            'next_observation': next_observation.to_dict() if next_observation else None,
            'metadata': {
                'episode_step': self.episode_step,
                'total_reward': sum(self.episode_rewards),
            },
        }

