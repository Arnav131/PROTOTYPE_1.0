"""
Tests for the AI-driven incident services: AlertService, TicketService,
and IncidentOrchestrator.

These cover safety-critical, side-effecting logic that was previously untested:
alert/ticket DB creation, severity/priority mapping, duplicate suppression
windows, maintenance-team auto-assignment, and orchestration wiring.
"""
from decimal import Decimal

from django.test import TestCase

from ai_integration.alert_service import AlertService
from ai_integration.incident_orchestrator import IncidentOrchestrator
from ai_integration.providers import PredictionResponse
from ai_integration.ticket_service import TicketService
from railway.models import (
    Alert, AuditLog, Division, MaintenanceTeam, Station, Ticket,
    TrackSection, Zone,
)


def make_response(**overrides):
    """Build a PredictionResponse with sensible anomaly defaults."""
    defaults = dict(
        is_anomaly=True,
        anomaly_score=0.90,
        failure_probabilities={"24h": 0.90},
        fault_type="gauge_widening",
        fault_confidence=0.88,
        alert_level="critical",
        provider_name="test_provider",
        metadata={"tier_scores": {"stat": 0.2}},
    )
    defaults.update(overrides)
    return PredictionResponse(**defaults)


class IncidentServiceTestBase(TestCase):
    def setUp(self):
        self.zone = Zone.objects.create(code="NR", name="Northern")
        self.div = Division.objects.create(zone=self.zone, code="DLI", name="Delhi")
        self.section = self._make_section("TRK-1")

    def _make_section(self, code):
        # Fresh station pair per section so the (start, end, direction) unique
        # constraint never collides across the sections a test creates.
        n = Station.objects.count()
        a = Station.objects.create(
            station_code=f"S{n}A", station_name=f"{code}-A", division=self.div,
            latitude=Decimal("28.6"), longitude=Decimal("77.2"))
        b = Station.objects.create(
            station_code=f"S{n}B", station_name=f"{code}-B", division=self.div,
            latitude=Decimal("28.7"), longitude=Decimal("77.3"))
        return TrackSection.objects.create(
            section_code=code, start_station=a, end_station=b)


class AlertServiceTests(IncidentServiceTestBase):
    def test_anomaly_alert_created_with_audit_row(self):
        svc = AlertService()
        pk = svc.create_anomaly_alert(make_response(), self.section.pk, sensor_id=None)

        self.assertIsNotNone(pk)
        alert = Alert.objects.get(pk=pk)
        self.assertEqual(alert.alert_type, Alert.AlertType.ANOMALY)
        self.assertEqual(alert.generated_by, Alert.GeneratedBy.ML_MODEL)
        self.assertEqual(alert.severity, Alert.Severity.CRITICAL)  # score 0.90 >= 0.85
        # Compliance: an append-only ML_PIPELINE audit record is written.
        self.assertTrue(
            AuditLog.objects.filter(
                entity_type="alert", entity_id=pk,
                actor_type=AuditLog.ActorType.ML_PIPELINE,
            ).exists()
        )

    def test_no_alert_when_not_anomaly(self):
        svc = AlertService()
        pk = svc.create_anomaly_alert(
            make_response(is_anomaly=False), self.section.pk)
        self.assertIsNone(pk)
        self.assertEqual(Alert.objects.count(), 0)

    def test_severity_mapping_from_score(self):
        svc = AlertService()
        cases = [(0.95, Alert.Severity.CRITICAL),
                 (0.70, Alert.Severity.WARNING),
                 (0.50, Alert.Severity.INFO)]
        for i, (score, expected) in enumerate(cases):
            section = self._make_section(f"SEV-{i}")  # distinct section dodges dedup
            pk = svc.create_anomaly_alert(
                make_response(anomaly_score=score, alert_level="critical"),
                section.pk)
            self.assertEqual(Alert.objects.get(pk=pk).severity, expected)

    def test_duplicate_anomaly_alert_suppressed_within_window(self):
        svc = AlertService()
        first = svc.create_anomaly_alert(make_response(), self.section.pk)
        second = svc.create_anomaly_alert(make_response(), self.section.pk)
        self.assertIsNotNone(first)
        self.assertIsNone(second)  # suppressed by the 30-min dedup window
        self.assertEqual(Alert.objects.filter(track_section=self.section).count(), 1)

    def test_predictive_alert_created_when_needs_alert(self):
        svc = AlertService()
        resp = make_response(is_anomaly=False, alert_level="warning",
                             anomaly_score=0.70,
                             failure_probabilities={"6h": 0.4, "24h": 0.7})
        pk = svc.create_predictive_alert(resp, self.section.pk)
        self.assertIsNotNone(pk)
        alert = Alert.objects.get(pk=pk)
        self.assertEqual(alert.alert_type, Alert.AlertType.PREDICTION)
        self.assertEqual(alert.severity, Alert.Severity.WARNING)


class TicketServiceTests(IncidentServiceTestBase):
    def _team(self, code, open_tickets=0, division=None, is_active=True):
        team = MaintenanceTeam.objects.create(
            team_code=code, team_name=f"Team {code}",
            division=division or self.div, is_active=is_active)
        for i in range(open_tickets):
            Ticket.objects.create(
                ticket_code=f"{code}-{i}", track_section=self.section,
                assigned_team=team, title="x", status=Ticket.Status.OPEN)
        return team

    def test_ticket_created_with_priority_cost_and_audit(self):
        self._team("T1")
        svc = TicketService()
        pk = svc.create_ticket_from_prediction(make_response(), self.section.pk)
        self.assertIsNotNone(pk)
        ticket = Ticket.objects.get(pk=pk)
        self.assertEqual(ticket.priority, Ticket.Priority.CRITICAL)  # score 0.9
        # gauge_widening cost/duration come from the fault estimate tables.
        self.assertEqual(ticket.cost_estimate_inr, Decimal("180000"))
        self.assertEqual(ticket.estimated_duration_hours, Decimal("8.0"))
        self.assertIsNotNone(ticket.assigned_team)
        self.assertTrue(
            AuditLog.objects.filter(
                entity_type="ticket", entity_id=pk,
                actor_type=AuditLog.ActorType.ML_PIPELINE,
            ).exists()
        )

    def test_find_available_team_prefers_least_loaded_in_division(self):
        self._team("BUSY", open_tickets=3)
        idle = self._team("IDLE", open_tickets=1)
        svc = TicketService()
        self.assertEqual(svc._find_available_team(self.section.pk), idle.pk)

    def test_find_available_team_falls_back_across_divisions(self):
        other_div = Division.objects.create(zone=self.zone, code="MUM", name="Mumbai")
        other = self._team("OTH", division=other_div)
        svc = TicketService()
        # No active team in the section's division -> any active team.
        self.assertEqual(svc._find_available_team(self.section.pk), other.pk)

    def test_find_available_team_excludes_inactive_and_resolved(self):
        active = self._team("ACT", open_tickets=5)
        self._team("INA", open_tickets=0, is_active=False)
        svc = TicketService()
        # Inactive team (0 load) must be excluded -> loaded active team wins.
        self.assertEqual(svc._find_available_team(self.section.pk), active.pk)

    def test_duplicate_ticket_suppressed_within_window(self):
        self._team("T1")
        svc = TicketService()
        first = svc.create_ticket_from_prediction(make_response(), self.section.pk)
        second = svc.create_ticket_from_prediction(make_response(), self.section.pk)
        self.assertIsNotNone(first)
        self.assertIsNone(second)


class IncidentOrchestratorTests(IncidentServiceTestBase):
    def test_process_prediction_creates_alert_and_ticket(self):
        MaintenanceTeam.objects.create(
            team_code="T1", team_name="T1", division=self.div)
        result = IncidentOrchestrator().process_prediction(
            make_response(), self.section.pk)
        self.assertTrue(result["alert_created"])
        self.assertTrue(result["ticket_created"])
        self.assertEqual(Alert.objects.count(), 1)
        self.assertEqual(Ticket.objects.count(), 1)

    def test_auto_ticket_false_creates_alert_only(self):
        result = IncidentOrchestrator().process_prediction(
            make_response(), self.section.pk, auto_ticket=False)
        self.assertTrue(result["alert_created"])
        self.assertFalse(result["ticket_created"])
        self.assertEqual(Ticket.objects.count(), 0)

    def test_benign_prediction_creates_nothing(self):
        benign = make_response(is_anomaly=False, alert_level="none",
                               anomaly_score=0.1)
        result = IncidentOrchestrator().process_prediction(benign, self.section.pk)
        self.assertFalse(result["alert_created"])
        self.assertFalse(result["ticket_created"])
        self.assertEqual(Alert.objects.count(), 0)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_no_track_section_is_safe_noop(self):
        result = IncidentOrchestrator().process_prediction(make_response(), None)
        self.assertFalse(result["alert_created"])
        self.assertFalse(result["ticket_created"])
