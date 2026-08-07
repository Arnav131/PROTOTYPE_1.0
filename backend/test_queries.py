import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'rakshak_project.settings')
django.setup()

from map_view.api_views import api_stations, api_tickets
from django.test import RequestFactory
from django.db.models import Count, Q

rf = RequestFactory()
request = rf.get('/api/stations/')
# fake user authentication if needed, but the view requires it.
# Actually, let's just run the queries directly.
from railway.models import Station, Ticket

print("Testing Station query...")
stations = (
    Station.objects
    .filter(is_active=True)
    .select_related("division__zone")
    .annotate(
        active_alerts_start=Count(
            "track_sections_starting__alerts",
            filter=Q(track_sections_starting__alerts__status="active"),
            distinct=True
        ),
        active_alerts_end=Count(
            "track_sections_ending__alerts",
            filter=Q(track_sections_ending__alerts__status="active"),
            distinct=True
        ),
        tracks_start=Count("track_sections_starting", distinct=True),
        tracks_end=Count("track_sections_ending", distinct=True)
    )
    .order_by("station_name")
)

# Execute the query
try:
    l = list(stations)
    if l:
        s = l[0]
        print(f"Station: {s.station_name}")
        print(f"active_alerts_start: {s.active_alerts_start}")
        print(f"active_alerts_end: {s.active_alerts_end}")
        print(f"tracks_start: {s.tracks_start}")
        print(f"tracks_end: {s.tracks_end}")
except Exception as e:
    print("Error in station query:", e)

print("Testing Ticket query...")
tickets = (
    Ticket.objects
    .exclude(status="closed")
    .select_related(
        "track_section__start_station__division__zone",
        "track_section__end_station",
        "assigned_team",
    )
    .order_by("-created_at")[:200]
)
try:
    l2 = list(tickets)
    if l2:
        print("Ticket fetched successfully.")
except Exception as e:
    print("Error in ticket query:", e)
