# backend/bounty/views.py
"""
Bounty Features — Agent Task Tools Views.

Provides:
    1. Template view for the Agent Tasks page
    2. API: seeded agent-task records with checklist state
    3. API: checklist state management (GET/POST)
    4. API: structured review packet export

All data is self-contained — no dependency on existing models.
Uses in-memory + session storage for prototype checklist persistence.
"""

import json
import copy
from datetime import datetime

from django.http import JsonResponse, HttpResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET

# ── In-memory checklist state store (prototype — session-backed) ─────
_checklist_store = {}

# ── Seeded agent-task records ────────────────────────────────────────
# 8 demo records with varied states to satisfy bounty requirements.
# Each record represents an agent task with required inputs, sections,
# validation state, and ownership.

SEED_TASKS = [
    {
        "id": "AT-001",
        "title": "Anomaly Detection — Track Section NDL-AGR-01",
        "section": "Anomaly Detection",
        "status": "complete",
        "owner": "anomaly_detection",
        "agent": "AnomalyDetectionAgent",
        "created_at": "2026-08-07 09:15:00",
        "missing_data": False,
        "notes": "All sensor inputs validated. No missing fields.",
        "validation_warnings": [],
        "generated_content": {
            "anomaly_score": 0.87,
            "alert_level": "warning",
            "fault_type": "gauge_deviation",
            "fault_confidence": 0.82,
            "explanation": "Gauge width 1692mm exceeds normal ±2mm tolerance. Vibration RMS 4.2 mm/s elevated.",
            "model_used": "pytorch_mlp",
        },
        "checklist": {
            "items": [
                {"key": "ambient_temp", "label": "Ambient Temperature (°C)", "required": True, "checked": True, "value": "42.0"},
                {"key": "humidity", "label": "Humidity (%)", "required": True, "checked": True, "value": "38.5"},
                {"key": "vibration_rms", "label": "Vibration RMS (mm/s)", "required": True, "checked": True, "value": "4.2"},
                {"key": "gauge_width", "label": "Gauge Width (mm)", "required": True, "checked": True, "value": "1692.0"},
                {"key": "track_section_id", "label": "Track Section ID", "required": True, "checked": True, "value": "NDL-AGR-01"},
                {"key": "sensor_id", "label": "Sensor ID", "required": False, "checked": True, "value": "SNS-VIB-042"},
            ],
        },
    },
    {
        "id": "AT-002",
        "title": "Fault Classification — Track Section MUM-PUN-03",
        "section": "Fault Classification",
        "status": "in_progress",
        "owner": "fault_classifier",
        "agent": "FaultClassificationAgent",
        "created_at": "2026-08-07 11:30:00",
        "missing_data": True,
        "notes": "Missing humidity sensor data. Partial classification run.",
        "validation_warnings": ["Humidity reading missing — using fallback value 50%", "Confidence may be reduced"],
        "generated_content": {
            "anomaly_score": 0.65,
            "alert_level": "warning",
            "fault_type": "vibration_anomaly",
            "fault_confidence": 0.58,
            "explanation": "Vibration spike detected at 5.1 mm/s. Humidity data unavailable — using default.",
            "model_used": "pytorch_mlp",
        },
        "checklist": {
            "items": [
                {"key": "ambient_temp", "label": "Ambient Temperature (°C)", "required": True, "checked": True, "value": "39.0"},
                {"key": "humidity", "label": "Humidity (%)", "required": True, "checked": False, "value": ""},
                {"key": "vibration_rms", "label": "Vibration RMS (mm/s)", "required": True, "checked": True, "value": "5.1"},
                {"key": "gauge_width", "label": "Gauge Width (mm)", "required": True, "checked": True, "value": "1678.0"},
                {"key": "track_section_id", "label": "Track Section ID", "required": True, "checked": True, "value": "MUM-PUN-03"},
                {"key": "sensor_id", "label": "Sensor ID", "required": False, "checked": False, "value": ""},
            ],
        },
    },
    {
        "id": "AT-003",
        "title": "Root Cause Analysis — Alert ALT-20260807-0012",
        "section": "Root Cause Analysis",
        "status": "complete",
        "owner": "root_cause",
        "agent": "RootCauseAgent",
        "created_at": "2026-08-07 14:45:00",
        "missing_data": False,
        "notes": "Root cause identified: thermal expansion causing gauge deviation.",
        "validation_warnings": [],
        "generated_content": {
            "root_cause": "thermal_expansion",
            "confidence": 0.91,
            "contributing_factors": ["High ambient temperature (48°C)", "Direct sun exposure", "Concrete sleeper heat absorption"],
            "recommendation": "Install heat reflectors. Schedule night inspection.",
            "model_used": "rule_engine",
        },
        "checklist": {
            "items": [
                {"key": "alert_id", "label": "Alert ID", "required": True, "checked": True, "value": "ALT-20260807-0012"},
                {"key": "anomaly_score", "label": "Anomaly Score", "required": True, "checked": True, "value": "0.87"},
                {"key": "fault_type", "label": "Fault Type", "required": True, "checked": True, "value": "gauge_deviation"},
                {"key": "sensor_history", "label": "Sensor History (24h)", "required": True, "checked": True, "value": "7 readings loaded"},
                {"key": "weather_data", "label": "Weather Data", "required": False, "checked": True, "value": "Clear, 48°C"},
            ],
        },
    },
    {
        "id": "AT-004",
        "title": "Speed Restriction Advisory — Zone NR Sector 7",
        "section": "Speed Restriction",
        "status": "pending",
        "owner": "speed_restriction",
        "agent": "SpeedRestrictionAgent",
        "created_at": "2026-08-07 16:00:00",
        "missing_data": True,
        "notes": "Awaiting track geometry survey data.",
        "validation_warnings": ["Track geometry data not uploaded", "Cannot compute safe speed without geometry"],
        "generated_content": None,
        "checklist": {
            "items": [
                {"key": "track_section_id", "label": "Track Section ID", "required": True, "checked": True, "value": "NR-SEC7-04"},
                {"key": "current_speed_limit", "label": "Current Speed Limit (km/h)", "required": True, "checked": True, "value": "110"},
                {"key": "track_geometry", "label": "Track Geometry Survey", "required": True, "checked": False, "value": ""},
                {"key": "recent_alerts", "label": "Recent Alerts (7d)", "required": True, "checked": True, "value": "3 alerts"},
                {"key": "train_schedule", "label": "Train Schedule", "required": False, "checked": False, "value": ""},
            ],
        },
    },
    {
        "id": "AT-005",
        "title": "Predictive Maintenance — Track Section CHN-BLR-02",
        "section": "Prediction",
        "status": "complete",
        "owner": "prediction",
        "agent": "PredictionAgent",
        "created_at": "2026-08-06 08:00:00",
        "missing_data": False,
        "notes": "72-hour failure probability computed. Ticket auto-generated.",
        "validation_warnings": [],
        "generated_content": {
            "failure_probability_72h": 0.34,
            "failure_type": "rail_fracture",
            "confidence": 0.76,
            "recommended_action": "Schedule inspection within 48 hours",
            "ticket_generated": "TKT-045",
            "model_used": "pytorch_mlp",
        },
        "checklist": {
            "items": [
                {"key": "ambient_temp", "label": "Ambient Temperature (°C)", "required": True, "checked": True, "value": "36.0"},
                {"key": "humidity", "label": "Humidity (%)", "required": True, "checked": True, "value": "62.0"},
                {"key": "vibration_rms", "label": "Vibration RMS (mm/s)", "required": True, "checked": True, "value": "3.8"},
                {"key": "gauge_width", "label": "Gauge Width (mm)", "required": True, "checked": True, "value": "1680.0"},
                {"key": "historical_readings", "label": "Historical Readings (30d)", "required": True, "checked": True, "value": "210 readings"},
                {"key": "maintenance_history", "label": "Maintenance History", "required": False, "checked": True, "value": "Last inspection: 2026-07-20"},
            ],
        },
    },
    {
        "id": "AT-006",
        "title": "Network Health Assessment — Western Zone",
        "section": "Network Health",
        "status": "in_progress",
        "owner": "network_health",
        "agent": "NetworkHealthAgent",
        "created_at": "2026-08-07 06:00:00",
        "missing_data": True,
        "notes": "3 of 12 sections still awaiting sensor calibration data.",
        "validation_warnings": ["Section WR-05 sensor offline since 2026-08-06", "Section WR-09 calibration expired", "Section WR-11 no readings in 6h"],
        "generated_content": {
            "overall_health": 78.5,
            "sections_assessed": 9,
            "sections_pending": 3,
            "critical_sections": ["WR-05", "WR-09"],
            "recommendation": "Prioritize sensor maintenance on WR-05 and calibration on WR-09",
        },
        "checklist": {
            "items": [
                {"key": "zone_id", "label": "Zone ID", "required": True, "checked": True, "value": "WR"},
                {"key": "section_list", "label": "Section List", "required": True, "checked": True, "value": "12 sections"},
                {"key": "sensor_status", "label": "Sensor Status Report", "required": True, "checked": False, "value": ""},
                {"key": "calibration_data", "label": "Calibration Records", "required": True, "checked": False, "value": ""},
                {"key": "alert_history", "label": "Alert History (7d)", "required": False, "checked": True, "value": "18 alerts"},
            ],
        },
    },
    {
        "id": "AT-007",
        "title": "Dispatch Recommendation — Critical Alert ALT-20260808-0003",
        "section": "Dispatch",
        "status": "complete",
        "owner": "dispatch",
        "agent": "DispatchAgent",
        "created_at": "2026-08-08 02:30:00",
        "missing_data": False,
        "notes": "Maintenance team MT-DLI-002 dispatched to site. ETA 4 hours.",
        "validation_warnings": [],
        "generated_content": {
            "recommended_team": "MT-DLI-002",
            "team_specialization": "Track",
            "estimated_arrival_hours": 4,
            "priority": "critical",
            "equipment_needed": ["Rail thermometer", "Gauge measurement tool", "Emergency fishplates"],
            "ticket_id": "TKT-051",
        },
        "checklist": {
            "items": [
                {"key": "alert_id", "label": "Alert ID", "required": True, "checked": True, "value": "ALT-20260808-0003"},
                {"key": "severity", "label": "Alert Severity", "required": True, "checked": True, "value": "critical"},
                {"key": "location", "label": "Location / Track Section", "required": True, "checked": True, "value": "NDL-GZB-01"},
                {"key": "available_teams", "label": "Available Teams", "required": True, "checked": True, "value": "3 teams available"},
                {"key": "parts_inventory", "label": "Parts Inventory", "required": False, "checked": True, "value": "Fishplates: 12 in stock"},
            ],
        },
    },
    {
        "id": "AT-008",
        "title": "Explainability Report — Anomaly AT-001",
        "section": "Explainability",
        "status": "pending",
        "owner": "explainability",
        "agent": "ExplainabilityAgent",
        "created_at": "2026-08-08 05:00:00",
        "missing_data": True,
        "notes": "Waiting for SHAP analysis to complete.",
        "validation_warnings": ["SHAP values computation timed out on first attempt", "Retry scheduled"],
        "generated_content": None,
        "checklist": {
            "items": [
                {"key": "prediction_id", "label": "Prediction Record ID", "required": True, "checked": True, "value": "AT-001"},
                {"key": "model_version", "label": "Model Version", "required": True, "checked": True, "value": "v1.1.0"},
                {"key": "input_features", "label": "Input Feature Vector", "required": True, "checked": True, "value": "22 features"},
                {"key": "shap_values", "label": "SHAP Values", "required": True, "checked": False, "value": ""},
                {"key": "feature_importance", "label": "Feature Importance Rank", "required": False, "checked": False, "value": ""},
            ],
        },
    },
]


def _get_tasks():
    """Return a deep copy of seeded tasks so mutations don't persist across calls."""
    tasks = copy.deepcopy(SEED_TASKS)
    # Merge in any saved checklist state
    for task in tasks:
        saved = _checklist_store.get(task["id"])
        if saved:
            task["checklist"] = saved
            # Recompute missing_data flag
            task["missing_data"] = any(
                not item["checked"] for item in saved["items"] if item["required"]
            )
    return tasks


def _get_task_by_id(task_id):
    """Find a single task by ID, with saved checklist state merged."""
    tasks = _get_tasks()
    for task in tasks:
        if task["id"] == task_id:
            return task
    return None


# ── Template View ────────────────────────────────────────────────────

def agent_tasks_page(request):
    """Render the Agent Tasks page."""
    context = {
        "page_title": "Agent Tasks",
    }
    return render(request, "bounty.html", context)


# ── API: Task List ───────────────────────────────────────────────────

@require_GET
def api_tasks(request):
    """
    GET /bounty/api/tasks/

    Return all seeded agent-task records as JSON.

    Supports query parameters for server-side filtering:
        ?section=Anomaly Detection
        ?status=complete
        ?owner=anomaly_detection
        ?missing_data=true
        ?search=gauge

    All filters are optional and combinable.
    """
    tasks = _get_tasks()

    # Apply filters from query params
    section = request.GET.get("section", "").strip()
    status = request.GET.get("status", "").strip()
    owner = request.GET.get("owner", "").strip()
    missing = request.GET.get("missing_data", "").strip().lower()
    search = request.GET.get("search", "").strip().lower()

    if section:
        tasks = [t for t in tasks if t["section"] == section]
    if status:
        tasks = [t for t in tasks if t["status"] == status]
    if owner:
        tasks = [t for t in tasks if t["owner"] == owner]
    if missing == "true":
        tasks = [t for t in tasks if t["missing_data"]]
    elif missing == "false":
        tasks = [t for t in tasks if not t["missing_data"]]
    if search:
        tasks = [
            t for t in tasks
            if search in t["title"].lower()
            or search in t["section"].lower()
            or search in t["owner"].lower()
            or search in t["agent"].lower()
            or search in (t.get("notes") or "").lower()
            or search in json.dumps(t.get("generated_content") or {}).lower()
        ]

    # Compute completion stats for each task
    for task in tasks:
        items = task["checklist"]["items"]
        total = len(items)
        checked = sum(1 for i in items if i["checked"])
        required = sum(1 for i in items if i["required"])
        required_checked = sum(1 for i in items if i["required"] and i["checked"])
        task["checklist_stats"] = {
            "total": total,
            "checked": checked,
            "required": required,
            "required_checked": required_checked,
            "completion_pct": round((checked / total) * 100) if total > 0 else 0,
            "required_pct": round((required_checked / required) * 100) if required > 0 else 0,
        }

    # Compute available filter options (from full dataset, not filtered)
    all_tasks = _get_tasks()
    filter_options = {
        "sections": sorted(set(t["section"] for t in all_tasks)),
        "statuses": sorted(set(t["status"] for t in all_tasks)),
        "owners": sorted(set(t["owner"] for t in all_tasks)),
    }

    return JsonResponse({
        "success": True,
        "count": len(tasks),
        "tasks": tasks,
        "filter_options": filter_options,
    })


# ── API: Checklist State ─────────────────────────────────────────────

@csrf_exempt
def api_checklist(request, task_id):
    """
    GET /bounty/api/checklist/<task_id>/  → Return checklist state
    POST /bounty/api/checklist/<task_id>/ → Save checklist state

    POST body (JSON):
        {
            "items": [
                {"key": "ambient_temp", "checked": true, "value": "42.0"},
                ...
            ]
        }
    """
    if request.method == "GET":
        task = _get_task_by_id(task_id)
        if not task:
            return JsonResponse(
                {"success": False, "error": f"Task {task_id} not found"},
                status=404,
            )
        return JsonResponse({
            "success": True,
            "task_id": task_id,
            "checklist": task["checklist"],
        })

    elif request.method == "POST":
        task = _get_task_by_id(task_id)
        if not task:
            return JsonResponse(
                {"success": False, "error": f"Task {task_id} not found"},
                status=404,
            )

        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, ValueError) as e:
            return JsonResponse(
                {"success": False, "error": f"Invalid JSON: {e}"},
                status=400,
            )

        incoming_items = data.get("items", [])
        if not isinstance(incoming_items, list):
            return JsonResponse(
                {"success": False, "error": "'items' must be a list"},
                status=400,
            )

        # Merge incoming state into the existing checklist
        existing_items = task["checklist"]["items"]
        incoming_map = {item["key"]: item for item in incoming_items}

        for existing_item in existing_items:
            key = existing_item["key"]
            if key in incoming_map:
                existing_item["checked"] = incoming_map[key].get("checked", existing_item["checked"])
                if "value" in incoming_map[key]:
                    existing_item["value"] = incoming_map[key]["value"]

        # Save merged state
        _checklist_store[task_id] = task["checklist"]

        return JsonResponse({
            "success": True,
            "task_id": task_id,
            "checklist": task["checklist"],
            "saved_at": datetime.now().isoformat(),
        })

    return JsonResponse({"success": False, "error": "Method not allowed"}, status=405)


# ── API: Export Review Packet ─────────────────────────────────────────

@require_GET
def api_export(request, task_id):
    """
    GET /bounty/api/export/<task_id>/

    Generate a structured review packet for the specified agent task.

    The packet combines:
        - Task metadata
        - All generated sections / content
        - Validation warnings
        - Missing fields
        - User notes
        - Checklist completion status

    Returns a downloadable JSON file.
    """
    task = _get_task_by_id(task_id)
    if not task:
        return JsonResponse(
            {"success": False, "error": f"Task {task_id} not found"},
            status=404,
        )

    # Compute checklist stats
    items = task["checklist"]["items"]
    total = len(items)
    checked = sum(1 for i in items if i["checked"])
    required = sum(1 for i in items if i["required"])
    required_checked = sum(1 for i in items if i["required"] and i["checked"])
    missing_fields = [
        {"field": i["label"], "key": i["key"], "required": i["required"]}
        for i in items if not i["checked"]
    ]
    provided_fields = [
        {"field": i["label"], "key": i["key"], "value": i["value"], "required": i["required"]}
        for i in items if i["checked"]
    ]

    # Build the review packet
    packet = {
        "review_packet": {
            "generated_at": datetime.now().isoformat(),
            "version": "1.0",
            "format": "rakshak_review_packet",
        },
        "task_metadata": {
            "task_id": task["id"],
            "title": task["title"],
            "section": task["section"],
            "status": task["status"],
            "owner": task["owner"],
            "agent": task["agent"],
            "created_at": task["created_at"],
        },
        "checklist_summary": {
            "total_items": total,
            "checked_items": checked,
            "completion_percentage": round((checked / total) * 100, 1) if total > 0 else 0,
            "required_items": required,
            "required_checked": required_checked,
            "required_completion_percentage": round((required_checked / required) * 100, 1) if required > 0 else 0,
            "all_required_complete": required_checked == required,
        },
        "provided_fields": provided_fields,
        "missing_fields": missing_fields,
        "validation_warnings": task.get("validation_warnings", []),
        "generated_content": task.get("generated_content"),
        "user_notes": task.get("notes", ""),
        "judge_ready": (
            required_checked == required
            and len(task.get("validation_warnings", [])) == 0
            and task.get("generated_content") is not None
        ),
    }

    # Return as downloadable JSON
    response = HttpResponse(
        json.dumps(packet, indent=2, ensure_ascii=False),
        content_type="application/json",
    )
    response["Content-Disposition"] = f'attachment; filename="review_packet_{task_id}.json"'
    return response
