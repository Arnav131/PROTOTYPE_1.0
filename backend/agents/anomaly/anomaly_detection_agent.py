"""
Rakshak Agent System — Anomaly Detection Agent
=================================================
3-tier anomaly detection pipeline that wraps the AI Engine
inference module and writes results to Django models.

Tier 1: Z-score + IQR (< 5ms) → fast statistical screen
Tier 2: Isolation Forest (< 50ms) → multivariate
Tier 3: VAE reconstruction (< 150ms) → deep learning
Meta:   GBM combining all tiers → calibrated probability
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
    3-tier anomaly detection pipeline.

    Receives SensorValidatedEvents from the ingestion agent,
    accumulates readings into windows, and runs the full
    AI Engine inference pipeline when ready.

    Creates Alert objects for detected anomalies and emits
    AnomalyEvents for downstream processing.

    From agents_README:
        Autonomy: Event-driven
        Latency: < 200ms (p99)
    """

    AGENT_NAME = "anomaly_detection"
    AGENT_VERSION = "1.0.0"

    def __init__(self, config: Optional[Dict] = None):
        super().__init__(config)
        self._pipeline = None
        self._alert_counter = 0

        # Model directory
        self._model_dir = self.config.get(
            "model_dir",
            os.path.join(settings.BASE_DIR, "..", "ai_engin", "trained_models")
        )

    def _ensure_pipeline(self):
        """Lazy-load the AI Engine inference pipeline."""
        if self._pipeline is not None:
            return

        try:
            from ai_engin.inference.pipeline import RakshakInferencePipeline
            self._pipeline = RakshakInferencePipeline(
                model_dir=self._model_dir,
                window_size=self.config.get("window_size", 64),
            )
            logger.info(f"[{self.AGENT_NAME}] AI Engine pipeline loaded")
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
        Process a sensor event through the 3-tier anomaly detection pipeline.

        Args:
            data: SensorValidatedEvent or dict with sensor values

        Returns:
            Dict with anomaly detection results and optional alert_id
        """
        self._ensure_pipeline()

        # Extract sensor values
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

        # Run inference pipeline
        if self._pipeline is None:
            return {
                "anomaly_detected": False,
                "error": "AI pipeline not loaded",
                "sensor_id": sensor_id,
            }

        result = self._pipeline.process_reading(
            ambient_temp=values["ambient_temp"],
            humidity=values["humidity"],
            vibration_rms=values["vibration_rms"],
            gauge_width=values["gauge_width"],
            sensor_id=str(sensor_id or "default"),
        )

        # Pipeline returns None while buffer is filling
        if result is None:
            return {
                "anomaly_detected": False,
                "buffering": True,
                "sensor_id": sensor_id,
            }

        # Build response
        response = {
            "anomaly_detected": result.anomaly.is_anomaly,
            "anomaly_score": result.anomaly.anomaly_score,
            "tier_scores": result.anomaly.tier_scores,
            "failure_prediction": result.failure.to_dict(),
            "processing_time_ms": result.processing_time_ms,
            "sensor_id": sensor_id,
        }

        # If anomaly detected → create Alert + AnomalyPrediction
        if result.anomaly.is_anomaly and track_section_id:
            alert_id = self._create_alert(
                track_section_id=track_section_id,
                sensor_id=sensor_id,
                reading_id=reading_id,
                result=result,
            )
            response["alert_id"] = alert_id

            # Add fault classification
            if result.fault.fault_type != "unknown":
                response["fault_type"] = result.fault.fault_type
                response["fault_confidence"] = result.fault.confidence
                response["fault_top_k"] = result.fault.top_k

            # Emit event
            response["event"] = AnomalyEvent(
                alert_id=alert_id,
                track_section_id=track_section_id,
                sensor_id=sensor_id,
                anomaly_score=result.anomaly.anomaly_score,
                is_anomaly=True,
                tier_scores=result.anomaly.tier_scores,
                fault_type=result.fault.fault_type,
                fault_confidence=result.fault.confidence,
                detected_at=timezone.now().isoformat(),
            )

        # If failure prediction is concerning → create predictive alert
        if result.failure.alert_level in ("warning", "critical") and track_section_id:
            self._create_predictive_alert(
                track_section_id=track_section_id,
                sensor_id=sensor_id,
                result=result,
            )

        return response

    def _create_alert(
        self,
        track_section_id: int,
        sensor_id: Optional[int],
        reading_id: Optional[int],
        result,
    ) -> int:
        """Create an Alert record for a detected anomaly."""
        from railway.models import Alert

        # Determine severity from anomaly score
        score = result.anomaly.anomaly_score
        if score >= 0.9:
            severity = Alert.Severity.CRITICAL
        elif score >= 0.7:
            severity = Alert.Severity.WARNING
        else:
            severity = Alert.Severity.INFO

        fault_info = ""
        if result.fault.fault_type != "unknown":
            fault_info = f" | Fault: {result.fault.fault_type} ({result.fault.confidence:.1%})"

        with transaction.atomic():
            alert = Alert.objects.create(
                alert_code=self._generate_alert_code(),
                track_section_id=track_section_id,
                sensor_id=sensor_id,
                trigger_reading_id=reading_id,
                alert_type=Alert.AlertType.ANOMALY,
                severity=severity,
                title=f"Anomaly Detected (score: {score:.2f})",
                description=(
                    f"3-tier anomaly detection triggered.\n"
                    f"Score: {score:.4f} | Threshold: {result.anomaly.threshold}\n"
                    f"Tier scores: {result.anomaly.tier_scores}{fault_info}"
                ),
                confidence_score=Decimal(str(round(score, 4))),
                generated_at=timezone.now(),
                generated_by=Alert.GeneratedBy.ML_MODEL,
            )

        self.log_event("create", "alert", alert.pk, f"Anomaly alert: score={score:.4f}")
        logger.info(f"[{self.AGENT_NAME}] Created alert {alert.alert_code} (severity={severity})")

        return alert.pk

    def _create_predictive_alert(
        self,
        track_section_id: int,
        sensor_id: Optional[int],
        result,
    ):
        """Create a predictive alert for failure predictions."""
        from railway.models import Alert

        probs = result.failure.probabilities
        max_horizon = max(probs, key=probs.get) if probs else "unknown"
        max_prob = max(probs.values()) if probs else 0

        severity = Alert.Severity.CRITICAL if result.failure.alert_level == "critical" else Alert.Severity.WARNING

        with transaction.atomic():
            alert = Alert.objects.create(
                alert_code=self._generate_alert_code(),
                track_section_id=track_section_id,
                sensor_id=sensor_id,
                alert_type=Alert.AlertType.PREDICTION,
                severity=severity,
                title=f"Failure Predicted within {max_horizon} (P={max_prob:.1%})",
                description=(
                    f"Multi-horizon failure prediction:\n"
                    + "\n".join(f"  {h}: {p:.1%}" for h, p in probs.items())
                    + f"\nAlert level: {result.failure.alert_level}"
                ),
                confidence_score=Decimal(str(round(max_prob, 4))),
                generated_at=timezone.now(),
                generated_by=Alert.GeneratedBy.ML_MODEL,
            )

        self.log_event("create", "alert", alert.pk, f"Predictive alert: {max_horizon}={max_prob:.4f}")
