from django.db import models

class AgentTask(models.Model):
    task_id = models.CharField(max_length=100, unique=True)
    title = models.CharField(max_length=255)
    section = models.CharField(max_length=100)
    status = models.CharField(max_length=50)
    owner = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    
    missing_data = models.BooleanField(default=False)
    
    # JSON arrays for checklists and warnings
    sources = models.JSONField(default=list, blank=True)
    warnings = models.JSONField(default=list, blank=True)
    
    # Persistent storage for user notes
    review_notes = models.TextField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.task_id} - {self.title}"
