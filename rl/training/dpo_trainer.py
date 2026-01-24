"""
DPO Training Module

Implements Direct Preference Optimization (DPO) training for design rule preferences.
Supports both API-based fine-tuning (OpenAI, Anthropic) and local training.
"""

import json
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import numpy as np
from tqdm import tqdm

# jsonlines is in requirements.txt - install with: pip install jsonlines
try:
    import jsonlines
except ImportError:
    jsonlines = None
    print("Warning: jsonlines not installed. Install with: pip install jsonlines")


@dataclass
class DPOTrainingConfig:
    """Configuration for DPO training."""
    # Model settings
    base_model: str = "gpt-3.5-turbo"  # Base model to fine-tune
    model_type: str = "openai"  # "openai" | "anthropic" | "local"
    
    # Training hyperparameters
    learning_rate: float = 1e-5
    batch_size: int = 4
    num_epochs: int = 3
    beta: float = 0.1  # DPO temperature parameter
    
    # Data settings
    train_file: str = "data/training_dataset/train.jsonl"
    val_file: str = "data/training_dataset/val.jsonl"
    max_samples: Optional[int] = None
    
    # Output settings
    output_dir: str = "data/trained_models"
    checkpoint_dir: Optional[str] = None
    
    # API settings (for OpenAI/Anthropic fine-tuning)
    api_key: Optional[str] = None
    organization: Optional[str] = None


class DPOTrainer:
    """
    DPO Trainer for design rule preferences.
    
    Features:
    - Loads preference pairs from JSONL
    - Formats for DPO training
    - Supports API-based fine-tuning (OpenAI, Anthropic)
    - Supports local training (if transformers available)
    - Evaluation and checkpointing
    """
    
    def __init__(self, config: DPOTrainingConfig):
        """Initialize trainer with configuration."""
        self.config = config
        self.output_dir = Path(config.output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        if config.checkpoint_dir:
            self.checkpoint_dir = Path(config.checkpoint_dir)
            self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        else:
            self.checkpoint_dir = self.output_dir / "checkpoints"
            self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
    
    def load_dataset(self, filepath: str) -> List[Dict[str, Any]]:
        """Load preference pairs from JSONL file."""
        if jsonlines is None:
            raise ImportError("jsonlines required. Install with: pip install jsonlines")
        
        pairs = []
        path = Path(filepath)
        
        if not path.exists():
            raise FileNotFoundError(f"Dataset file not found: {filepath}")
        
        with jsonlines.open(path) as reader:
            for item in reader:
                pairs.append(item)
        
        if self.config.max_samples:
            pairs = pairs[:self.config.max_samples]
        
        return pairs
    
    def format_for_api_training(
        self,
        pairs: List[Dict[str, Any]],
        format_type: str = "openai"
    ) -> List[Dict[str, Any]]:
        """
        Format preference pairs for API-based fine-tuning.
        
        Formats:
        - OpenAI: messages format with system/user/assistant
        - Anthropic: similar messages format
        """
        formatted = []
        
        for pair in pairs:
            input_context = pair.get('input', {})
            preferred = pair.get('preferred', {})
            rejected = pair.get('rejected', {})
            
            # Build prompt from input context
            prompt = self._build_prompt(input_context)
            
            # Format preferred response
            preferred_response = self._format_rule_response(preferred)
            
            # Format rejected response
            rejected_response = self._format_rule_response(rejected)
            
            if format_type == "openai":
                # OpenAI fine-tuning format
                formatted.append({
                    "messages": [
                        {"role": "system", "content": "You are a design assistant that suggests design improvement rules."},
                        {"role": "user", "content": prompt},
                        {"role": "assistant", "content": preferred_response}
                    ],
                    "metadata": {
                        "preferred_rule_id": preferred.get('rule_id'),
                        "rejected_rule_id": rejected.get('rule_id'),
                        "source": pair.get('source'),
                        "weight": pair.get('weight', 1.0),
                    }
                })
            elif format_type == "anthropic":
                # Anthropic format (similar structure)
                formatted.append({
                    "input": prompt,
                    "output": preferred_response,
                    "rejected_output": rejected_response,
                    "metadata": pair.get('metadata', {}),
                })
        
        return formatted
    
    def _build_prompt(self, input_context: Dict[str, Any]) -> str:
        """Build prompt from input context."""
        parts = []
        
        if input_context.get('user_intent'):
            parts.append(f"User intent: {input_context['user_intent']}")
        
        if input_context.get('component_type'):
            parts.append(f"Component type: {input_context['component_type']}")
        
        if input_context.get('platform'):
            parts.append(f"Platform: {input_context['platform']}")
        
        if input_context.get('snapshot_id'):
            parts.append(f"Snapshot: {input_context['snapshot_id']}")
        
        prompt = "\n".join(parts) if parts else "Suggest design improvement rules."
        prompt += "\n\nSuggest a design improvement rule:"
        
        return prompt
    
    def _format_rule_response(self, rule: Dict[str, Any]) -> str:
        """Format rule as text response."""
        parts = []
        
        if rule.get('rule_id'):
            parts.append(f"Rule ID: {rule['rule_id']}")
        
        if rule.get('description'):
            parts.append(f"Description: {rule['description']}")
        
        if rule.get('scope'):
            parts.append(f"Scope: {rule['scope']}")
        
        if rule.get('dimension'):
            parts.append(f"Dimension: {rule['dimension']}")
        
        if rule.get('confidence'):
            parts.append(f"Confidence: {rule['confidence']}")
        
        return "\n".join(parts)
    
    def train_with_openai_api(
        self,
        train_pairs: List[Dict[str, Any]],
        val_pairs: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Train using OpenAI fine-tuning API.
        
        Note: OpenAI fine-tuning uses supervised fine-tuning format, not direct DPO.
        This converts preference pairs to SFT format (preferred responses only).
        """
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("openai package required for OpenAI fine-tuning. Install with: pip install openai")
        
        if not self.config.api_key:
            raise ValueError("API key required for OpenAI fine-tuning. Set config.api_key")
        
        client = OpenAI(api_key=self.config.api_key)
        
        # Format training data
        print("Formatting training data for OpenAI...")
        formatted_train = self.format_for_api_training(train_pairs, format_type="openai")
        
        if jsonlines is None:
            raise ImportError("jsonlines required. Install with: pip install jsonlines")
        
        # Save training file
        train_file_path = self.output_dir / "openai_train.jsonl"
        with jsonlines.open(train_file_path, mode='w') as writer:
            for item in formatted_train:
                writer.write(item)
        
        print(f"Created training file: {train_file_path} ({len(formatted_train)} examples)")
        
        # Upload file to OpenAI
        print("Uploading to OpenAI...")
        with open(train_file_path, 'rb') as f:
            upload_response = client.files.create(
                file=f,
                purpose='fine-tune'
            )
        
        file_id = upload_response.id
        print(f"Uploaded file ID: {file_id}")
        
        # Create fine-tuning job
        print("Creating fine-tuning job...")
        job_response = client.fine_tuning.jobs.create(
            training_file=file_id,
            model=self.config.base_model,
            hyperparameters={
                "n_epochs": self.config.num_epochs,
                "batch_size": self.config.batch_size,
                "learning_rate_multiplier": self.config.learning_rate / 1e-5,
            }
        )
        
        job_id = job_response.id
        print(f"Fine-tuning job created: {job_id}")
        print(f"Monitor progress at: https://platform.openai.com/fine_tuning/jobs/{job_id}")
        
        # Save job info
        job_info = {
            'job_id': job_id,
            'file_id': file_id,
            'base_model': self.config.base_model,
            'num_examples': len(formatted_train),
            'status': 'created',
        }
        
        with open(self.output_dir / "openai_job_info.json", 'w') as f:
            json.dump(job_info, f, indent=2)
        
        return job_info
    
    def train_local(
        self,
        train_pairs: List[Dict[str, Any]],
        val_pairs: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Train locally using transformers library.
        
        Requires: transformers, torch, trl (Transformers Reinforcement Learning)
        """
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
            from trl import DPOTrainer as TRLDPOTrainer, DPOTrainingArguments
        except ImportError:
            raise ImportError(
                "Local training requires: transformers, torch, trl\n"
                "Install with: pip install transformers torch trl"
            )
        
        print("Loading model and tokenizer...")
        model = AutoModelForCausalLM.from_pretrained(self.config.base_model)
        tokenizer = AutoTokenizer.from_pretrained(self.config.base_model)
        
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
        
        # Format data for DPO
        print("Formatting data for DPO...")
        train_dataset = self._prepare_dpo_dataset(train_pairs, tokenizer)
        val_dataset = self._prepare_dpo_dataset(val_pairs, tokenizer) if val_pairs else None
        
        # Training arguments
        training_args = DPOTrainingArguments(
            output_dir=str(self.checkpoint_dir),
            num_train_epochs=self.config.num_epochs,
            per_device_train_batch_size=self.config.batch_size,
            learning_rate=self.config.learning_rate,
            beta=self.config.beta,
            logging_steps=10,
            save_steps=100,
            evaluation_strategy="steps" if val_dataset else "no",
            eval_steps=100 if val_dataset else None,
        )
        
        # Reference model (same as base model for DPO)
        ref_model = AutoModelForCausalLM.from_pretrained(self.config.base_model)
        
        # DPO Trainer
        dpo_trainer = TRLDPOTrainer(
            model=model,
            ref_model=ref_model,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=val_dataset,
            tokenizer=tokenizer,
            beta=self.config.beta,
        )
        
        # Train
        print("Starting training...")
        dpo_trainer.train()
        
        # Save final model
        final_model_path = self.output_dir / "final_model"
        dpo_trainer.save_model(str(final_model_path))
        tokenizer.save_pretrained(str(final_model_path))
        
        print(f"Training complete! Model saved to {final_model_path}")
        
        return {
            'model_path': str(final_model_path),
            'num_train_examples': len(train_pairs),
            'num_val_examples': len(val_pairs) if val_pairs else 0,
        }
    
    def _prepare_dpo_dataset(
        self,
        pairs: List[Dict[str, Any]],
        tokenizer: Any,
    ) -> Any:
        """Prepare dataset for DPO training (simplified - requires proper dataset class)."""
        # This is a placeholder - actual implementation would use Dataset class
        # and proper tokenization
        raise NotImplementedError(
            "Local DPO training requires proper dataset preparation.\n"
            "Use API-based training (train_with_openai_api) or implement dataset class."
        )
    
    def train(
        self,
        train_file: Optional[str] = None,
        val_file: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Main training function.
        
        Parameters:
        - train_file: Path to training JSONL (default: config.train_file)
        - val_file: Path to validation JSONL (default: config.val_file)
        """
        train_file = train_file or self.config.train_file
        val_file = val_file or self.config.val_file
        
        print("=" * 80)
        print("DPO Training")
        print("=" * 80)
        
        # Load datasets
        print("\n1. Loading datasets...")
        train_pairs = self.load_dataset(train_file)
        val_pairs = self.load_dataset(val_file) if val_file and Path(val_file).exists() else None
        
        print(f"Training examples: {len(train_pairs)}")
        if val_pairs:
            print(f"Validation examples: {len(val_pairs)}")
        
        # Train based on model type
        if self.config.model_type == "openai":
            return self.train_with_openai_api(train_pairs, val_pairs)
        elif self.config.model_type == "local":
            return self.train_local(train_pairs, val_pairs)
        else:
            raise ValueError(f"Unsupported model_type: {self.config.model_type}")


def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Train model with DPO")
    parser.add_argument(
        "--config",
        type=str,
        help="Path to training config JSON file"
    )
    parser.add_argument(
        "--train-file",
        type=str,
        help="Training dataset JSONL file"
    )
    parser.add_argument(
        "--val-file",
        type=str,
        help="Validation dataset JSONL file"
    )
    parser.add_argument(
        "--model-type",
        type=str,
        choices=["openai", "local"],
        default="openai",
        help="Training method"
    )
    parser.add_argument(
        "--base-model",
        type=str,
        default="gpt-3.5-turbo",
        help="Base model to fine-tune"
    )
    parser.add_argument(
        "--api-key",
        type=str,
        help="API key for fine-tuning"
    )
    
    args = parser.parse_args()
    
    # Load config or use defaults
    if args.config:
        with open(args.config, 'r') as f:
            config_dict = json.load(f)
        config = DPOTrainingConfig(**config_dict)
    else:
        config = DPOTrainingConfig()
    
    # Override with CLI args
    if args.train_file:
        config.train_file = args.train_file
    if args.val_file:
        config.val_file = args.val_file
    if args.model_type:
        config.model_type = args.model_type
    if args.base_model:
        config.base_model = args.base_model
    if args.api_key:
        config.api_key = args.api_key
    
    # Train
    trainer = DPOTrainer(config)
    result = trainer.train()
    
    print("\n" + "=" * 80)
    print("Training initiated!")
    print(json.dumps(result, indent=2))
    print("=" * 80)


if __name__ == "__main__":
    main()

