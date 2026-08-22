# backend/railway/management/commands/seed_readiness_data.py
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model
from railway.models import (
    Station, TrackSection, MaintenanceTeam,
    OperationalReadinessCase, ReadinessChecklistItem, ReadinessAuditRecord
)

User = get_user_model()


class Command(BaseCommand):
    help = "Seed demonstration operational readiness cases with separation logic."

    def handle(self, *args, **options):
        self.stdout.write("Seeding Operational Readiness demonstration data...")

        # Find or create track sections
        trk_1 = TrackSection.objects.filter(section_code__icontains="NDL").first() or TrackSection.objects.first()
        trk_2 = TrackSection.objects.exclude(pk=getattr(trk_1, "pk", 0)).first() or trk_1

        team = MaintenanceTeam.objects.first()
        if not team:
            team = MaintenanceTeam.objects.create(
                team_name="Northern Quick Response Gang #4",
                specialization="track",
                contact_phone="+91-9876543210"
            )

        # -------------------------------------------------------------
        # CASE 1: Track Re-opening (Delhi–Mathura) -> READY FOR GO (130 km/h)
        # -------------------------------------------------------------
        case1, _ = OperationalReadinessCase.objects.update_or_create(
            case_code="OPR-TRK-NDL-001",
            defaults={
                "title": "Delhi–Mathura Main Line Track Re-Opening & Speed Clearance",
                "case_type": OperationalReadinessCase.CaseType.TRACK_REOPENING,
                "track_section": trk_1,
                "assigned_team": team,
                "description": "Post-weld grinding inspection and line clearance verification following scheduled rail joint overhaul.",
                "workflow_status": OperationalReadinessCase.WorkflowStatus.COMPLETED,
                "readiness_decision": OperationalReadinessCase.ReadinessDecision.READY,
                "isolation_state": OperationalReadinessCase.IsolationState.RESTORED,
                "sensor_metrics": {
                    "vibration_rms": 1.25,
                    "temperature_celsius": 32.4,
                    "ai_risk_score": 0.06,
                },
                "readiness_score": Decimal("98.50"),
                "cleared_speed_kmph": 130,
                "decision_taken_by": "Senior Divisional Engineer (DLI)",
                "decision_taken_at": timezone.now(),
                "decision_reference": "LINE-BLOCK-CLR-9012",
                "decision_notes": "All track telemetry verified nominal. Physical clearance verified. Line restored to normal speed 130 km/h.",
                "is_overridden": False,
            }
        )

        c1_items = [
            (1, "CREW_CLEAR", "Ground Crew & Equipment Cleared", ReadinessChecklistItem.Category.SAFETY, ReadinessChecklistItem.Status.PASSED, "R. K. Sharma (Field Safety Guard)", "All 8 track workers and grinding machines evacuated to safe cess."),
            (2, "OHE_POWER", "25kV Traction Power Energization", ReadinessChecklistItem.Category.OHE, ReadinessChecklistItem.Status.PASSED, "P. Verma (Traction Power Controller)", "Isolation removed. 25kV OHE feeder energized and synced."),
            (3, "INTERLOCKING", "Point Machine & Interlocking Synchronized", ReadinessChecklistItem.Category.SIGNAL, ReadinessChecklistItem.Status.PASSED, "S. Gupta (Chief Signal Inspector)", "Electronic Interlocking points tested. Route locking verified."),
            (4, "PW_MEMO", "Permanent Way Section Engineer Memo", ReadinessChecklistItem.Category.CIVIL, ReadinessChecklistItem.Status.PASSED, "A. Singh (Section Engineer P-Way)", "Visual track alignment and ultrasonic weld inspection signed off."),
        ]
        for seq, code, title, cat, status, signed_by, notes in c1_items:
            ReadinessChecklistItem.objects.update_or_create(
                case=case1, sequence=seq,
                defaults={
                    "item_code": code, "title": title, "category": cat,
                    "status": status, "is_required": True,
                    "signed_off_by": signed_by, "signed_off_at": timezone.now(),
                    "sign_off_comments": notes,
                }
            )

        ReadinessAuditRecord.objects.get_or_create(
            case=case1, record_type=ReadinessAuditRecord.RecordType.DECISION,
            defaults={
                "actor_type": ReadinessAuditRecord.ActorType.USER,
                "actor_identifier": "Sr. Divisional Engineer",
                "decision": OperationalReadinessCase.ReadinessDecision.READY,
                "new_state": {"decision": "ready", "speed_kmph": 130},
                "decision_summary": "Authorized line clearance at full permissible speed 130 km/h.",
                "notes": "Line clearance protocol complete.",
            }
        )

        # -------------------------------------------------------------
        # CASE 2: Track Re-opening (Agra–Gwalior) -> CRITICAL HOLD (0 km/h)
        # -------------------------------------------------------------
        case2, _ = OperationalReadinessCase.objects.update_or_create(
            case_code="OPR-TRK-AGC-002",
            defaults={
                "title": "Agra–Gwalior Section Emergency Weld Assessment",
                "case_type": OperationalReadinessCase.CaseType.TRACK_REOPENING,
                "track_section": trk_2,
                "assigned_team": team,
                "description": "Rail surface defect flagged by track vibration sensor. Thermal stress and joint displacement under review.",
                "workflow_status": OperationalReadinessCase.WorkflowStatus.FIELD_VERIFICATION,
                "readiness_decision": OperationalReadinessCase.ReadinessDecision.NOT_READY,
                "isolation_state": OperationalReadinessCase.IsolationState.ISOLATED,
                "sensor_metrics": {
                    "vibration_rms": 4.82,
                    "temperature_celsius": 48.6,
                    "ai_risk_score": 0.84,
                },
                "readiness_score": Decimal("25.00"),
                "cleared_speed_kmph": 0,
                "decision_taken_by": "Safety Officer (AGC)",
                "decision_taken_at": timezone.now(),
                "decision_reference": "HOLD-EMERGENCY-441",
                "decision_notes": "CRITICAL: Sensor vibration spike (4.82 mm/s > 2.5 mm/s) and high rail temperature. Track remains blocked.",
                "is_overridden": False,
            }
        )

        c2_items = [
            (1, "CREW_CLEAR", "Ground Crew & Equipment Cleared", ReadinessChecklistItem.Category.SAFETY, ReadinessChecklistItem.Status.PENDING, "", "Crew is currently on track inspecting rail defect at KM 124/8."),
            (2, "OHE_POWER", "25kV Traction Power Isolation Grounded", ReadinessChecklistItem.Category.OHE, ReadinessChecklistItem.Status.PENDING, "", "Traction power remains isolated for worker protection."),
            (3, "INTERLOCKING", "Point Machine & Interlocking Synchronized", ReadinessChecklistItem.Category.SIGNAL, ReadinessChecklistItem.Status.FAILED, "M. Kumar (Signal Inspector)", "Switch point detector contact mismatch detected."),
            (4, "PW_MEMO", "Permanent Way Section Engineer Memo", ReadinessChecklistItem.Category.CIVIL, ReadinessChecklistItem.Status.PASSED, "K. L. Meena (P-Way Engineer)", "Preliminary crack detection report registered in Rakshak."),
        ]
        for seq, code, title, cat, status, signed_by, notes in c2_items:
            ReadinessChecklistItem.objects.update_or_create(
                case=case2, sequence=seq,
                defaults={
                    "item_code": code, "title": title, "category": cat,
                    "status": status, "is_required": True,
                    "signed_off_by": signed_by,
                    "signed_off_at": timezone.now() if signed_by else None,
                    "sign_off_comments": notes,
                }
            )

        ReadinessAuditRecord.objects.get_or_create(
            case=case2, record_type=ReadinessAuditRecord.RecordType.DECISION,
            defaults={
                "actor_type": ReadinessAuditRecord.ActorType.SYSTEM,
                "actor_identifier": "Automated Safety Gate",
                "decision": OperationalReadinessCase.ReadinessDecision.NOT_READY,
                "new_state": {"decision": "not_ready", "speed_kmph": 0},
                "decision_summary": "Automatic HOLD triggered due to vibration spike > 2.5 mm/s and pending crew clearance.",
                "notes": "Safety interlock active.",
            }
        )

        # -------------------------------------------------------------
        # CASE 3: Train Departure (Rajdhani #12951) -> CAUTION (30 km/h)
        # -------------------------------------------------------------
        case3, _ = OperationalReadinessCase.objects.update_or_create(
            case_code="OPR-DEP-12951",
            defaults={
                "title": "Train #12951 (Rajdhani Express) Departure Safety Clearance",
                "case_type": OperationalReadinessCase.CaseType.ROUTE_DEPARTURE,
                "train_number": "12951 New Delhi – Mumbai Central Rajdhani Express",
                "track_section": trk_1,
                "description": "Pre-departure route safety clearance and electronic interlocking check before green departure signal.",
                "workflow_status": OperationalReadinessCase.WorkflowStatus.COMPLETED,
                "readiness_decision": OperationalReadinessCase.ReadinessDecision.CONDITIONALLY_READY,
                "isolation_state": OperationalReadinessCase.IsolationState.RESTORED,
                "sensor_metrics": {
                    "vibration_rms": 2.10,
                    "temperature_celsius": 38.0,
                    "ai_risk_score": 0.18,
                },
                "readiness_score": Decimal("82.00"),
                "cleared_speed_kmph": 30,
                "decision_taken_by": "Chief Train Dispatcher (NDLS)",
                "decision_taken_at": timezone.now(),
                "decision_reference": "DEP-AUTH-12951-NDLS",
                "decision_notes": "Departure authorized under Caution speed 30 km/h over NDLS yard turnout due to adjacent track maintenance.",
                "decision_conditions": "Speed restricted to 30 km/h until clearing KM 4/2.",
                "is_overridden": False,
            }
        )

        c3_items = [
            (1, "ROUTE_BLOCK", "Downline Route Clearance", ReadinessChecklistItem.Category.SAFETY, ReadinessChecklistItem.Status.PASSED, "Station Master (NDLS)", "Platform 1 departure route cleared of all shunting movements."),
            (2, "INTERLOCKING_ROUTE", "Electronic Route Interlocking Locked", ReadinessChecklistItem.Category.SIGNAL, ReadinessChecklistItem.Status.PASSED, "Signal In-Charge", "Route locked from Platform 1 to Down Fast line."),
            (3, "TRACTION_FEED", "Substation 25kV Feeder Voltage Normal", ReadinessChecklistItem.Category.OHE, ReadinessChecklistItem.Status.PASSED, "TPC Delhi Control", "Voltage 26.2 kV steady."),
            (4, "LOCO_SYNC", "Locomotive ATP & Telemetry Handshake", ReadinessChecklistItem.Category.DOCUMENTATION, ReadinessChecklistItem.Status.PASSED, "Loco Pilot (Capt. R. Verma)", "Kavach cab signaling confirmed active."),
        ]
        for seq, code, title, cat, status, signed_by, notes in c3_items:
            ReadinessChecklistItem.objects.update_or_create(
                case=case3, sequence=seq,
                defaults={
                    "item_code": code, "title": title, "category": cat,
                    "status": status, "is_required": True,
                    "signed_off_by": signed_by, "signed_off_at": timezone.now(),
                    "sign_off_comments": notes,
                }
            )

        ReadinessAuditRecord.objects.get_or_create(
            case=case3, record_type=ReadinessAuditRecord.RecordType.DECISION,
            defaults={
                "actor_type": ReadinessAuditRecord.ActorType.USER,
                "actor_identifier": "Chief Train Dispatcher",
                "decision": OperationalReadinessCase.ReadinessDecision.CONDITIONALLY_READY,
                "new_state": {"decision": "conditionally_ready", "speed_kmph": 30},
                "decision_summary": "Cleared for departure with 30 km/h turnout caution restriction.",
                "notes": "Route locked and synchronized.",
            }
        )

        self.stdout.write(self.style.SUCCESS("Successfully seeded 3 isolated Operational Readiness cases!"))
