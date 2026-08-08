# backend/bounty/apps.py
from django.apps import AppConfig


class BountyConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'bounty'
    verbose_name = 'Bounty — Agent Task Tools'
