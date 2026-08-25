# backend/readiness/tests.py
import json
from decimal import Decimal
from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth import get_user_model
from django.utils import timezone
from railway.models import (
    Zone, Division, Station, TrackSection,
    OperationalReadinessCase, ReadinessChecklistItem, ReadinessAuditRecord
)
from readiness.services import (
    sign_off_checklist_item, submit_controller_decision, evaluate_case_telemetry
)

User = get_user_model()


class OperationalReadinessSeparationLogicTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="controller_test", password="password123")
        self.client = Client()
        self.client.login(username="controller_test", password="password123")

        self.zone = Zone.objects.create(code="NR", name="Northern Railway")
        self.division = Division.objects.create(zone=self.zone, code="DLI", name="Delhi Division")
        self.stn1 = Station.objects.create(
            station_code="NDLS", station_name="New Delhi", division=self.division,
            latitude=Decimal("28.6139"), longitude=Decimal("77.2090")
        )
        self.stn2 = Station.objects.create(
            station_code="MTJ", station_name="Mathura Junction", division=self.division,
            latitude=Decimal("27.4924"), longitude=Decimal("77.6737")
        )
        self.stn3 = Station.objects.create(
            station_code="AGC", station_name="Agra Cantt", division=self.division,
            latitude=Decimal("27.1594"), longitude=Decimal("77.9944")
        )

        self.track1 = TrackSection.objects.create(
            section_code="TRK-NDL-001", start_station=self.stn1, end_station=self.stn2,
            length_km=Decimal("141.0"), max_speed_kmph=130, status=TrackSection.Status.UNDER_MAINTENANCE
        )
        self.track2 = TrackSection.objects.create(
            section_code="TRK-AGC-002", start_station=self.stn2, end_station=self.stn3,
            length_km=Decimal("54.0"), max_speed_kmph=110, status=TrackSection.Status.UNDER_MAINTENANCE
        )

        # Case A: Ready track
        self.case_a = OperationalReadinessCase.objects.create(
            case_code="OPR-TEST-001",
            title="Track Re-Opening Delhi-Mathura",
            case_type=OperationalReadinessCase.CaseType.TRACK_REOPENING,
            track_section=self.track1,
            sensor_metrics={"vibration_rms": 1.2, "temperature_celsius": 32.0, "ai_risk_score": 0.04},
            readiness_decision=OperationalReadinessCase.ReadinessDecision.PENDING,
        )
        self.item_a1 = ReadinessChecklistItem.objects.create(
            case=self.case_a, sequence=1, item_code="CREW_CLEAR", title="Crew Cleared Track",
            category=ReadinessChecklistItem.Category.SAFETY, is_required=True, status=ReadinessChecklistItem.Status.PASSED
        )
        self.item_a2 = ReadinessChecklistItem.objects.create(
            case=self.case_a, sequence=2, item_code="OHE_ON", title="OHE Power Energized",
            category=ReadinessChecklistItem.Category.OHE, is_required=True, status=ReadinessChecklistItem.Status.PASSED
        )

        # Case B: Unready track
        self.case_b = OperationalReadinessCase.objects.create(
            case_code="OPR-TEST-002",
            title="Track Re-Opening Mathura-Agra",
            case_type=OperationalReadinessCase.CaseType.TRACK_REOPENING,
            track_section=self.track2,
            sensor_metrics={"vibration_rms": 4.8, "temperature_celsius": 48.0, "ai_risk_score": 0.85},
            readiness_decision=OperationalReadinessCase.ReadinessDecision.NOT_READY,
        )
        self.item_b1 = ReadinessChecklistItem.objects.create(
            case=self.case_b, sequence=1, item_code="CREW_CLEAR", title="Crew Cleared Track",
            category=ReadinessChecklistItem.Category.SAFETY, is_required=True, status=ReadinessChecklistItem.Status.PENDING
        )

    def test_strict_separation_logic_decision_isolation(self):
        """Authorizing Case A must NOT modify Case B's decision, checklist, or speed."""
        # Authorize Case A
        submit_controller_decision(
            case_code=self.case_a.case_code,
            user=self.user,
            decision=OperationalReadinessCase.ReadinessDecision.READY,
            speed_kmph=130,
            notes="Case A Authorized for full speed.",
        )

        self.case_a.refresh_from_db()
        self.case_b.refresh_from_db()

        # Verify Case A is READY
        self.assertEqual(self.case_a.readiness_decision, OperationalReadinessCase.ReadinessDecision.READY)
        self.assertEqual(self.case_a.cleared_speed_kmph, 130)

        # Verify Case B is STILL NOT_READY with zero speed and pending checklist
        self.assertEqual(self.case_b.readiness_decision, OperationalReadinessCase.ReadinessDecision.NOT_READY)
        self.assertEqual(self.case_b.cleared_speed_kmph, 0)
        self.assertEqual(self.case_b.checklist_items.first().status, ReadinessChecklistItem.Status.PENDING)

    def test_field_guard_sign_off_separation(self):
        """Field officer signing off Case B item modifies ONLY Case B."""
        sign_off_checklist_item(
            case_code=self.case_b.case_code,
            item_id_or_code="CREW_CLEAR",
            user=self.user,
            role_designation="Field Safety Guard",
            notes="Track clear of all staff.",
            status="passed",
        )

        self.item_b1.refresh_from_db()
        self.item_a1.refresh_from_db()

        self.assertEqual(self.item_b1.status, "passed")
        self.assertEqual(self.item_b1.signed_off_by, "controller_test")
        # Assert audit record was created for Case B only
        audit_b = ReadinessAuditRecord.objects.filter(case=self.case_b)
        self.assertTrue(audit_b.exists())

    def test_evaluate_case_telemetry_is_pure_on_read_path(self):
        """evaluate_case_telemetry must NOT persist readiness_score (no writes
        on GET/render). A sentinel value must survive an evaluate() call."""
        self.case_a.readiness_score = Decimal("1.23")
        self.case_a.save(update_fields=["readiness_score"])

        result = evaluate_case_telemetry(self.case_a)

        self.case_a.refresh_from_db()
        # Persisted value is untouched...
        self.assertEqual(self.case_a.readiness_score, Decimal("1.23"))
        # ...but the freshly computed score is returned to the caller.
        self.assertNotEqual(result["composite_score"], 1.23)

        # And it truly issues zero queries when annotated + prefetched
        # (no reads and, crucially, no writes on the render path).
        case = (
            OperationalReadinessCase.objects
            .prefetch_related("checklist_items")
            .get(pk=self.case_a.pk)
        )
        list(case.checklist_items.all())  # populate prefetch cache
        # Alerts fall back to a direct query unless annotated; provide the
        # attribute so this assertion isolates the "no queries" guarantee.
        case._active_critical_alerts = 0
        with self.assertNumQueries(0):
            evaluate_case_telemetry(case)

    def test_sign_off_persists_readiness_score(self):
        """The sign-off write path must refresh the persisted readiness_score."""
        self.assertIsNone(self.case_b.readiness_score)
        sign_off_checklist_item(
            case_code=self.case_b.case_code,
            item_id_or_code="CREW_CLEAR",
            user=self.user,
            status="passed",
        )
        self.case_b.refresh_from_db()
        # 1/1 checklist passed -> 60; telemetry fails (vib/temp/ai) -> 0.
        self.assertEqual(self.case_b.readiness_score, Decimal("60.00"))

    def test_telemetry_threshold_safety_gate(self):
        """Case B with vibration > 2.5 mm/s must fail automated safety checks."""
        telemetry = evaluate_case_telemetry(self.case_b)
        self.assertFalse(telemetry["vibration_passed"])
        self.assertFalse(telemetry["all_telemetry_passed"])

    def test_decision_view_treats_string_false_override_as_false(self):
        """Regression guard: the decision endpoint must NOT let the string
        "false" be coerced to a truthy override (bool("false") is True).
        Case B fails telemetry, so a non-override READY must be rejected (422)
        and the case must stay NOT_READY."""
        resp = self.client.post(
            reverse("readiness:api_decide", args=[self.case_b.case_code]),
            data=json.dumps({
                "decision": "ready",
                "speed_kmph": 110,
                "is_override": "false",  # string, not a JSON bool
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 422)
        self.case_b.refresh_from_db()
        self.assertEqual(
            self.case_b.readiness_decision,
            OperationalReadinessCase.ReadinessDecision.NOT_READY,
        )

    def test_decision_view_real_override_bypasses_gate(self):
        """A genuine boolean override lets the controller authorize despite a
        failed telemetry gate (the intended escape hatch still works)."""
        resp = self.client.post(
            reverse("readiness:api_decide", args=[self.case_b.case_code]),
            data=json.dumps({
                "decision": "ready",
                "speed_kmph": 30,
                "is_override": True,
                "override_reason": "manual field clearance",
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.case_b.refresh_from_db()
        self.assertEqual(
            self.case_b.readiness_decision,
            OperationalReadinessCase.ReadinessDecision.READY,
        )
        self.assertTrue(self.case_b.is_overridden)

        # Attempting to authorize READY without override must raise ValueError
        with self.assertRaises(ValueError):
            submit_controller_decision(
                case_code=self.case_b.case_code,
                user=self.user,
                decision=OperationalReadinessCase.ReadinessDecision.READY,
                speed_kmph=110,
                is_override=False,
            )
