"""
RL Environment for Taste's Creative Director Tool

This module provides backward compatibility imports.
New code should import from rl.core.environment instead.
"""

# Re-export from environment subpackage for backward compatibility
from .environment import (
    ActionType,
    UserResponse,
    Observation,
    Action,
    Reward,
    StepResult,
    DesignEnvironment,
    from_preference_event,
    create_environment_from_preferences,
)

__all__ = [
    'ActionType',
    'UserResponse',
    'Observation',
    'Action',
    'Reward',
    'StepResult',
    'DesignEnvironment',
    'from_preference_event',
    'create_environment_from_preferences',
]
