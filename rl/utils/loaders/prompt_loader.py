"""
Utility for loading system prompts from JSON database
"""

import json
import os
from pathlib import Path
from typing import Optional, Dict, List
import requests


class PromptLoader:
    """Load system prompts from JSON database (file or API)"""
    
    def __init__(self, prompts_dir: Optional[str] = None, api_url: Optional[str] = None):
        """
        Initialize prompt loader
        
        Args:
            prompts_dir: Path to prompts directory (default: ../data/prompts)
            api_url: API URL for prompts (default: http://localhost:3000/api/prompts)
        """
        if prompts_dir is None:
            base_dir = Path(__file__).parent.parent
            prompts_dir = str(base_dir / 'data' / 'prompts')
        
        self.prompts_dir = Path(prompts_dir)
        self.api_url = api_url or 'http://localhost:3000/api/prompts'
        self._cache: Dict[str, Dict] = {}
        self.data_dir = self.prompts_dir
    
    def load_prompt(self, name: str, version: Optional[str] = None, use_api: bool = True) -> Dict:
        """
        Load a prompt by name and optional version
        
        Args:
            name: Prompt name (e.g., 'generator', 'matcher')
            version: Optional version string (e.g., '1.2.0')
            use_api: Whether to try API first, fallback to file
        
        Returns:
            Prompt configuration dictionary
        """
        cache_key = f"{name}:{version}" if version else name
        
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        if use_api:
            try:
                prompt = self._load_from_api(name, version)
                self._cache[cache_key] = prompt
                return prompt
            except Exception:
                pass
        
        prompt = self._load_from_file(name, version)
        self._cache[cache_key] = prompt
        return prompt
    
    def get_prompt_text(self, name: str, version: Optional[str] = None) -> str:
        """Get just the prompt text"""
        prompt = self.load_prompt(name, version)
        return prompt['prompt_text']
    
    def list_prompts(self) -> List[Dict]:
        """List all available prompts"""
        try:
            response = requests.get(self.api_url, timeout=5)
            response.raise_for_status()
            return response.json()
        except Exception:
            pass
        
        prompts = []
        if not self.prompts_dir.exists():
            return prompts
        
        for file in self.prompts_dir.glob('*.json'):
            try:
                with open(file, 'r') as f:
                    prompt = json.load(f)
                    prompts.append({
                        'name': prompt.get('name'),
                        'version': prompt.get('version'),
                        'component_type': prompt.get('component_type'),
                        'role': prompt.get('role'),
                    })
            except (json.JSONDecodeError, IOError):
                continue
        
        return prompts
    
    def _load_from_api(self, name: str, version: Optional[str] = None) -> Dict:
        """Load prompt from API"""
        url = f"{self.api_url}/{name}"
        if version:
            url += f"?version={version}"
        
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        return response.json()
    
    def _load_from_file(self, name: str, version: Optional[str] = None) -> Dict:
        """Load prompt from local file"""
        if version:
            filename = f"{name}-{version}.json"
        else:
            filename = f"{name}.json"
        
        filepath = self.prompts_dir / filename
        
        if not filepath.exists():
            # Try to find latest version
            files = list(self.prompts_dir.glob(f"{name}-*.json"))
            if files:
                filepath = sorted(files)[-1]  # Latest version
            else:
                raise FileNotFoundError(f"Prompt {name} not found in {self.prompts_dir}")
        
        with open(filepath, 'r') as f:
            return json.load(f)


# Convenience function
def load_prompt(name: str, version: Optional[str] = None) -> Dict:
    """Load a prompt (convenience function)"""
    loader = PromptLoader()
    return loader.load_prompt(name, version)

