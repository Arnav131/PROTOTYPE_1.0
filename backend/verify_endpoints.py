import os
import django
from django.test import Client
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'rakshak_project.settings')
django.setup()

client = Client()

print("=" * 60)
print("VERIFICATION: EXISTING ENDPOINTS UNCHANGED")
print("=" * 60)

print("\n--- POST /api/predict/ ---")
request_payload = {
    "ambient_temp": 42.0,
    "humidity": 40.0,
    "vibration_rms": 4.8,
    "gauge_width": 1689.0,
    "track_section_id": 1,
    "sensor_id": 5
}
response = client.post('/api/predict/', data=json.dumps(request_payload), content_type='application/json')
print(f"Status: {response.status_code}")
data = response.json()
print(f"success: {data.get('success')}")
print(f"prediction keys: {list(data.get('prediction', {}).keys())}")
print(f"alert_created: {data.get('alert_created')}")
print(f"timestamp present: {'timestamp' in data}")

print("\n--- GET /api/predict/health/ ---")
health_response = client.get('/api/predict/health/')
print(f"Status: {health_response.status_code}")
health_data = health_response.json()
print(f"status: {health_data.get('status')}")
print(f"default_provider: {health_data.get('default_provider')}")

print("\n" + "=" * 60)
print("VERIFICATION: NEW JOURNEY ENDPOINTS")
print("=" * 60)

print("\n--- GET /api/journey/scenarios/ ---")
scenarios_response = client.get('/api/journey/scenarios/')
print(f"Status: {scenarios_response.status_code}")
scenarios_data = scenarios_response.json()
for s in scenarios_data.get("scenarios", []):
    print(f"  {s['id']}: {s['name']}")

print("\n--- POST /api/journey/start/ (healthy) ---")
journey_payload = {
    "start_station_id": 1,
    "end_station_id": 2,
    "scenario": "healthy",
    "sensor_id": "SIM-TEST-001",
    "seed": 42
}
journey_response = client.post('/api/journey/start/', data=json.dumps(journey_payload), content_type='application/json')
print(f"Status: {journey_response.status_code}")
journey_data = journey_response.json()
print(json.dumps(journey_data, indent=2))

print("\n--- POST /api/journey/start/ (gauge_widening) ---")
journey_payload2 = {
    "start_station_id": 1,
    "end_station_id": 2,
    "scenario": "gauge_widening",
    "sensor_id": "SIM-TEST-002",
    "seed": 42
}
journey_response2 = client.post('/api/journey/start/', data=json.dumps(journey_payload2), content_type='application/json')
print(f"Status: {journey_response2.status_code}")
journey_data2 = journey_response2.json()
print(json.dumps(journey_data2, indent=2))

print("\n--- POST /api/journey/start/ (invalid scenario) ---")
journey_bad = {
    "start_station_id": 1,
    "end_station_id": 2,
    "scenario": "NONEXISTENT",
}
journey_bad_response = client.post('/api/journey/start/', data=json.dumps(journey_bad), content_type='application/json')
print(f"Status: {journey_bad_response.status_code}")
print(json.dumps(journey_bad_response.json(), indent=2))

print("\n--- POST /api/journey/start/ (missing fields) ---")
journey_missing = {}
journey_missing_response = client.post('/api/journey/start/', data=json.dumps(journey_missing), content_type='application/json')
print(f"Status: {journey_missing_response.status_code}")
print(json.dumps(journey_missing_response.json(), indent=2))

print("\n" + "=" * 60)
print("VERIFICATION: CIRCULAR IMPORTS")
print("=" * 60)
try:
    from ai_integration.journey_service import JourneyService
    from ai_integration.mock_sensor_generator import generate_sequence
    from ai_integration.journey_views import api_journey_start
    print("All imports successful — no circular imports.")
except ImportError as e:
    print(f"IMPORT ERROR: {e}")
