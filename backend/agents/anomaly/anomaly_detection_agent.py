"""
Rakshak Agent System — Anomaly Detection Agent
=================================================
Anomaly detection agent that wraps the SimpleRakshakInferencePipeline.

Uses the trained PyTorch MLP models (anomaly_model.pkl, fault_model.pkl)
for inference, with a transparent rule-layer for safety overrides.
Falls back to pure rule-based predictions if models are unavailable.
"""

import logging
import os
from decimal import Decimal
from typing import Any, Dict, Optional

from django.db import transaction
from django.utils import timezone
from django.conf import settings

from agents.shared.base_agent import BaseAgent
from agents.shared.events import AnomalyEvent, SensorValidatedEvent

logger = logging.getLogger("rakshak.agents.anomaly")


class AnomalyDetectionAgent(BaseAgent):
    """
    Anomaly detection agent backed by SimpleRakshakInferencePipeline.

    Receives SensorValidatedEvents (or raw dicts) with sensor values,
    runs inference through the simple pipeline, creates Alert objects
    for detected anomalies, and emits AnomalyEvents for downstream agents.

    The pipeline handles:
        - Feature engineering (4 raw sensors → 22 engineered features)
        - Feature scaling (scaler stored inside .pkl)
        - PyTorch MLP inference (anomaly + fault classification)
        - Rule-layer safety overrides
        - Fallback to rule-only mode if models are missing

    From agents_README:
        Autonomy: Event-driven
        Latency: < 200ms (p99)
    """

    AGENT_NAME = "anomaly_detection"
    AGENT_VERSION = "1.1.0"

    def __init__(self, config: Optional[Dict] = None):
        super().__init__(config)
        self._pipeline = None
        self._alert_counter = 0

        # Model directory — defaults to backend/ai_models/
        self._model_dir = self.config.get(
            "model_dir",
            os.path.join(settings.BASE_DIR, "ai_models")
        )

    def _ensure_pipeline(self):
        """Lazy-load the SimpleRakshakInferencePipeline."""
        if self._pipeline is not None:
            return

        try:
            # Try the singleton first (shared with the API layer)
            from ai_models import get_pipeline
            self._pipeline = get_pipeline()
            if self._pipeline is not None:
                logger.info(f"[{self.AGENT_NAME}] Using shared AI pipeline singleton")
                return
        except ImportError:
            pass

        # Fall back to creating our own instance
        try:
            from ai_models.simple_pipeline import SimpleRakshakInferencePipeline
            self._pipeline = SimpleRakshakInferencePipeline(
                model_dir=self._model_dir,
            )
            health = self._pipeline.health_check()
            logger.info(
                f"[{self.AGENT_NAME}] AI pipeline loaded — "
                f"mode: {health['mode']}, version: {health.get('model_version', 'n/a')}"
            )
        except Exception as e:
            logger.error(f"[{self.AGENT_NAME}] Failed to load AI pipeline: {e}")
            self._pipeline = None

    def _generate_alert_code(self) -> str:
        """Generate a unique alert code."""
        self._alert_counter += 1
        now = timezone.now()
        return f"ALT-{now.strftime('%Y%m%d')}-{self._alert_counter:04d}"

    def process(self, data: Any) -> Dict:
        """
        Process a sensor event through the anomaly detection pipeline.

        Args:
            data: SensorValidatedEvent or dict with sensor values:
                  {ambient_temp, humidity, vibration_rms, gauge_width,
                   sensor_id?, track_section_id?, reading_id?}

        Returns:
            Dict with anomaly detection results and optional alert_id
        """
        self._ensure_pipeline()

        # Extract sensor values from event or dict
        if isinstance(data, SensorValidatedEvent):
            sensor_id = data.sensor_id
            track_section_id = data.track_section_id
            reading_id = data.reading_id
            values = {
                "ambient_temp": data.ambient_temp,
                "humidity": data.humidity,
                "vibration_rms": data.vibration_rms,
                "gauge_width": data.gauge_width,
            }
        else:
            sensor_id = data.get("sensor_id")
            track_section_id = data.get("track_section_id")
            reading_id = data.get("reading_id")
            values = {
                "ambient_temp": data.get("ambient_temp", 0),
                "humidity": data.get("humidity", 0),
                "vibration_rms": data.get("vibration_rms", 0),
                "gauge_width": data.get("gauge_width", 0),
            }

        # Run inference
        if self._pipeline is None:
            return {
                "anomaly_detected": False,
                "error": "AI pipeline not loaded",
                "sensor_id": sensor_id,
            }

        # SimpleRakshakInferencePipeline.predict() returns a flat dict:
        #   {anomaly_score, is_anomaly, alert_level, fault_type,
        #    fault_confidence, explanation, processing_time_ms, model_used, ...}
        result = self._pipeline.predict(**values)

        # Build response
        response = {
            "anomaly_detected": result.get("is_anomaly", False),
            "anomaly_score": result.get("anomaly_score", 0.0),
            "alert_level": result.get("alert_level", "none"),
            "fault_type": result.get("fault_type", "unknown"),
            "fault_confidence": result.get("fault_confidence", 0.0),
            "explanation": result.get("explanation", ""),
            "processing_time_ms": result.get("processing_time_ms", 0.0),
            "model_used": result.get("model_used", "unknown"),
            "sensor_id": sensor_id,
        }

        # Include fault top-k if available
        if "fault_top_k" in result:
            response["fault_top_k"] = result["fault_top_k"]

        # Include rule triggers if available
        if "rule_triggers" in result:
            response["rule_triggers"] = result["rule_triggers"]

        # If anomaly detected → create Alert in DB
        if result.get("is_anomaly") and track_section_id:
            alert_id = self._create_alert(
                track_section_id=track_section_id,
                sensor_id=sensor_id,
                reading_id=reading_id,
                result=result,
            )
            response["alert_id"] = alert_id

            # Emit event for downstream agents
            response["event"] = AnomalyEvent(
                alert_id=alert_id,
                track_section_id=track_section_id,
                sensor_id=sensor_id or 0,
                anomaly_score=result.get("anomaly_score", 0.0),
                is_anomaly=True,
                fault_type=result.get("fault_type", ""),
                fault_confidence=result.get("fault_confidence", 0.0),
                detected_at=timezone.now().isoformat(),
            )

        return response

    def _create_alert(
        self,
        track_section_id: int,
        sensor_id: Optional[int],
        reading_id: Optional[int],
        result: dict,
    ) -> int:
        """Create an Alert record for a detected anomaly."""
        from railway.models import Alert

        # Determine severity from anomaly score
        score = result.get("anomaly_score", 0.0)
        alert_level = result.get("alert_level", "none")

        if alert_level == "critical" or score >= 0.9:
            severity = "critical"
        elif alert_level == "warning" or score >= 0.7:
            severity = "warning"
        else:
            severity = "info"

        fault_type = result.get("fault_type", "unknown")
        fault_confidence = result.get("fault_confidence", 0.0)
        explanation = result.get("explanation", "")

        with transaction.atomic():
            alert = Alert.objects.create(
                alert_code=self._generate_alert_code(),
                track_section_id=track_section_id,
                sensor_id=sensor_id,
                trigger_reading_id=reading_id,
                alert_type="anomaly",
                severity=severity,
                title=f"Anomaly Detected: {fault_type} (score: {score:.2f})",
                description=(
                    f"AI pipeline anomaly detection.\n"
                    f"Score: {score:.4f} | Alert level: {alert_level}\n"
                    f"Fault: {fault_type} ({fault_confidence:.1%})\n"
                    f"Model: {result.get('model_used', 'unknown')}\n"
                    f"Explanation: {explanation}"
                ),
                confidence_score=Decimal(str(round(score, 4))),
                generated_at=timezone.now(),
                generated_by="ml_model",
            )

        self.log_event("create", "alert", alert.pk, f"Anomaly alert: score={score:.4f}")
        logger.info(f"[{self.AGENT_NAME}] Created alert {alert.alert_code} (severity={severity})")

        return alert.pk
