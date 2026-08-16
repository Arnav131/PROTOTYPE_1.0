# improvements.md
### Rakshak (PROTOTYPE_1.0) — Engineering Task Specification for Antigravity
**Target repo:** `https://github.com/Arnav131/PROTOTYPE_1.0`
**Scope of this pass:** (1) Wire up and admin-gate the existing Simulation feature, (2) Fix all bugs listed below, (3) Do not touch visual/aesthetic styling — that is explicitly out of scope for this pass and will be requested separately.

This document is written to be handed directly to an AI coding agent (Antigravity) as a work order. Every task has: root cause, exact file paths, and acceptance criteria. Follow the tasks in order — later tasks depend on earlier ones.

## STATUS UPDATE (17 August 2026)

During this pass the following were implemented and validated locally: `simulation` app wired and admin-gated (page + API), environment-driven `settings.py` changes, `requirements.txt` updated to include ML deps, and focused tests added for `simulation` (access/nav) and `sensors` (predict/batch/health). Local test run: 43 tests passing. Continue with the broader `test_progress.md` matrix next.

---

## PART A — SIMULATION FEATURE (ADMIN-ONLY, SIDEBAR-ACCESSIBLE)

### A.0 Context (read before starting)

The Simulation feature is **already ~90% implemented** in this repo but is completely disconnected from the running application. Do not rebuild it from scratch — wire the existing code in and add the missing admin gate. The following files already exist and are functionally correct (verified by running them locally against a SQLite test DB):

- `backend/simulation/views.py` — `simulation_page(request)` (renders `simulation.html`) and `api_run_simulation(request)` (POST endpoint, generates a synthetic journey and runs it through `ai_integration.prediction_service.PredictionService`).
- `backend/simulation/generator.py` — synthetic sensor-reading generator (local fallback + optional LLM backend).
- `backend/simulation/urls.py` — `app_name = "simulation"`, one route `""` → `simulation_page`.
- `backend/simulation/api_urls.py` — `app_name = "simulation_api"`, one route `"run/"` → `api_run_simulation`.
- `backend/simulation/apps.py` — `SimulationConfig`, `name = "simulation"`.
- `frontend/templates/simulation.html` — full page with `#sim-source`, `#sim-destination` inputs and `#sim-start-btn` button (this already matches your requirement of "enter source station, enter destination, hit run simulation button").
- `frontend/static/css/simulation.css`, `frontend/static/js/simulation.js` — supporting assets, already present.

**Root cause of it being broken:** the `simulation` app was never added to `INSTALLED_APPS`, never included in the root `urls.py`, and never added to the sidebar nav config. It is dead code sitting in the repo. This is Task A.1–A.4 below.

### A.1 Register the `simulation` Django app

**File:** `backend/rakshak_project/settings.py`

Locate the `INSTALLED_APPS` list:

```python
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Rakshak apps
    'core',
    'sensors',
    'alerts',
    'tickets',
    'map_view',
    'railway',
    'ai_integration',
]
```

Add `'simulation',` to the end of the "Rakshak apps" block:

```python
    'ai_integration',
    'simulation',
]
```

### A.2 Wire the URLs

**File:** `backend/rakshak_project/urls.py`

Current content:

```python
urlpatterns = [
    path('admin/', admin.site.urls),
    path('accounts/', include('django.contrib.auth.urls')),
    path('', include('sensors.urls')),
    path('alerts/', include('alerts.urls')),
    path('tickets/', include('tickets.urls')),
    path('map/', include('map_view.urls')),
    path('api/', include('map_view.api_urls')),
    path('api/predict/', include('sensors.api_urls')),
    path('api/ai/', include('ai_integration.api_urls')),
]
```

Add two new routes:

```python
urlpatterns = [
    path('admin/', admin.site.urls),
    path('accounts/', include('django.contrib.auth.urls')),
    path('', include('sensors.urls')),
    path('alerts/', include('alerts.urls')),
    path('tickets/', include('tickets.urls')),
    path('map/', include('map_view.urls')),
    path('simulation/', include('simulation.urls')),
    path('api/', include('map_view.api_urls')),
    path('api/predict/', include('sensors.api_urls')),
    path('api/ai/', include('ai_integration.api_urls')),
    path('api/simulation/', include('simulation.api_urls')),
]
```

Update the module docstring at the top of the file to document the new routes (keep it consistent with the existing style):

```python
"""
Root URL configuration for the Rakshak project.

Routes:
  /            → Dashboard (sensors app)
  /alerts/     → Alerts page
  /tickets/    → Maintenance Tickets page
  /map/        → Railway Map page
  /simulation/ → Live Simulation page (admin/staff only — enforced in view + nav)
  /api/        → JSON API endpoints (map data)
  /api/ai/     → AI prediction endpoints (ai_integration)
  /api/simulation/ → Simulation run endpoint (admin/staff only)
"""
```

### A.3 Server-side admin gate on the page view

**Requirement (explicit from product owner):** the Simulation page must be **accessible only by admins**. In this codebase, "admin" == Django's `is_staff` flag, which is exactly what `backend/core/context_processors.py` already uses to compute `is_controller` and to decide whether to show the `Admin` nav link. Reuse the same convention — do not introduce a new role system.

**File:** `backend/simulation/views.py`

Current:

```python
def simulation_page(request):
    """GET /simulation/ — renders the terminal/pixel-art simulation page."""
    return render(request, "simulation.html")
```

Replace with a staff-gated version. Use Django's built-in decorators so behavior is consistent with the rest of the codebase (login required → then staff required):

```python
from django.contrib.auth.decorators import login_required, user_passes_test
from django.core.exceptions import PermissionDenied


def _is_admin(user):
    return user.is_authenticated and user.is_staff


@login_required
@user_passes_test(_is_admin, login_url=None)
def simulation_page(request):
    """
    GET /simulation/ — renders the terminal/pixel-art simulation page.

    Admin-only (is_staff). Non-staff authenticated users get a 403.
    Anonymous users are redirected to login by @login_required.
    """
    return render(request, "simulation.html")
```

Note: `user_passes_test` by default redirects to `LOGIN_URL` on failure, which is wrong for an already-authenticated but non-staff user (it would loop them back to login). Override this properly — replace the above with an explicit two-step check so non-staff authenticated users get a clean `403`, not a redirect loop:

```python
@login_required
def simulation_page(request):
    """
    GET /simulation/ — renders the terminal/pixel-art simulation page.
    Admin-only (is_staff). Non-staff authenticated users get 403.
    """
    if not request.user.is_staff:
        raise PermissionDenied("Simulation is restricted to administrators.")
    return render(request, "simulation.html")
```

Remove the `user_passes_test` import/usage if you use this simpler version — keep only `login_required` and `PermissionDenied`.

### A.4 Server-side admin gate on the API endpoint

**This is critical — do not skip.** A page-level gate alone is not enough because `/api/simulation/run/` is a separate, directly callable URL. Right now it has **no auth check at all** (confirmed by testing — the endpoint responds to anonymous POST requests). Fix this in the same file.

**File:** `backend/simulation/views.py`

Current decorator stack:

```python
@csrf_exempt
@require_POST
def api_run_simulation(request):
```

Replace with:

```python
from django.contrib.auth.decorators import login_required

@login_required
@require_POST
def api_run_simulation(request):
    if not request.user.is_staff:
        return JsonResponse(
            {"success": False, "error": "Simulation is restricted to administrators."},
            status=403,
        )
    ...
```

Also **remove `@csrf_exempt`** from this endpoint. Since this endpoint will now only be called from an authenticated, in-app session (not an external integration), it should use Django's normal CSRF protection like the rest of the authenticated UI. Update `frontend/static/js/simulation.js` to send the CSRF token on the `fetch()`/`XMLHttpRequest` call to `/api/simulation/run/` (read the token from the `csrftoken` cookie or from a `{% csrf_token %}` hidden input rendered in `simulation.html`, matching whatever pattern `dashboard.js` already uses elsewhere in this repo for POST calls — check `frontend/static/js/dashboard.js` for the existing CSRF-header pattern before writing new code, and reuse it verbatim for consistency).

### A.5 Add the Simulation entry to the sidebar navigation (admin-only)

**File:** `backend/core/context_processors.py`

Current `navigation()` function builds a static `nav_items` list and only conditionally appends the `Admin` link for staff. Add a `Simulation` entry the same way, gated on `is_staff`, placed logically after `Map` and before `Admin`:

```python
def navigation(request):
    """Inject navigation items with active-page detection."""
    nav_items = [
        {
            'name': 'Dashboard',
            'url': '/',
            'icon': 'dashboard',
            'description': 'System Overview',
        },
        {
            'name': 'Alerts',
            'url': '/alerts/',
            'icon': 'alerts',
            'description': 'Active Alerts',
        },
        {
            'name': 'Tickets',
            'url': '/tickets/',
            'icon': 'tickets',
            'description': 'Maintenance Tickets',
        },
        {
            'name': 'Map',
            'url': '/map/',
            'icon': 'map',
            'description': 'Railway Network',
        },
    ]

    # Simulation — admin/staff only. Same gate used for the Admin link below.
    if request.user.is_authenticated and request.user.is_staff:
        nav_items.append({
            'name': 'Simulation',
            'url': '/simulation/',
            'icon': 'simulation',
            'description': 'Live Journey Simulation',
        })

    # Add admin link for staff users
    if request.user.is_authenticated and request.user.is_staff:
        nav_items.append({
            'name': 'Admin',
            'url': '/admin/',
            'icon': 'admin',
            'description': 'Control & Audit',
        })

    # Detect active page
    current_path = request.path
    for item in nav_items:
        item['active'] = (
            current_path == item['url'] or
            (item['url'] == '/admin/' and current_path.startswith('/admin/'))
        )

    return {
        'nav_items': nav_items,
        'is_controller': request.user.is_authenticated and request.user.is_staff
    }
```

Both `if request.user.is_authenticated and request.user.is_staff:` checks are now duplicated (Simulation + Admin). This is intentional for clarity and matches the existing code style in this file — do not refactor into a shared variable unless you also update tests accordingly; keep the diff minimal for this pass.

### A.6 Add an icon for the `simulation` nav item

**File:** `frontend/templates/base.html`

The sidebar SVG icon block currently has an `if/elif` chain keyed on `item.icon` (`dashboard`, `alerts`, `tickets`, `map`, `admin`, else a generic square). Add a `simulation` branch — use a simple "play/run" glyph so it doesn't require new asset files:

```html
{% elif item.icon == 'simulation' %}
<polygon points="5 3 19 12 5 21 5 3"></polygon>
```

Place this `elif` branch anywhere before the final `{% else %}` in that block.

### A.7 Acceptance criteria for Part A

Verify all of the following before considering Part A done:

1. `python manage.py check` passes with zero errors after the `INSTALLED_APPS` change.
2. `python manage.py migrate` runs clean (simulation app has no models, so no new migrations are expected — confirm `python manage.py makemigrations simulation` reports "No changes detected").
3. As an **anonymous** user: `GET /simulation/` redirects to login (302). `POST /api/simulation/run/` returns 302 (redirect to login) or 401/403 — must NOT return the prediction payload.
4. As a **logged-in, non-staff** user: `GET /simulation/` returns **403**. `POST /api/simulation/run/` returns **403** with a JSON error body, not the prediction payload.
5. As a **logged-in, staff (`is_staff=True`)** user:
   - The sidebar shows a "Simulation" link (with the new icon), positioned after "Map".
   - Clicking it loads `/simulation/` and renders the existing terminal/train UI.
   - Entering a source station and destination station and clicking "🚆 Let Our Journey Begin" successfully calls `POST /api/simulation/run/` (with CSRF token attached) and renders back alert level, fault type, anomaly score chart, and suggestions — reusing all existing frontend logic in `simulation.js`, unmodified except for the CSRF header addition from A.4.
   - Submitting with source == destination shows the existing inline validation error (`"Source and destination must be different stations."`) — this logic already exists server-side in `api_run_simulation`; just confirm it still fires correctly through the new auth wrapper.
6. Non-staff users never see the "Simulation" sidebar item at all (not just hidden via CSS — it must not be present in `nav_items`, since this is a security control, not a cosmetic one).

Do **not** change any visual styling of `simulation.html`/`simulation.css` in this pass — the user has explicitly said aesthetic polish is a separate, later request.

---

## PART B — BUGS TO FIX (found via static analysis + live run + test suite execution)

Each bug below was independently verified — not guessed — by actually installing dependencies, running Django's `check`/`migrate`/`test` management commands, and starting the dev server against a temporary SQLite database. Fix all of these in this same pass.

### B.1 [CRITICAL] Missing ML dependencies in `requirements.txt`

**Evidence:** Starting the dev server and calling `/api/predict/` (or the newly-wired `/api/simulation/run/`) produces this in the server log:

```
LocalPickleProvider: Failed to load AI pipeline: No module named 'torch'
```

`backend/ai_models/model_config.json` declares `"type": "cnn1d_sequence"` for both the risk and fault models — these are PyTorch models. `backend/ai_models/simple_pipeline.py` imports `numpy` directly. None of `torch`, `numpy`, or `scikit-learn` are listed in `requirements.txt`, which currently only lists:

```
Django>=4.2,<5.0
psycopg[binary]>=3.1
python-dotenv>=1.0
dj-database-url>=2.1.0
requests>=2.31.0
```

**Fix:** Add the missing packages to `requirements.txt`:

```
Django>=4.2,<5.0
psycopg[binary]>=3.1
python-dotenv>=1.0
dj-database-url>=2.1.0
requests>=2.31.0
numpy>=1.26,<2.0
torch>=2.2,<3.0
scikit-learn>=1.3,<2.0
```

Pin `torch` to a CPU-only wheel index if the deployment target has no GPU (check `ai_engin/requirements_colab.txt` for the version originally used to train the `.pkl` models and match it, to avoid pickle deserialization incompatibilities between training-time and inference-time PyTorch versions).

**Also fix the README**, which currently states: *"Only Django is required for the prototype dashboard."* This is misleading — the AI prediction feature (which is core to the product, and which the new Simulation feature depends on) silently degrades to a much weaker rule-based fallback without `torch`/`numpy` installed, with no visible warning to the end user in the UI. Update the README's "Tech Stack" and "Install Dependencies" sections to mention this explicitly.

**Acceptance criteria:** After `pip install -r requirements.txt` in a clean venv, calling `/api/predict/health/` (or triggering a simulation run) must show the real model provider loaded (`"provider_name": "local_pickle"` with no `error` key in `metadata`, not a rule-layer-only fallback).

### B.2 [HIGH] Hardcoded `DEBUG=True` and secret key in `settings.py`

**File:** `backend/rakshak_project/settings.py`

Current:

```python
SECRET_KEY = 'rakshak-phase1-prototype-key-change-in-production'
DEBUG = True
ALLOWED_HOSTS = ['*']
```

**Fix:** Read these from environment variables with safe local-dev defaults, consistent with how `DATABASE_URL` is already handled a few lines below:

```python
SECRET_KEY = os.environ.get('SECRET_KEY', 'rakshak-phase1-prototype-key-change-in-production')
DEBUG = os.environ.get('DEBUG', 'True') == 'True'
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')
```

Update `README.md`'s "Deployment" section (it already lists `DATABASE_URL`, `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` as required env vars for production — the code just wasn't actually reading them from the environment before this fix).

### B.3 [HIGH] `/api/predict/` and `/api/simulation/run/` have no authentication (beyond the fix already applied to simulation in Part A)

`backend/sensors/api_urls.py` → prediction endpoints are `@csrf_exempt` with no login/permission check, per `PROJECT_REPORT.md`'s own admission: *"No Authentication: The prototype lacks authentication middleware... This is a critical security debt."* This pass already fixes it for the simulation endpoint (Part A.4). Apply the same `@login_required` pattern (staff-only where the endpoint can create DB records like `Alert`) to `backend/sensors/api_views.py`'s predict endpoints, unless there is a documented reason external systems must call them unauthenticated (e.g. real IoT sensor devices posting telemetry with a separate device API key). If external device access is required, implement a lightweight API-key header check instead of leaving it fully open — do not leave it unauthenticated by default.

### B.4 [MEDIUM] Corrupt/binary file committed at repo root

**File:** `temp_pipeline.py` (repo root)

This file fails UTF-8 decoding (`'utf-8' codec can't decode byte 0xff in position 0`), meaning it's binary content saved with a `.py` extension — almost certainly an accidental commit (e.g. a pickle file or IDE artifact). It is dead weight in the repo and confuses any tooling that walks `.py` files (including `check_all_py.py` in this same repo, which currently reports it as a failure).

**Fix:** Determine what this file actually is (`file temp_pipeline.py` on the committed blob). If it's leftover scratch/binary data, delete it and add a `.gitignore` rule to prevent recurrence. If it's meant to be a real pipeline script, re-save it as valid UTF-8 Python and give it a real filename under `backend/ai_models/` or `ai_engin/`, not the project root.

### B.5 [MEDIUM] Documentation contradicts itself across three files

- `README.md`: "Only Django is required for the prototype dashboard."
- `PROJECT_REPORT.md`: describes a "PyTorch-based inference pipeline" as core architecture.
- `backend/rakshak_project/settings.py` module docstring: "This configuration uses: SQLite (default, no Postgres yet)" — but the actual `DATABASES` default value is `postgresql://postgres:password@localhost:5432/rakshak`, not SQLite.
- `Tree.md`: does not list the `backend/simulation/`, `backend/ai_models/`, or `backend/ai_integration/` directories at all, even though they exist and are load-bearing.

**Fix:** Regenerate `Tree.md` from the actual current file tree (a simple `tree /F` on Windows or `find . -not -path '*/.git/*'` on Linux, matching the existing format). Correct the settings.py docstring to say Postgres is the real default with SQLite only as an optional override via `DATABASE_URL`. Reconcile README vs PROJECT_REPORT.md on the ML stack description (see B.1 — the real answer is PyTorch is required, so both docs should say so consistently).

### B.6 [LOW] `railway/tests.py` is an empty Django boilerplate stub

**File:** `backend/railway/tests.py` — currently just:

```python
from django.test import TestCase

# Create your tests here.
```

This is misleading because it makes the `railway` app *look* like it has a tests module when it has zero actual test cases. See `test_progress.md` for the full plan to populate this (and the seven other untested apps).

---

## PART C — Definition of Done for This Pass

- `python manage.py check` → 0 issues.
- `python manage.py migrate` → clean, no missing migrations.
- `python manage.py test` → all existing 31 tests still pass, **plus** whatever new tests are added per `test_progress.md`.
- Simulation feature reachable from the sidebar **only** for `is_staff=True` users, with both the page and the API enforcing this server-side (not just hiding the nav link).
- `requirements.txt` installs cleanly and the AI pipeline loads the real model (no `torch` import errors in server logs).
- No UI/visual/CSS redesign performed in this pass — functional wiring and bug fixes only.
