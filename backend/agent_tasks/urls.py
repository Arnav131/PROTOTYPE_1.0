from django.urls import path
from . import views

urlpatterns = [
    path('', views.task_list, name='task_list'),
    path('<str:task_id>/', views.task_detail, name='task_detail'),
    path('<str:task_id>/update-notes/', views.task_update_notes, name='task_update_notes'),
    path('<str:task_id>/print/', views.task_print, name='task_print'),
]
