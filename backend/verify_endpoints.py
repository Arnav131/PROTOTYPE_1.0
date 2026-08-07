import os
import django
from django.test import Client
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'rakshak_project.settings')
django.setup()

client = Client()

print("--- POST /api/predict/ ---")
request_payload = {
    "ambient_temp": 42.0,
    "humidity": 40.0,
    "vibration_rms": 4.8,
    "gauge_width": 1689.0,
    "track_section_id": 1,
    "sensor_id": 5
}
print("Request:", json.dumps(request_payload))
response = client.post('/api/predict/', data=json.dumps(request_payload), content_type='application/json')
print("Response:", response.status_code)
print(json.dumps(response.json(), indent=2))
print()

print("--- POST /api/predict/batch/ ---")
batch_payload = {
    "readings": [
        {"ambient_temp": 34, "humidity": 55, "vibration_rms": 1.2, "gauge_width": 1676},
        {"ambient_temp": 42, "humidity": 40, "vibration_rms": 4.8, "gauge_width": 1689}
    ],
    "create_alerts": False
}
print("Request:", json.dumps(batch_payload))
batch_response = client.post('/api/predict/batch/', data=json.dumps(batch_payload), content_type='application/json')
print("Response:", batch_response.status_code)
print(json.dumps(batch_response.json(), indent=2))
print()

print("--- GET /api/predict/health/ ---")
health_response = client.get('/api/predict/health/')
print("Response:", health_response.status_code)
print(json.dumps(health_response.json(), indent=2))
print()
