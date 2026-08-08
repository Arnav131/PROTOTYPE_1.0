from django.shortcuts import render, get_object_or_404, redirect
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.db.models import Q
from .models import AgentTask

def task_list(request):
    tasks = AgentTask.objects.all().order_by('-created_at')
    
    # Filtering
    section = request.GET.get('section')
    status = request.GET.get('status')
    owner = request.GET.get('owner')
    missing_data = request.GET.get('missing_data')
    
    if section:
        tasks = tasks.filter(section__icontains=section)
    if status:
        tasks = tasks.filter(status__iexact=status)
    if owner:
        tasks = tasks.filter(owner__icontains=owner)
    if missing_data:
        tasks = tasks.filter(missing_data=(missing_data.lower() == 'true'))
        
    # Get distinct values for filter dropdowns
    sections = AgentTask.objects.values_list('section', flat=True).distinct()
    statuses = AgentTask.objects.values_list('status', flat=True).distinct()
    owners = AgentTask.objects.values_list('owner', flat=True).distinct()
    
    context = {
        'tasks': tasks,
        'sections': sections,
        'statuses': statuses,
        'owners': owners,
        'active_nav': 'tasks'
    }
    return render(request, 'agent_tasks/task_list.html', context)

def task_detail(request, task_id):
    task = get_object_or_404(AgentTask, task_id=task_id)
    
    # Calculate percentage completion based on checklist
    total_sources = len(task.sources)
    ready_sources = sum(1 for s in task.sources if s.get('status') == 'Ready')
    
    completion_percentage = 0
    if total_sources > 0:
        completion_percentage = int((ready_sources / total_sources) * 100)
        
    context = {
        'task': task,
        'completion_percentage': completion_percentage,
        'active_nav': 'tasks'
    }
    return render(request, 'agent_tasks/task_detail.html', context)

@require_POST
def task_update_notes(request, task_id):
    task = get_object_or_404(AgentTask, task_id=task_id)
    notes = request.POST.get('review_notes', '')
    
    task.review_notes = notes
    task.save()
    
    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return JsonResponse({'status': 'success'})
        
    return redirect('task_detail', task_id=task.task_id)

def task_print(request, task_id):
    task = get_object_or_404(AgentTask, task_id=task_id)
    
    total_sources = len(task.sources)
    ready_sources = sum(1 for s in task.sources if s.get('status') == 'Ready')
    completion_percentage = 0
    if total_sources > 0:
        completion_percentage = int((ready_sources / total_sources) * 100)
        
    context = {
        'task': task,
        'completion_percentage': completion_percentage,
    }
    return render(request, 'agent_tasks/task_print.html', context)
