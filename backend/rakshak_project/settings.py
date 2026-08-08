# backend/rakshak_project/settings.py
"""
Django settings for the Rakshak project — Phase 1 Prototype.

This configuration uses:
  - SQLite (default, no Postgres yet)
  - Templates from frontend/templates/
  - Static files from frontend/static/
  - No authentication, no middleware beyond essentials
"""
import os
from pathlib import Path
from dotenv import load_dotenv


# Build paths relative to the backend/ directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from project root
load_dotenv(BASE_DIR.parent / '.env')

# SECURITY WARNING: keep the secret key used in production secret!
# This is a prototype key — will be replaced with env-var in production.
SECRET_KEY = 'rakshak-phase1-prototype-key-change-in-production'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = ['*']

# ---------------------------------------------------------------------------
# Application definition
# ---------------------------------------------------------------------------
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
    'bounty',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'railway.middleware.CurrentUserMiddleware',
]

ROOT_URLCONF = 'rakshak_project.urls'

# ---------------------------------------------------------------------------
# Templates — served from frontend/templates/
# ---------------------------------------------------------------------------
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [
            BASE_DIR.parent / 'frontend' / 'templates',
        ],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.template.context_processors.static',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'core.context_processors.navigation',
                'core.context_processors.project_meta',
            ],
        },
    },
]

WSGI_APPLICATION = 'rakshak_project.wsgi.application'

# ---------------------------------------------------------------------------
# Database — PostgreSQL for development
# ---------------------------------------------------------------------------
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'rakshak'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

# ---------------------------------------------------------------------------
# Static files — served from frontend/static/
# ---------------------------------------------------------------------------
STATIC_URL = '/static/'
STATICFILES_DIRS = [
    BASE_DIR.parent / 'frontend' / 'static',
]
STATIC_ROOT = BASE_DIR / 'staticfiles'

# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ---------------------------------------------------------------------------
# AI Integration — Provider Configuration
# ---------------------------------------------------------------------------
# This is the SINGLE configuration point for all AI providers.
#
# To switch AI backends, change DEFAULT_PROVIDER.
# To add a new provider, add an entry to PROVIDERS.
# Business logic is completely unaffected by these changes.
#
# FUTURE PROVIDERS:
#   'cloud': CloudAIProvider  — calls a remote AI API
#   'llm':   LLMProvider      — sends data to an LLM for analysis
#   'ensemble': EnsembleProvider — combines multiple providers
#
# ---------------------------------------------------------------------------
# DATABASE MIGRATION NOTE
#
# This configuration block does NOT affect the database.
# Current DB: SQLite
# Future DB: PostgreSQL
# Whether this code is PostgreSQL compatible: YES (no DB interaction)
# Whether teammate needs to modify anything: NO
# ---------------------------------------------------------------------------
SENSOR_SOURCE_CLASS = 'ai_integration.sensor_source.MockSensorSource'

RAKSHAK_AI = {
    # Which provider to use by default.
    # Change this single value to switch the entire AI backend.
    'DEFAULT_PROVIDER': 'local',

    'PROVIDERS': {
        # --- Local Pickle/PyTorch Provider ---
        # Loads trained models from ai_engin/trained_models/
        # This is the default for prototype and local development.
        'local': {
            'CLASS': 'ai_integration.local_provider.LocalPickleProvider',
            'MODEL_DIR': str(BASE_DIR.parent / 'ai_engin' / 'trained_models'),
            'WINDOW_SIZE': 16,
            'ALERT_THRESHOLD': 0.7,
            'CRITICAL_THRESHOLD': 0.9,
        },

        # --- Future: Cloud AI Provider ---
        # Uncomment and configure when moving to cloud inference.
        # 'cloud': {
        #     'CLASS': 'ai_integration.cloud_provider.CloudAIProvider',
        #     'API_URL': 'https://your-cloud-endpoint.com/predict',
        #     'API_KEY_ENV': 'RAKSHAK_CLOUD_API_KEY',
        #     'TIMEOUT_SECONDS': 10,
        # },

        # --- Future: LLM Provider ---
        # Uncomment and configure when integrating with an LLM.
        # 'llm': {
        #     'CLASS': 'ai_integration.llm_provider.LLMProvider',
        #     'MODEL_NAME': 'gpt-4',
        #     'API_KEY_ENV': 'RAKSHAK_LLM_API_KEY',
        # },
    },
}
# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
LOGIN_URL = 'login'
LOGIN_REDIRECT_URL = '/'
LOGOUT_REDIRECT_URL = 'login'