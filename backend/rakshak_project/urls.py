# backend/rakshak_project/urls.py
"""
Root URL configuration for the Rakshak project.

Routes:
  /            → Dashboard (sensors app)
  /alerts/     → Alerts page
  /tickets/    → Maintenance Tickets page
  /map/        → Railway Map page
  /api/        → JSON API endpoints (map data)
  /api/ai/     → AI prediction endpoints (ai_integration)
"""
from django.contrib import admin
from django.urls import path, include

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
