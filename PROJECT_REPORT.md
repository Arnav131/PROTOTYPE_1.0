# Rakshak: Technical Project Report

**Date:** August 2026
**Status:** Phase 1 Prototype Integration Complete
**Target Audience:** Development & Engineering Team

---

## 1. Executive Summary

Rakshak is a Railway Predictive Maintenance & Monitoring Platform designed to ingest high-frequency sensor data, run AI/ML inference to detect anomalies, and raise predictive alerts for railway infrastructure (tracks, bridges, OHE). 

The platform is currently in its **Phase 1 Prototype** stage, featuring a monolithic Django backend, a PyTorch-based inference pipeline, an event-driven Agent subsystem, and a GIS-enabled frontend (Leaflet). The ML models have been successfully integrated into the backend, allowing end-to-end data flow from sensor telemetry to real-time map visualization.

---

## 2. System Architecture

The system is decoupled into logical tiers residing within a single Django application:

### 2.1 Backend Framework (Django)
*   **Framework:** Django 4.2+ (Python 3.x).
*   **Database:** SQLite (Prototype phase) with PostgreSQL readiness (via ORM constraints like `PROTECT` and indexing).
*   **API Layer:** Pure Django `JsonResponse` and `@csrf_exempt` decorators. Django Rest Framework (DRF) is **not** used to minimize dependencies.
*   **Static/Templates:** Standard Django template rendering with Chart.js and Leaflet.js.

### 2.2 Machine Learning Engine (`ai_models`)
The inference engine is encapsulated in the `SimpleRakshakInferencePipeline` loaded as a singleton on Django startup.
*   **Tech Stack:** PyTorch, NumPy, Scikit-learn preprocessing.
*   **Models:** 
    *   `anomaly_model.pkl`: Predicts risk level (`none`, `warning`, `critical`).
    *   `fault_model.pkl`: Classifies fault types (7 classes including `rail_fracture`, `thermal_buckle`, `gauge_widening`).
*   **Feature Engineering:** Transforms 4 raw sensor readings (temp, humidity, vibration, gauge width) into 22 statistical features per window.
*   **Rule Layer:** A deterministic fallback layer that overrides ML predictions (e.g., if gauge deviation > 15mm -> force critical alert).

### 2.3 Agent Subsystem (`agents/`)
Simulates an event-driven microservices architecture within the monolith.
*   **BaseAgent:** Abstract class providing lifecycle management, error tracking (circuit breaker pattern), and audit logging.
*   **AnomalyDetectionAgent:** Consumes `SensorValidatedEvent`s, invokes the ML pipeline, and generates `Alert` records in the DB.
*   **FailurePredictionAgent:** Handles multi-horizon failure probabilities and uncertainty estimations.

---

## 3. Database Schema & Data Model

The database is highly normalized, consisting of 18 concrete models grouped into logical layers.

### 3.1 Geography & Infrastructure
*   `Zone` -> `Division` -> `Station`: Core administrative and physical locations with GPS coordinates.
*   `TrackSection`: The primary infrastructure entity connecting two stations. Contains GeoJSON polyline data for map rendering.
*   `Asset`: Bridges, signals, or OHE located on a TrackSection.

### 3.2 Sensor Layer
*   `SensorType`: Defines thresholds (`normal_max`, `critical_max`) and units.
*   `Sensor`: Physical devices (UUID tracked) mounted on `Asset`s.
*   `SensorReading`: **The highest volume table.** Contains `raw_value`, `quality_score`, and `anomaly_flag`. Enforces a unique constraint on `(sensor, recorded_at)`.

### 3.3 Operations Layer
*   `Alert`: Raised by ML models or rule layers. Tracks severity, status, and confidence score.
*   `Ticket`: Maintenance workflows, assigned to `MaintenanceTeam`s, tracking costs and resolution.
*   `AuditLog`: Immutable, append-only log tracking system events (creates, updates, state changes).

---

## 4. API & Integration Surface

### 4.1 ML Inference API (`/api/predict/`)
A dedicated JSON API handles predictions, bridging external data or internal agents with the AI pipeline.
*   `POST /api/predict/`: Accepts raw sensor telemetry, runs the pipeline, and returns risk scores. If a `track_section_id` is provided, it automatically creates an `Alert` in the database for `warning/critical` anomalies.
*   `POST /api/predict/batch/`: Batch processing for up to 100 readings.
*   `GET /api/predict/health/`: Exposes model loading status and versioning.

### 4.2 Map & GIS API (`/api/`)
Powers the live operations dashboard using deterministic, pseudo-random data generation for the prototype.
*   `GET /api/stations/` & `/api/routes/`: Returns topology and Leaflet coordinates.
*   `GET /api/alerts/` & `/api/tickets/`: Returns spatial markers for live issues.
*   `GET /api/trains/`: Simulates live train movement across track polylines based on time-offsets.

---

## 5. Technical Decisions & Constraints

1.  **Monolithic AI Integration:** The PyTorch models are loaded directly into the Django application memory (via lazy singleton in `ai_models/__init__.py`). This avoids the complexity of deploying a separate inference server (like FastAPI/TorchServe) for Phase 1, reducing latency and infrastructure overhead.
2.  **Graceful ML Fallback:** If the `.pkl` files are missing or PyTorch fails to load, `SimpleRakshakInferencePipeline` gracefully degrades to the `RuleLayer`, ensuring the platform remains functional.
3.  **No Authentication:** The prototype lacks authentication middleware. APIs like `/api/predict/` are marked `@csrf_exempt` and are open. This is a critical security debt to address in Phase 2.
4.  **Database:** Currently using SQLite. The schema uses `DecimalField` extensively and avoids DB-specific JSON operations to ensure a smooth migration to PostgreSQL.

---

## 6. Next Steps for Phase 2

1.  **PostgreSQL Migration:** Migrate from SQLite to PostgreSQL to handle the high volume of the `SensorReading` table and utilize native PostGIS features for the map.
2.  **Authentication & Authorization:** Implement JWT or Session auth for the API and dashboard.
3.  **Asynchronous Processing:** Move the Agent subsystem and ML inference off the main Django HTTP request thread using Celery and Redis to prevent blocking under heavy load.
4.  **Dedicated Inference Server:** Decouple the ML pipeline into an independent microservice to allow independent scaling of the web server and GPU inference nodes.
