# 🚆 Rakshak - Railway Maintenance Dashboard Prototype

Rakshak is a prototype Railway Maintenance Dashboard built using Django. It provides an interactive interface for monitoring railway assets, maintenance alerts, routes, sensors, and support tickets. The project is designed to simulate a railway infrastructure monitoring system using seeded demo data.

---

# Features

- Dashboard with railway maintenance overview
- Interactive railway route map
- Alert Management
- Ticket Management
- Sensor Monitoring
- SQLite database support
- REST API backend
- Preloaded demo data for testing

---

# Tech Stack

- Python 3.10+
- Django 4.2+
- PostgreSQL (default) with SQLite override support via `DATABASE_URL`
- PyTorch 2.2+
- NumPy
- scikit-learn
- HTML
- CSS
- JavaScript
- Leaflet.js (Map)

---

# Project Structure

```
PROTOTYPE_1.0/
│
├── backend/
│   ├── railway/
│   ├── templates/
│   ├── static/
│   ├── db.sqlite3
│   ├── manage.py
│   └── requirements.txt
│
├── README.md
├── Codebase.md
└── Tree.md
```

---

# Prerequisites

Make sure the following software is installed:

- Python 3.10 or above
- Git
- pip

---

# Clone the Repository

```bash
git clone https://github.com/<your-username>/<repository-name>.git
cd <repository-name>/backend
```

---

# Create Virtual Environment (Recommended)

### Windows

```bash
python -m venv .venv
.venv\Scripts\activate
```

### Linux / macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
```

---

# Install Dependencies

The AI prediction feature is a core product capability, not an optional extra. Install the full ML stack before running the dashboard or simulation flows:

```bash
pip install -r requirements.txt
```

This includes Django, PostgreSQL driver support, NumPy, PyTorch, and scikit-learn so the local pickle-based prediction pipeline can load correctly.

---

# Apply Database Migrations

```bash
python manage.py migrate
```

---

# Seed the Database

Run the following commands **in the given order**:


```bash
cd backend

```
```bash
python manage.py seed_master_data
```

```bash
python manage.py seed_routes
```

```bash
python manage.py seed_demo_data
```

```bash
python manage.py seed_sensors
```

These commands populate the database with sample railway assets, routes, sensors, alerts, and tickets.

---

# Run the Development Server

```bash
python manage.py runserver
```

The application will start at:

```
http://127.0.0.1:8000/
```

---

# Available Pages

- Dashboard
- Alerts
- Tickets
- Railway Map
- Simulation (staff-only)
- Sensors

---

# API

The project also exposes REST API endpoints through Django REST Framework for dashboard data and railway resources.

---

# Demo Data

The repository includes management commands that automatically generate realistic demo data for:

- Railway Routes
- Stations
- Sensors
- Maintenance Alerts
- Tickets
- Assets

No manual database setup is required after running the seed commands.

---

# Deployment

Set the following environment variables in production or for local overrides:

```bash
export DATABASE_URL="postgresql://postgres:password@localhost:5432/rakshak"
export SECRET_KEY="change-me-in-production"
export DEBUG="False"
export ALLOWED_HOSTS="localhost,127.0.0.1"
```

`DEBUG` and `ALLOWED_HOSTS` are read from environment variables at runtime, and the app falls back to safe local defaults when unset.

---

# Development Workflow

Whenever database models are modified:

```bash
python manage.py makemigrations
python manage.py migrate
```

If demo data needs to be regenerated, rerun the seed commands:

```bash
python manage.py seed_master_data
python manage.py seed_routes
python manage.py seed_demo_data
python manage.py seed_sensors
```

---

# License

This project is intended as a prototype for demonstration and educational purposes.