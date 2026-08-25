import json
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from unittest.mock import patch

from railway.models import (
    Alert,
    AuditLog,
    Division,
    Station,
    TrackSection,
    Zone,
)

User = get_user_model()


class SensorsApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.non_staff = User.objects.create_user(username="viewer", password="secret123")
        self.staff = User.objects.create_user(username="admin", password="secret123", is_staff=True)

    def test_predict_non_staff_forbidden(self):
        self.client.force_login(self.non_staff)
        response = self.client.post('/api/predict/', data='{}', content_type='application/json')
        self.assertEqual(response.status_code, 403)

    def test_predict_invalid_json_returns_400(self):
        self.client.force_login(self.staff)
        response = self.client.post('/api/predict/', data='not-a-json', content_type='application/json')
        self.assertEqual(response.status_code, 400)

    def test_predict_missing_fields_returns_400(self):
        self.client.force_login(self.staff)
        response = self.client.post('/api/predict/', data='{}', content_type='application/json')
        self.assertEqual(response.status_code, 400)

    @patch('ai_integration.prediction_service.PredictionService')
    def test_predict_staff_success(self, MockService):
        # Stub the prediction service to return a simple predictable response
        class DummyResponse:
            def __init__(self):
                self.is_anomaly = False
                self.anomaly_score = 0.0
                self.fault_type = 'normal'
                self.alert_level = 'none'

            def to_dict(self):
                return {
                    'is_anomaly': self.is_anomaly,
                    'anomaly_score': self.anomaly_score,
                    'fault_type': self.fault_type,
                    'alert_level': self.alert_level,
                }

        instance = MockService.return_value
        instance.predict_for_sensor.return_value = DummyResponse()

        self.client.force_login(self.staff)
        payload = {
            "ambient_temp": 25.0,
            "humidity": 40.0,
            "vibration_rms": 1.2,
            "gauge_width": 1676.0
        }
        import json
        response = self.client.post('/api/predict/', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get('success'))
        self.assertIn('prediction', data)

    @patch('ai_integration.prediction_service.PredictionService')
    def test_batch_predict_staff_success(self, MockService):
        class DummyResponse:
            def __init__(self):
                self.is_anomaly = False
                self.anomaly_score = 0.0
                self.fault_type = 'normal'
                self.alert_level = 'none'

            def to_dict(self):
                return {
                    'is_anomaly': self.is_anomaly,
                    'anomaly_score': self.anomaly_score,
                    'fault_type': self.fault_type,
                    'alert_level': self.alert_level,
                }

        instance = MockService.return_value
        instance.predict_for_sensor.return_value = DummyResponse()

        self.client.force_login(self.staff)
        import json
        payload = {
            "readings": [
                {"ambient_temp": 25.0, "humidity": 40.0, "vibration_rms": 1.2, "gauge_width": 1676.0},
                {"ambient_temp": 26.0, "humidity": 41.0, "vibration_rms": 1.3, "gauge_width": 1677.0}
            ]
        }
        response = self.client.post('/api/predict/batch/', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get('success'))
        self.assertEqual(data.get('count'), 2)

    def test_health_endpoint_accessible(self):
        response = self.client.get('/api/predict/health/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('status', data)


class PredictAlertIntegrationTests(TestCase):
    """
    Verifies /api/predict/ routes alert creation through the shared
    AlertService (item 1 of the follow-up pass): a warning/critical
    prediction with a track_section_id must create an Alert AND an
    append-only AuditLog row — the compliance behaviour the previous
    duplicate path omitted.
    """

    def setUp(self):
        self.client = Client()
        self.staff = User.objects.create_user(
            username="ctrl", password="secret123", is_staff=True
        )
        zone = Zone.objects.create(code="NR", name="Northern Railway")
        div = Division.objects.create(zone=zone, code="DLI", name="Delhi")
        s1 = Station.objects.create(
            station_code="AAA", station_name="A", division=div,
            latitude=Decimal("28.6"), longitude=Decimal("77.2"),
        )
        s2 = Station.objects.create(
            station_code="BBB", station_name="B", division=div,
            latitude=Decimal("28.7"), longitude=Decimal("77.3"),
        )
        self.section = TrackSection.objects.create(
            section_code="TRK-1", start_station=s1, end_station=s2,
        )

    def test_predict_with_anomaly_creates_alert_and_audit_row(self):
        self.client.force_login(self.staff)
        # Extreme gauge deviation (1695 - 1676 = 19mm > 15mm) forces the
        # rule layer to a critical / is_anomaly=True result even in the
        # models-not-loaded (rules-only) test environment.
        payload = {
            "ambient_temp": 30.0,
            "humidity": 45.0,
            "vibration_rms": 2.0,
            "gauge_width": 1695.0,
            "track_section_id": self.section.pk,
        }
        response = self.client.post(
            "/api/predict/", data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["prediction"]["is_anomaly"])
        self.assertTrue(data["alert_created"])
        # alert_id is now the integer PK (consistent with /api/ai/predict/).
        self.assertIsInstance(data["alert_id"], int)

        self.assertEqual(Alert.objects.count(), 1)
        # AlertService writes an append-only ML_PIPELINE audit record — the
        # traceability guarantee the old _maybe_create_alert path lacked.
        self.assertTrue(
            AuditLog.objects.filter(
                entity_type="alert",
                actor_type=AuditLog.ActorType.ML_PIPELINE,
            ).exists()
        )

    def test_predict_without_track_section_creates_no_alert(self):
        self.client.force_login(self.staff)
        payload = {
            "ambient_temp": 30.0,
            "humidity": 45.0,
            "vibration_rms": 2.0,
            "gauge_width": 1695.0,
            # no track_section_id -> alert creation is skipped
        }
        response = self.client.post(
            "/api/predict/", data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["alert_created"])
        self.assertIsNone(data["alert_id"])
        self.assertEqual(Alert.objects.count(), 0)
