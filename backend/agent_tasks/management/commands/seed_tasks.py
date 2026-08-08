from django.core.management.base import BaseCommand
from agent_tasks.models import AgentTask
import uuid

class Command(BaseCommand):
    help = 'Seeds the database with sample agent tasks'

    def handle(self, *args, **kwargs):
        AgentTask.objects.all().delete()

        # Task 1: The Judge-ready comprehensive sample
        AgentTask.objects.create(
            task_id=f"TASK-{str(uuid.uuid4())[:8].upper()}",
            title="Railway Maintenance Risk Assessment",
            section="Northern Zone - Delhi Route",
            status="Ready for Review",
            owner="AI Planning Agent",
            description="Comprehensive risk assessment of the Delhi-Chandigarh route focusing on track wear and weather impact.",
            missing_data=True,
            sources=[
                {"name": "Railway track data", "status": "Ready", "type": "Database"},
                {"name": "Sensor telemetry", "status": "Ready", "type": "IoT Stream"},
                {"name": "Historical maintenance records", "status": "Ready", "type": "Archive"},
                {"name": "Weather data", "status": "Needs Review", "type": "External API"},
                {"name": "Inspection reports", "status": "Missing", "type": "Manual Entry"},
                {"name": "Social media sentiment", "status": "Optional", "type": "External API"}
            ],
            warnings=[
                "Weather data feed delayed by 12 hours.",
                "Missing recent manual inspection reports for Sector 4."
            ],
            review_notes="The track data seems fine, but we need to wait for the latest inspection reports before finalizing this."
        )

        # Task 2
        AgentTask.objects.create(
            task_id=f"TASK-{str(uuid.uuid4())[:8].upper()}",
            title="Locomotive Efficiency Analysis",
            section="Western Zone - Mumbai Route",
            status="Completed",
            owner="Performance Agent",
            description="Analysis of fuel consumption across freight trains.",
            missing_data=False,
            sources=[
                {"name": "Locomotive logs", "status": "Ready", "type": "Database"},
                {"name": "Fuel station data", "status": "Ready", "type": "API"}
            ],
            warnings=[]
        )

        # Task 3
        AgentTask.objects.create(
            task_id=f"TASK-{str(uuid.uuid4())[:8].upper()}",
            title="Signal Degradation Prediction",
            section="Southern Zone - Chennai Route",
            status="Pending Review",
            owner="Predictive Agent",
            description="Predicting signal failures based on voltage fluctuations.",
            missing_data=False,
            sources=[
                {"name": "Signal telemetry", "status": "Ready", "type": "IoT Stream"}
            ],
            warnings=["Slight anomaly in voltage data on sector 2"]
        )

        # Task 4
        AgentTask.objects.create(
            task_id=f"TASK-{str(uuid.uuid4())[:8].upper()}",
            title="Passenger Load Forecasting",
            section="Eastern Zone - Kolkata Route",
            status="Needs Rework",
            owner="Forecasting Agent",
            description="Holiday season passenger load prediction.",
            missing_data=True,
            sources=[
                {"name": "Ticketing data", "status": "Ready", "type": "Database"},
                {"name": "Holiday calendar", "status": "Missing", "type": "API"}
            ],
            warnings=["Cannot forecast without holiday calendar data."]
        )

        # Task 5
        AgentTask.objects.create(
            task_id=f"TASK-{str(uuid.uuid4())[:8].upper()}",
            title="Bridge Structural Integrity Check",
            section="Central Zone - Nagpur Route",
            status="Pending Review",
            owner="AI Planning Agent",
            description="Analysis of bridge vibration sensors.",
            missing_data=False,
            sources=[
                {"name": "Vibration sensors", "status": "Ready", "type": "IoT Stream"},
                {"name": "Drone imagery", "status": "Needs Review", "type": "Storage"}
            ],
            warnings=["Drone imagery has low resolution in some parts."]
        )

        # Task 6
        AgentTask.objects.create(
            task_id=f"TASK-{str(uuid.uuid4())[:8].upper()}",
            title="Crew Schedule Optimization",
            section="Northern Zone - Delhi Route",
            status="Approved",
            owner="Optimization Agent",
            description="Optimizing crew shifts for the upcoming month.",
            missing_data=False,
            sources=[
                {"name": "Crew availability", "status": "Ready", "type": "Database"},
                {"name": "Train schedules", "status": "Ready", "type": "Database"}
            ],
            warnings=[]
        )

        self.stdout.write(self.style.SUCCESS('Successfully seeded 6 agent tasks'))
