# test_progress.md
### Rakshak (PROTOTYPE_1.0) — Full Test Execution & Coverage Plan
**Purpose:** Track white-box (unit/integration, code-path level) and black-box (API/HTTP/UI-behavior level) testing across every engine/module in the repo, until the project reaches a genuinely working, verifiable prototype.

**Testing framework convention (already in use in this repo — keep consistent):** Django's built-in `django.test.TestCase` + `RequestFactory` / `Client`, run via `python manage.py test`. Do not introduce `pytest` unless explicitly asked — the existing 31 tests in `ai_integration/tests/` already use `TestCase`, and mixing frameworks adds friction with no real benefit here.

**Current test baseline (after this pass):**
```
python manage.py test
Found 43 test(s).
Ran 43 tests in X.XXXs
OK
```
Baseline increment: added focused tests for `simulation` (access/navigation) and `sensors` (predict/batch/health). Existing `ai_integration` tests remain passing. Many modules still lack coverage; see matrix below.

---

## 0. How to run everything (reference for whoever executes this file)

```bash
cd backend
# local dev DB — use sqlite override so no Postgres install is required for CI:
export DATABASE_URL="sqlite:///test_db.sqlite3"
pip install -r ../requirements.txt

python manage.py check
python manage.py migrate
python manage.py test --verbosity=2

# per-app targeted run, once new test modules exist:
python manage.py test simulation
python manage.py test sensors
python manage.py test alerts
python manage.py test tickets
python manage.py test map_view
python manage.py test agents
python manage.py test core
python manage.py test ai_models
python manage.py test railway
python manage.py test ai_integration
```

Coverage measurement (add `coverage` to dev-only requirements, not `requirements.txt`):

```bash
pip install coverage
coverage run --source='.' manage.py test
coverage report -m
coverage html   # optional, for a browsable report
```

---

## 1. Module-by-Module Test Matrix

Legend: **WB** = White-box (internal logic, functions, edge cases, exceptions). **BB** = Black-box (HTTP request → response behavior, treating the app as a closed box, including permissions/auth). Status: `NOT STARTED` / `IN PROGRESS` / `DONE (n/n passing)`.

### 1.1 `simulation` app — **HIGHEST PRIORITY** (this is the feature being newly wired this pass)

| # | Test | Type | Status |
|---|---|---|---|
| S-1 | `simulation_page` returns 302 redirect for anonymous user | BB | DONE |
| S-2 | `simulation_page` returns 403 for authenticated non-staff user | BB | DONE |
| S-3 | `simulation_page` returns 200 + renders `simulation.html` for staff user | BB | DONE |
| S-4 | `api_run_simulation` rejects anonymous requests (302/401) | BB | NOT STARTED |
| S-5 | `api_run_simulation` rejects non-staff authenticated requests (403, JSON error body) | BB | DONE |
| S-6 | `api_run_simulation` accepts valid staff POST with `{source, destination}` and returns `success: true` with `readings` (16 items), `prediction`, `suggestions` | BB | NOT STARTED |
| S-7 | `api_run_simulation` returns 400 when `source` missing | WB/BB | NOT STARTED |
| S-8 | `api_run_simulation` returns 400 when `destination` missing | WB/BB | NOT STARTED |
| S-9 | `api_run_simulation` returns 400 when `source == destination` (case-insensitive, e.g. `"delhi"` vs `"Delhi"`) | WB | NOT STARTED |
| S-10 | `api_run_simulation` returns 400 on malformed JSON body | WB/BB | NOT STARTED |
| S-11 | `generator.generate_journey()` returns exactly 16 readings, each with all 4 required keys (`ambient_temp`, `humidity`, `vibration_rms`, `gauge_width`) | WB | NOT STARTED |
| S-12 | `generator.generate_journey()` local fallback works when no LLM backend is reachable (simulate `requests.exceptions.ConnectionError`) — confirms graceful degradation logged in this pass's manual run | WB | NOT STARTED |
| S-13 | `_suggestions_for_score()` returns correct message tier for score bands: `>=0.75`, `[0.45,0.75)`, `[0.20,0.45)`, `<0.20` — test all 4 boundary conditions explicitly (e.g. exactly `0.75`, `0.449999`) | WB | NOT STARTED |
| S-14 | Same `sensor_id` (the `SIM-xxxxxxxx` UUID) is reused across all 16 `predict_for_sensor` calls within one run, so the rolling window fills correctly (assert via mock/spy on `PredictionService.predict_for_sensor`) | WB | NOT STARTED |
| S-15 | Sidebar `nav_items` context contains a `Simulation` entry when `is_staff=True`, and does **not** contain it when `is_staff=False` or anonymous (test via `core.context_processors.navigation` directly, plus via a rendered page's context) | WB/BB | DONE |
| S-16 | CSRF: with `@csrf_exempt` removed (per improvements.md B.4/A.4), a POST without a CSRF token from a staff session is rejected (403) | BB | NOT STARTED |

**Suggested file:** `backend/simulation/tests.py` (create it — doesn't exist yet). Follow the structure of `ai_integration/tests/test_prediction_service.py` (uses `TestCase`, `RequestFactory` or `Client`, and creates a `User` with `is_staff=True/False` via `User.objects.create_user(...)`).

### 1.2 `ai_integration` — mostly covered, extend it

| # | Test | Type | Status |
|---|---|---|---|
| AI-1 | Existing 31 tests | WB/BB | DONE (31/31 passing — baseline) |
| AI-2 | `PredictionService` behavior when the real pickle model IS available (currently untested because `torch` isn't installed in the dev environment — add this test **after** fixing improvements.md B.1) | WB | NOT STARTED |
| AI-3 | `LocalPickleProvider` gracefully falls back to `RuleLayer` when `torch` import fails or `.pkl` files are missing — assert on `metadata.error` presence and that a sane, non-crashing response is still returned | WB | NOT STARTED |
| AI-4 | `alert_service.py` — verify an `Alert` DB row is actually created when a `warning`/`critical` prediction comes back with a valid `track_section_id` | WB/BB | NOT STARTED |
| AI-5 | `ticket_service.py` — verify ticket creation logic end-to-end from a critical alert | WB/BB | NOT STARTED |
| AI-6 | `incident_orchestrator.py` — currently has no dedicated test file at all; add basic happy-path + failure-path tests | WB | NOT STARTED |
| AI-7 | `journey_service.py` / `journey_views.py` — no test coverage currently; this looks related to (or possibly the origin of) the Simulation feature's synthetic-journey concept — clarify overlap with `simulation/generator.py` and either de-duplicate or test both explicitly | WB/BB | NOT STARTED |
| AI-8 | `/api/predict/batch/` — batch size boundary tests: 0 readings (should 400), 100 readings (should succeed), 101 readings (should 400 per documented "up to 100" limit) | BB | NOT STARTED |
| AI-9 | `/api/predict/health/` — returns correct model-loaded status both with and without `torch` present | BB | NOT STARTED |

### 1.3 `sensors` app (dashboard + predict API host)

| # | Test | Type | Status |
|---|---|---|---|
| SEN-1 | Dashboard view (`/`) returns 200 for anonymous and authenticated users (confirm current no-login-required behavior is actually intended for the main dashboard, unlike simulation) | BB | NOT STARTED |
| SEN-2 | Dashboard view context contains expected summary data keys (assets/alerts/tickets counts) | WB | NOT STARTED |
| SEN-3 | `sensors/api_urls.py` predict endpoints — auth behavior once B.3 (improvements.md) is applied: verify whatever policy is chosen (login-required vs device API key) is actually enforced | BB | DONE |
| SEN-4 | Seed management commands (`seed_master_data`, `seed_routes`, `seed_demo_data`, `seed_sensors`) run without error against a clean test DB and produce non-zero row counts in each target model | WB | NOT STARTED |

### 1.4 `alerts` app

| # | Test | Type | Status |
|---|---|---|---|
| AL-1 | `/alerts/` page renders 200 with seeded alert data | BB | NOT STARTED |
| AL-2 | Alert list view filters/sorts correctly (by severity/status if the view supports query params — check `alerts/views.py` for actual supported filters and test each) | WB | NOT STARTED |
| AL-3 | Alert detail/status-change flow (if present) updates DB correctly and writes an `AuditLog` entry | WB/BB | NOT STARTED |

### 1.5 `tickets` app

| # | Test | Type | Status |
|---|---|---|---|
| TK-1 | `/tickets/` page renders 200 with seeded ticket data | BB | NOT STARTED |
| TK-2 | Ticket creation/assignment logic (`tickets/views.py`) — happy path and validation-failure path | WB | NOT STARTED |
| TK-3 | Ticket cost/resolution tracking fields update correctly through the workflow described in `PROJECT_REPORT.md` §3.2 | WB | NOT STARTED |

### 1.6 `map_view` app

| # | Test | Type | Status |
|---|---|---|---|
| MV-1 | `/map/` page renders 200 | BB | NOT STARTED |
| MV-2 | `GET /api/stations/` returns valid GeoJSON/coordinate structure matching what `map.js`/Leaflet expects | BB | NOT STARTED |
| MV-3 | `GET /api/routes/` returns valid polyline data, no malformed coordinates (lat/lon within valid ranges) | WB | NOT STARTED |
| MV-4 | `GET /api/alerts/` and `GET /api/tickets/` spatial-marker endpoints return correctly shaped data | BB | NOT STARTED |
| MV-5 | `GET /api/trains/` — since this "simulates live train movement across track polylines based on time-offsets" (per PROJECT_REPORT.md §4.2), test the time-offset math directly: known input timestamp → expected position along polyline, including edge cases (t=0, t=journey end, t beyond journey end) | WB | NOT STARTED |
| MV-6 | `route_geometry/india_railways.geojson` — validate this file itself is well-formed GeoJSON and loads without error (schema/structure test, not content correctness) | WB | NOT STARTED |

### 1.7 `agents` subsystem (7 agents, 2198 lines, currently **zero tests**)

This is the largest untested block of business logic in the repo. Test each agent independently (unit-level, mocking DB/event dependencies) before any integration test between agents.

| # | Test | Type | Status |
|---|---|---|---|
| AG-1 | `shared/base_agent.py` — lifecycle methods (start/stop/health-check), circuit-breaker error tracking triggers after N consecutive failures (find the actual threshold constant in the code and test at N-1, N, N+1 failures) | WB | NOT STARTED |
| AG-2 | `shared/events.py` — event object construction/serialization round-trips correctly | WB | NOT STARTED |
| AG-3 | `anomaly/anomaly_detection_agent.py` — consumes a `SensorValidatedEvent`, calls the ML pipeline, creates an `Alert` — test with a mocked pipeline returning each of `none`/`warning`/`critical` | WB | NOT STARTED |
| AG-4 | `prediction/failure_prediction_agent.py` — multi-horizon probability output shape and bounds (all probabilities in [0,1], horizons match documented set) | WB | NOT STARTED |
| AG-5 | `dispatch/maintenance_dispatch_agent.py` — correct `Ticket`/`MaintenanceTeam` assignment logic given an alert | WB | NOT STARTED |
| AG-6 | `explainability/explainability_agent.py` — produces non-empty, well-formed explanation output for a given prediction | WB | NOT STARTED |
| AG-7 | `ingestion/sensor_ingestion_agent.py` — validates/rejects malformed sensor payloads correctly before they reach the anomaly agent | WB | NOT STARTED |
| AG-8 | `network_health/network_health_agent.py` — aggregate health score calculation, edge case with zero sensors reporting | WB | NOT STARTED |
| AG-9 | `root_cause/root_cause_agent.py` — root-cause output given a known synthetic fault pattern | WB | NOT STARTED |
| AG-10 | `speed_restriction/speed_restriction_agent.py` — correct speed-limit recommendation thresholds given severity input | WB | NOT STARTED |
| AG-11 | Integration: end-to-end event flow from ingestion → anomaly → dispatch, using an in-memory/test event bus if one exists, or direct function chaining if agents call each other synchronously | BB | NOT STARTED |

**Suggested location:** `backend/agents/tests/` (new directory, mirroring the existing `agents/<name>/` subfolder structure), e.g. `agents/tests/test_anomaly_detection_agent.py`.

### 1.8 `railway` app (core models, admin, migrations)

| # | Test | Type | Status |
|---|---|---|---|
| RW-1 | Replace the empty `railway/tests.py` stub with real tests | WB | NOT STARTED |
| RW-2 | Model constraints: `SensorReading` unique constraint on `(sensor, recorded_at)` actually raises `IntegrityError` on duplicate insert | WB | NOT STARTED |
| RW-3 | `TrackSection` GeoJSON polyline field accepts valid data and rejects malformed geometry (if validation exists — if not, flag as a gap, don't fabricate a test for validation that isn't implemented) | WB | NOT STARTED |
| RW-4 | `AuditLog` is genuinely append-only — attempt an update/delete on an existing row and confirm it's blocked (if enforced at model/DB level) or documented as an app-level convention only (if not enforced, note this explicitly as a finding, not a pass) | WB | NOT STARTED |
| RW-5 | `middleware.py`'s `CurrentUserMiddleware` correctly stores/clears thread-local user across a request, including on an exception mid-request (`process_exception` cleanup path) | WB | NOT STARTED |
| RW-6 | `admin.py` registrations — each registered model's Django admin list view loads without error for a staff user | BB | NOT STARTED |
| RW-7 | `test_grid_query.py` and `extract_osm_test.py` (already exist as standalone scripts, not integrated into `manage.py test`) — evaluate whether these should be converted into proper `TestCase`s or kept as manual data-validation scripts; document the decision | WB | NOT STARTED |

### 1.9 `core` app (context processors, cross-cutting)

| # | Test | Type | Status |
|---|---|---|---|
| CO-1 | `navigation()` context processor — full matrix: anonymous / authenticated-non-staff / authenticated-staff × each page path, asserting exact `nav_items` contents and `active` flags | WB | NOT STARTED (partially overlaps S-15 above — implement once, reference from both) |
| CO-2 | `project_meta()` context processor returns expected static keys/values | WB | NOT STARTED |

### 1.10 `ai_models` (pickled model layer, `simple_pipeline.py`, `RuleLayer`)

| # | Test | Type | Status |
|---|---|---|---|
| AM-1 | `RuleLayer.apply()` — gauge deviation > 15mm forces a `critical` override regardless of model output (documented rule in PROJECT_REPORT.md §2.2) — test exactly at 15mm, 15.01mm, 14.99mm | WB | NOT STARTED |
| AM-2 | `RuleLayer.apply()` — any other documented deterministic rules (read the full `RuleLayer` class and enumerate every rule as its own test case) | WB | NOT STARTED |
| AM-3 | `SimpleRakshakInferencePipeline.predict()` — feature engineering step: confirm 4 raw readings → 22 statistical features, with known input → known/expected feature vector (golden-value test) | WB | NOT STARTED |
| AM-4 | `SimpleRakshakInferencePipeline` — behavior when `.pkl` files are present but corrupted/truncated (should fail gracefully to `RuleLayer`, not crash the request) | WB | NOT STARTED |
| AM-5 | `SimpleRakshakInferencePipeline` — behavior once `torch` is properly installed (per improvements.md B.1): real model output shape/class-count matches `model_config.json` (`anomaly_model` → 3 classes, `fault_model` → 39 classes) | WB | NOT STARTED |
| AM-6 | Model accuracy sanity check (not a pass/fail unit test, but a documented benchmark): `model_config.json` reports `risk_best_val_acc: 0.693` and `fault_best_val_acc: 0.629` from training. Add a regression check that re-running inference on the held-out validation set (if available in `ai_engin/colab_training/data/`) still produces accuracy within a reasonable tolerance (e.g. ±3%) of these baseline numbers, to catch silent model/pipeline drift | WB | NOT STARTED |

---

## 2. Black-Box / End-to-End Smoke Test Checklist (manual or Selenium/Playwright, run after all white-box work above is green)

Run these against a fully seeded local instance (`seed_master_data` → `seed_routes` → `seed_demo_data` → `seed_sensors`), with `torch`/`numpy` installed per improvements.md B.1.

- [ ] Fresh clone → `pip install -r requirements.txt` → `migrate` → seed commands → `runserver` completes with **no errors or warnings** in console output (specifically: no `"No module named 'torch'"`, no Ollama connection-refused stack trace treated as fatal — the LLM fallback should log a clean single-line warning, not a full traceback, once cleaned up).
- [ ] Login as a non-staff user → confirm Dashboard, Alerts, Tickets, Map all load; confirm Admin and Simulation links are **absent** from sidebar; confirm direct navigation to `/simulation/` and `/admin/` both return 403/redirect appropriately.
- [ ] Login as a staff user → confirm Simulation link **is** present; run a full simulation (enter two distinct station names, click run) → confirm the train animation plays, a prediction result renders (alert level, fault type, chart, suggestions), and no browser console errors appear.
- [ ] Run simulation twice in a row without reloading the page ("Run Another Journey" button) → confirm state resets correctly and a new, different `sensor_id` is used each time.
- [ ] Submit simulation with identical source/destination → confirm inline error shown, no network call for prediction made.
- [ ] Verify existing pages (Dashboard, Alerts, Map, Tickets) still work exactly as before — this pass must not regress anything outside the Simulation feature and the listed bug fixes.
- [ ] Confirm `DEBUG` can be set to `False` via environment variable and the app still boots (static files serve correctly, no Django debug error pages leak stack traces).

---

## 3. Reporting Convention

As each row above is completed, update its **Status** cell to `DONE (n/n passing)` or `FAILED (n/n passing, see notes)` and append a one-line note directly below the relevant table if a test uncovered a **new** bug not already listed in `improvements.md` — add that bug to `improvements.md` Part B rather than silently fixing it out-of-band, so the bug list stays the single source of truth.

**Definition of "final working prototype" for this pass:** every row in sections 1.1 and 1.2 is `DONE`, the black-box checklist in section 2 is fully checked, and `python manage.py test` (full suite, all apps) passes with 0 failures and 0 errors.
