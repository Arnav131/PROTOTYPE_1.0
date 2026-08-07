# backend/ai_integration/api_views.py
"""
Rakshak AI Integration — API Views
======================================
JSON API endpoints for AI prediction requests and health monitoring.

Endpoints:
    POST /api/ai/predict/     — Run prediction on sensor data
    POST /api/ai/predict/batch/ — Batch predictions
    GET  /api/ai/health/      — AI subsystem health check
    GET  /api/ai/providers/   — List registered providers

All endpoints return JsonResponse — no template rendering.
These are consumed by the frontend dashboard and external integrations.

# ---------------------------------------------------------------------------
# DATABASE MIGRATION NOTE
#
# These views have MINIMAL database interaction:
#   - predict views: NO direct DB writes (predictions are in-memory).
#                    DB writes happen only if auto_alert/auto_ticket
#                    are requested, via AlertService/TicketService.
#   - health view: NO database interaction.
#   - providers view: NO database interaction.
#
# Current DB: SQLite
# Future DB: PostgreSQL
# Whether this code is PostgreSQL compatible: YES
# Whether teammate needs to modify anything: NO
# ---------------------------------------------------------------------------
"""

import json
import logging

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from ai_integration.prediction_service import PredictionService
from ai_integration.registry import ai_provider_registry
from ai_integration.serializers import (
    format_batch_prediction_response,
    format_error_response,
    format_health_response,
    format_prediction_response,
    validate_batch_prediction_request,
    validate_prediction_request,
)

logger = logging.getLogger("rakshak.ai_integration.api")


@csrf_exempt
@require_POST
def predict_view(request):
    """
    POST /api/ai/predict/

    Run a single sensor reading through the AI prediction pipeline.

    Request body (JSON):
        {
            "sensor_id": "SEN-VIB-001",
            "ambient_temp": 42.5,
            "humidity": 22.0,
            "vibration_rms": 0.85,
            "gauge_width": 1676.3,
            "timestamp": "2026-08-07T12:00:00+05:30",  (optional)
            "track_section_id": 7,                       (optional)
            "metadata": {"use_uncertainty": true}        (optional)
        }

    Response (JSON):
        {
            "success": true,
            "prediction": {
                "is_anomaly": true,
                "anomaly_score": 0.8723,
                "failure_probabilities": {"1h": 0.12, "6h": 0.34, "24h": 0.67},
                "fault_type": "thermal_buckle",
                "fault_confidence": 0.91,
                "alert_level": "warning",
                "processing_time_ms": 145.23,
                "provider_name": "local_pickle",
                "metadata": {...}
            }
        }

    Optional query parameters:
        ?auto_alert=true   — Auto-create Alert if anomaly detected
        ?auto_ticket=true  — Auto-create Ticket if alert created

    # -------------------------------------------------------------------
    # DATABASE MIGRATION NOTE
    #
    # This view does NOT write to the database by default.
    # Database writes only occur if auto_alert or auto_ticket
    # query params are set, in which case:
    #   - AlertService writes to rakshak_alert + rakshak_audit_log
    #   - TicketService writes to rakshak_ticket + rakshak_audit_log
    #
    # Current DB: SQLite
    # Future DB: PostgreSQL
    # PostgreSQL compatible: YES
    # Teammate action: NONE
    # -------------------------------------------------------------------
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse(
            format_error_response("Invalid JSON in request body"),
            status=400,
        )

    # Validate
    is_valid, error = validate_prediction_request(data)
    if not is_valid:
        return JsonResponse(format_error_response(error), status=400)

    # Run prediction
    service = PredictionService()
    response = service.predict_from_dict(data)

    # Optional: auto-create alert
    auto_alert = request.GET.get("auto_alert", "").lower() == "true"
    auto_ticket = request.GET.get("auto_ticket", "").lower() == "true"
    alert_id = None

    if auto_alert and response.is_anomaly and data.get("track_section_id"):
        from ai_integration.alert_service import AlertService

        alert_service = AlertService()
        alert_id = alert_service.create_anomaly_alert(
            response=response,
            track_section_id=data["track_section_id"],
        )

        # Also check for predictive alert
        if response.needs_alert:
            alert_service.create_predictive_alert(
                response=response,
                track_section_id=data["track_section_id"],
            )

    # Optional: auto-create ticket
    if auto_ticket and alert_id and data.get("track_section_id"):
        from ai_integration.ticket_service import TicketService

        ticket_service = TicketService()
        ticket_service.create_ticket_from_prediction(
            response=response,
            track_section_id=data["track_section_id"],
            alert_id=alert_id,
        )

    result = format_prediction_response(response)
    if alert_id:
        result["alert_id"] = alert_id

    return JsonResponse(result)


@csrf_exempt
@require_POST
def predict_batch_view(request):
    """
    POST /api/ai/predict/batch/

    Run batch predictions on multiple sensor readings.

    Request body (JSON):
        {
            "readings": [
                {"sensor_id": "S1", "ambient_temp": 42.5, ...},
                {"sensor_id": "S2", "ambient_temp": 38.0, ...}
            ],
            "track_section_id": 7  (optional, applied to all)
        }

    Response (JSON):
        {
            "success": true,
            "count": 2,
            "predictions": [...]
        }
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse(
            format_error_response("Invalid JSON in request body"),
            status=400,
        )

    is_valid, error = validate_batch_prediction_request(data)
    if not is_valid:
        return JsonResponse(format_error_response(error), status=400)

    service = PredictionService()
    responses = service.predict_batch(
        readings=data["readings"],
        track_section_id=data.get("track_section_id"),
    )

    return JsonResponse(format_batch_prediction_response(responses))


@require_GET
def health_view(request):
    """
    GET /api/ai/health/

    Returns health status of the AI subsystem.

    Response (JSON):
        {
            "success": true,
            "health": {
                "status": "healthy",
                "default_provider": "local",
                "providers": {
                    "local": {
                        "status": "healthy",
                        "models": {...},
                        "device": "cpu"
                    }
                }
            }
        }
    """
    health = PredictionService.get_health()
    return JsonResponse(format_health_response(health))


@require_GET
def providers_view(request):
    """
    GET /api/ai/providers/

    Lists all registered and configured AI providers.

    Response (JSON):
        {
            "success": true,
            "providers": {
                "local": "loaded (local_pickle)",
                "cloud": "configured (not loaded)"
            }
        }
    """
    providers = ai_provider_registry.list_providers()
    return JsonResponse({
        "success": True,
        "providers": providers,
    })
