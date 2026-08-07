# backend/ai_models/__init__.py
"""
Rakshak AI Models Package
===========================
Provides a lazy-loaded singleton of SimpleRakshakInferencePipeline.

Usage:
    from ai_models import get_pipeline

    pipeline = get_pipeline()
    result = pipeline.predict(
        ambient_temp=42.0,
        humidity=40.0,
        vibration_rms=4.8,
        gauge_width=1689.0,
    )
"""

import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger("rakshak.ai_models")

# Lazy-loaded pipeline singleton
_pipeline: Optional["SimpleRakshakInferencePipeline"] = None  # noqa: F821
_pipeline_init_attempted = False


def get_pipeline():
    """
    Return the global inference pipeline singleton.

    The pipeline is created on first call. Model files (anomaly_model.pkl,
    fault_model.pkl, model_config.json) are loaded from this directory.
    If models are missing the pipeline falls back to rule-based predictions.
    """
    global _pipeline, _pipeline_init_attempted

    if _pipeline is not None:
        return _pipeline

    if _pipeline_init_attempted:
        # Already tried and failed — don't retry every request
        return None

    _pipeline_init_attempted = True
    model_dir = Path(__file__).resolve().parent

    try:
        from ai_models.simple_pipeline import SimpleRakshakInferencePipeline
        _pipeline = SimpleRakshakInferencePipeline(model_dir=str(model_dir))
        health = _pipeline.health_check()
        logger.info(
            f"AI pipeline initialized — mode: {health['mode']}, "
            f"risk_model: {health['risk_model_loaded']}, "
            f"fault_model: {health['fault_model_loaded']}"
        )
    except Exception as e:
        logger.error(f"Failed to initialize AI pipeline: {e}", exc_info=True)
        _pipeline = None

    return _pipeline


def reset_pipeline():
    """Force re-initialization of the pipeline (e.g. after model update)."""
    global _pipeline, _pipeline_init_attempted
    _pipeline = None
    _pipeline_init_attempted = False
    logger.info("AI pipeline reset — will re-initialize on next call")
