# 🚆 Rakshak — Railway Predictive Maintenance Dashboard

Rakshak is a Django-based prototype for railway predictive maintenance. It provides an
interactive dashboard for monitoring assets, routes, sensors, maintenance alerts, support
tickets, and an AI-powered live simulation of IoT sensor telemetry.

---

## Features

- Dashboard with railway maintenance overview (KPIs, charts)
- Interactive railway route map (Leaflet.js) with simulated train movement
- Alert management with severity/status filtering
- Ticket management with priority/status filtering
- Sensor monitoring and reading history
- Live Simulation page (staff-only): synthetic 16-reading IoT journeys fed into the ML prediction pipeline
- PostgreSQL (Supabase) database — SQLite is intentionally disabled
- Preloaded demo data via seed commands

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.10+, Django 4.2 |
| Database | Supabase / PostgreSQL |
| Frontend | HTML, CSS, vanilla JS, Chart.js, Leaflet.js |
| ML | PyTorch 2.2+, NumPy, scikit-learn |
| AI generators | Gemini → Grok → Anthropic → OpenAI → Ollama → Physics RNG fallback chain |

## Project Structure

```
PROTOTYPE_1.0/
├── backend/            # Django project + business logic (railway models, sensors, alerts, tickets, map_view)
├── frontend/           # Templates + static CSS/JS (server-rendered, no build step)
├── ai_engin/           # AI prediction engine integration
├── notebooks/          # ML training pipeline (Colab / PyTorch)
├── docs/               # Architecture docs + phase reports
├── demo_assets/        # Demo walkthrough script
├── .env.example        # Environment variable template
├── requirements.txt    # Python dependencies
└── INSTRUCTIONS.md     # Step-by-step setup guide
```

**Entry point:** `backend/manage.py`
**Config:** `backend/rakshak_project/settings.py`
**Routing:** `backend/rakshak_project/urls.py`

## Quick Start

```bash
# 1. Clone and enter the repo
git clone https://github.com/<your-username>/<repository-name>.git
cd <repository-name>

# 2. Create virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux / macOS

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
copy .env.example .env          # then set DATABASE_URL from your Supabase project

# 5. Migrate and seed (run inside backend/)
cd backend
python manage.py migrate
python manage.py seed_master_data
python manage.py seed_routes
python manage.py seed_sensors
python manage.py seed_demo_data
python manage.py seed_users

# 6. Run
python manage.py runserver
```

Open http://127.0.0.1:8000/

> Full details: see [INSTRUCTIONS.md](INSTRUCTIONS.md)

## Pages

| URL | Page |
|---|---|
| `/` | Dashboard |
| `/alerts/` | Alerts |
| `/tickets/` | Tickets |
| `/map/` | Railway Map |
| `/simulation/` | Live Simulation (staff-only) |
| `/sensors/` | Sensors |

## API Endpoints

JSON APIs are served by `backend/map_view/api_views.py` using plain `JsonResponse`:

- `/api/stations/` — station markers + health
- `/api/routes/` — track polylines
- `/api/alerts/` — active/acknowledged alerts
- `/api/tickets/` — open tickets
- `/api/summary/` — map stats counts
- `/api/trains/` — simulated train positions

## Environment Variables

Required in `.env` (see `.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string (**required**) |
| `SECRET_KEY` | Django secret key |
| `DEBUG` | `True` locally, `False` in production |
| `ALLOWED_HOSTS` | Comma-separated hostnames |
| `GEMINI_API_KEY` / `GROK_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Optional — simulation scenario generation (falls back through the chain to a physics RNG) |

SQLite is intentionally disabled: if `DATABASE_URL` is missing or points to SQLite,
Django raises a setup error before startup.

## Development Workflow

After modifying models:

```bash
python manage.py makemigrations
python manage.py migrate
```

To regenerate demo data, rerun the seed commands listed in Quick Start.

## Documentation

- [Codebase.md](Codebase.md) — full codebase navigation map
- [AI_ENGINE_GUIDE.md](AI_ENGINE_GUIDE.md) — AI engine details
- [Tree.md](Tree.md) — file tree
- [notebooks/SHARED_CONTRACT.md](notebooks/SHARED_CONTRACT.md) — ML training contract

## License

Prototype intended for demonstration and educational purposes.
