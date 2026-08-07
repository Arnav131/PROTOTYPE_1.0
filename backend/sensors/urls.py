# backend/rakshak_project/urls.py
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
    path('api/predict/', include('sensors.api_urls')),  # ← Add this line
]