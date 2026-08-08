# backend/bounty/urls.py
"""
URL routing for the Bounty features — Agent Task Tools.

Routes:
    /bounty/                        → Agent Tasks page (template)
    /bounty/api/tasks/              → JSON list of seeded agent-task records
    /bounty/api/checklist/<task_id>/→ GET/POST checklist state for a task
    /bounty/api/export/<task_id>/   → Download structured review packet
"""

from django.urls import path

from . import views

app_name = "bounty"

urlpatterns = [
    path("", views.agent_tasks_page, name="page"),
    path("api/tasks/", views.api_tasks, name="api_tasks"),
    path("api/checklist/<str:task_id>/", views.api_checklist, name="api_checklist"),
    path("api/export/<str:task_id>/", views.api_export, name="api_export"),
]
