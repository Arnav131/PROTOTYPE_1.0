# backend/ai_integration/local_provider.py
"""
Rakshak AI Integration — Local Pickle/PyTorch Provider
=========================================================
Concrete provider that wraps the existing RakshakInferencePipeline.

This provider bridges the gap between the new AI-agnostic interface
(PredictionRequest → PredictionResponse) and the existing AI Engine
(process_reading() → PredictionResult).

RESPONSIBILITY:
    - Lazy-load the RakshakInferencePipeline from ai_engin/
    - Translate PredictionRequest → pipeline.process_reading() args
    - Translate PredictionResult → PredictionResponse
    - Handle all pipeline errors gracefully (never crash business logic)

WHO SHOULD USE THIS:
    - AIProviderRegistry (via settings configuration)

WHO SHOULD NEVER USE THIS:
    - Business logic (use PredictionService instead)
    - Views or agents (they don't know about specific providers)

FUTURE REPLACEMENT:
    When the team moves to a cloud AI model or LLM, this provider
    can be swapped out by changing one line in settings.py:
        RAKSHAK_AI['DEFAULT_PROVIDER'] = 'cloud'
    No business logic changes required.

# ---------------------------------------------------------------------------
# DATABASE MIGRATION NOTE
#
# This module has ZERO database interaction.
# It only calls the ai_engin inference pipeline (pure Python/ML code).
# Current DB: SQLite
# Future DB: PostgreSQL
# Whether this code is PostgreSQL compatible: YES (no DB interaction)
# Whether teammate needs to modify anything: NO
# ---------------------------------------------------------------------------
"""

import logging
import os
import time
from typing import Any, Dict, Optional

from ai_integration.providers import (
    BaseAIProvider,
    PredictionRequest,
    PredictionResponse,
)

logger = logging.getLogger("rakshak.ai_integration.local")


class LocalPickleProvider(BaseAIProvider):
    """
    AI provider that wraps the local RakshakInferencePipeline.

    Loads trained models from the ai_engin/trained_models/ directory.
    Supports PyTorch (.pt) and joblib (.joblib) model files.

    This is the DEFAULT provider for the Rakshak prototype.

    Lazy initialization:
        The pipeline is NOT loaded at __init__ time. It is loaded on
        the first predict() call. This avoids import errors when:
        - Models haven't been trained yet
        - PyTorch is not installed in the environment
        - Running in a testing environment

    Thread safety:
        The underlying RakshakInferencePipeline is documented as
        thread-safe for Django request handling. This provider
        inherits that property.

    Graceful degradation:
        If the pipeline fails to load or any prediction fails, this
        provider returns a safe PredictionResponse with is_anomaly=False
        and anomaly_score=0.0. It NEVER raises exceptions into the
        caller.
    """

    def __init__(
        self,
        model_dir: str,
        window_size: int = 64,
        alert_threshold: float = 0.7,
        critical_threshold: float = 0.9,
    ):
        """
        Initialize the local provider configuration.

        NOTE: This does NOT load models. Models are lazy-loaded on
        first predict() call via _ensure_pipeline().

        Args:
            model_dir:           Path to the trained_models/ directory.
                                 Typically: <project_root>/ai_engin/trained_models/
            window_size:         Sliding window size for sequence models.
                                 Must match training configuration (default: 64).
            alert_threshold:     Failure probability threshold for 'warning' alerts.
            critical_threshold:  Failure probability threshold for 'critical' alerts.
        """
        self._model_dir = str(model_dir)
        self._window_size = window_size
        self._alert_threshold = alert_threshold
        self._critical_threshold = critical_threshold

        # Pipeline instance — lazy-loaded
        self._pipeline = None
        self._pipeline_loaded = False
        self._pipeline_error: Optional[str] = None

        logger.info(
            f"LocalPickleProvider configured "
            f"(model_dir={self._model_dir}, window_size={window_size})"
        )

    def _ensure_pipeline(self) -> bool:
        """
        Lazy-load the AI Engine inference pipeline.

        Returns:
            True if pipeline is ready, False if loading failed.

        Side effects:
            Sets self._pipeline on success.
            Sets self._pipeline_error on failure.

        IMPORTANT:
            This is the ONLY place in the entire backend where we
            import from ai_engin. This import is contained within
            the provider — business logic never sees it.

        FUTURE LLM INTEGRATION NOTE:
            A future LLMProvider would NOT have this method. Instead,
            it would initialize an HTTP client to the LLM API.
            The point is: each provider manages its own resources.
        """
        if self._pipeline is not None:
            return True

        if self._pipeline_loaded:
            # Already tried and failed — don't retry on every request.
            # Call reset() to retry.
            return False

        self._pipeline_loaded = True

        try:
            # =============================================================
            # THIS IS THE ONLY ai_engin IMPORT IN THE ENTIRE BACKEND
            #
            # Everything else goes through the provider abstraction.
            # If you need to change the AI engine, change ONLY this file.
            # =============================================================
            from ai_engin.inference.pipeline import RakshakInferencePipeline

            self._pipeline = RakshakInferencePipeline(
                model_dir=self._model_dir,
                window_size=self._window_size,
                alert_threshold=self._alert_threshold,
                critical_threshold=self._critical_threshold,
            )

            logger.info(
                f"LocalPickleProvider: AI Engine pipeline loaded successfully "
                f"(device={self._pipeline.registry.device})"
            )
            return True

        except FileNotFoundError as e:
            self._pipeline_error = (
                f"Model directory not found: {self._model_dir}. "
                f"Train models first. Error: {e}"
            )
            logger.warning(f"LocalPickleProvider: {self._pipeline_error}")
            return False

        except ImportError as e:
            self._pipeline_error = (
                f"AI Engine dependencies not installed (torch, joblib, etc.). "
                f"Install with: pip install -r ai_engin/requirements_colab.txt. "
                f"Error: {e}"
            )
            logger.warning(f"LocalPickleProvider: {self._pipeline_error}")
            return False

        except Exception as e:
            self._pipeline_error = f"Failed to load AI pipeline: {e}"
            logger.error(f"LocalPickleProvider: {self._pipeline_error}", exc_info=True)
            return False

    def predict(self, request: PredictionRequest) -> PredictionResponse:
        """
        Run prediction using the local AI Engine pipeline.

        Translates:
            PredictionRequest → pipeline.process_reading() → PredictionResponse

        If the pipeline is not loaded or prediction fails, returns a
        safe default PredictionResponse (is_anomaly=False, score=0.0).

        Args:
            request: Standardized prediction input.

        Returns:
            PredictionResponse — always. Never raises.
        """
        t0 = time.time()

        # --- Ensure pipeline is loaded ---
        if not self._ensure_pipeline():
            return PredictionResponse(
                is_anomaly=False,
                anomaly_score=0.0,
                provider_name=self.get_provider_name(),
                processing_time_ms=(time.time() - t0) * 1000,
                metadata={"error": self._pipeline_error or "Pipeline not loaded"},
            )

        # --- Run prediction through the AI Engine ---
        try:
            result = self._pipeline.process_reading(
                ambient_temp=request.ambient_temp,
                humidity=request.humidity,
                vibration_rms=request.vibration_rms,
                gauge_width=request.gauge_width,
                timestamp=request.timestamp,
                sensor_id=request.sensor_id,
            )

            elapsed_ms = (time.time() - t0) * 1000

            # --- Pipeline returns None while buffer is filling ---
            if result is None:
                return PredictionResponse(
                    is_anomaly=False,
                    anomaly_score=0.0,
                    provider_name=self.get_provider_name(),
                    processing_time_ms=elapsed_ms,
                    metadata={"status": "buffering", "sensor_id": request.sensor_id},
                )

            # --- Translate PredictionResult → PredictionResponse ---
            return self._translate_result(result, elapsed_ms)

        except Exception as e:
            elapsed_ms = (time.time() - t0) * 1000
            logger.error(
                f"LocalPickleProvider: Prediction failed for sensor "
                f"{request.sensor_id}: {e}",
                exc_info=True,
            )
            return PredictionResponse(
                is_anomaly=False,
                anomaly_score=0.0,
                provider_name=self.get_provider_name(),
                processing_time_ms=elapsed_ms,
                metadata={"error": str(e)},
            )

    def _translate_result(self, result, elapsed_ms: float) -> PredictionResponse:
        """
        Translate the ai_engin PredictionResult into our PredictionResponse.

        This is the translation boundary between the AI Engine's internal
        data structures and our provider-agnostic contract.

        The ai_engin PredictionResult has:
            result.anomaly    → AnomalyResult(is_anomaly, anomaly_score, tier_scores)
            result.failure    → FailurePrediction(probabilities, uncertainty, alert_level)
            result.fault      → FaultClassification(fault_type, confidence, top_k)

        We flatten this into our single PredictionResponse.

        FUTURE NOTE:
            If the AI Engine changes its PredictionResult shape, ONLY
            this method needs to change. Business logic is unaffected.
        """
        # --- Extract anomaly data ---
        is_anomaly = result.anomaly.is_anomaly
        anomaly_score = float(result.anomaly.anomaly_score)

        # --- Extract failure prediction data ---
        failure_probs = {}
        if result.failure and result.failure.probabilities:
            failure_probs = {
                k: float(v) for k, v in result.failure.probabilities.items()
            }

        alert_level = "none"
        if result.failure:
            alert_level = result.failure.alert_level or "none"

        # --- Extract fault classification data ---
        fault_type = "unknown"
        fault_confidence = 0.0
        if result.fault:
            fault_type = result.fault.fault_type or "unknown"
            fault_confidence = float(result.fault.confidence)

        # --- Build metadata with detailed diagnostics ---
        metadata = {}
        if result.anomaly.tier_scores:
            metadata["tier_scores"] = {
                k: round(float(v), 4)
                for k, v in result.anomaly.tier_scores.items()
            }
        if result.failure and result.failure.uncertainty:
            metadata["uncertainty"] = {
                k: round(float(v), 4)
                for k, v in result.failure.uncertainty.items()
            }
        if result.fault and result.fault.top_k:
            metadata["fault_top_k"] = result.fault.top_k

        return PredictionResponse(
            is_anomaly=is_anomaly,
            anomaly_score=anomaly_score,
            failure_probabilities=failure_probs,
            fault_type=fault_type,
            fault_confidence=fault_confidence,
            alert_level=alert_level,
            processing_time_ms=elapsed_ms,
            provider_name=self.get_provider_name(),
            raw_result=result.to_dict() if hasattr(result, "to_dict") else None,
            metadata=metadata,
        )

    def health_check(self) -> Dict[str, Any]:
        """
        Check if the local AI pipeline is ready.

        Returns diagnostics including:
            - Whether models are loaded
            - Which models are available
            - Device (CPU/GPU)
            - Any pipeline errors
        """
        base = {
            "status": "unhealthy",
            "provider": self.get_provider_name(),
            "model_dir": self._model_dir,
            "model_dir_exists": os.path.isdir(self._model_dir),
        }

        if self._pipeline_error:
            base["error"] = self._pipeline_error
            return base

        if not self._ensure_pipeline():
            base["error"] = self._pipeline_error or "Pipeline not initialized"
            return base

        try:
            pipeline_health = self._pipeline.health_check()
            base.update({
                "status": pipeline_health.get("status", "unknown"),
                "models": pipeline_health.get("models", {}),
                "device": pipeline_health.get("device", "unknown"),
                "window_size": pipeline_health.get("window_size", self._window_size),
                "active_buffers": pipeline_health.get("active_buffers", 0),
            })
        except Exception as e:
            base["status"] = "degraded"
            base["error"] = f"Health check failed: {e}"

        return base

    def get_provider_name(self) -> str:
        """Return the stable identifier for this provider."""
        return "local_pickle"

    def reset(self):
        """
        Force re-initialization of the pipeline.

        Use this after:
            - Deploying new model files
            - Fixing a model loading error
            - Changing model configuration
        """
        self._pipeline = None
        self._pipeline_loaded = False
        self._pipeline_error = None
        logger.info("LocalPickleProvider: Reset — pipeline will reload on next predict()")
