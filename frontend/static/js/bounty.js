// frontend/static/js/bounty.js
//
// Bounty Features — Agent Task Tools
// Handles: task loading, search with highlighting, filter controls,
//          checklist interactions, state saving, and review packet export.

'use strict';

(function () {

    // ── State ────────────────────────────────────────────────────────
    let allTasks = [];
    let filterOptions = {};
    let currentSearch = '';
    let currentFilters = { section: '', status: '', owner: '', missing_data: '' };
    let expandedTaskId = null;

    // ── DOM References ───────────────────────────────────────────────
    const taskListEl = document.getElementById('bounty-task-list');
    const searchInput = document.getElementById('bounty-search');
    const filterSection = document.getElementById('bounty-filter-section');
    const filterStatus = document.getElementById('bounty-filter-status');
    const filterOwner = document.getElementById('bounty-filter-owner');
    const missingToggle = document.getElementById('bounty-missing-toggle');
    const resetBtn = document.getElementById('bounty-btn-reset');
    const activeFiltersEl = document.getElementById('bounty-active-filters');
    const taskCountEl = document.getElementById('bounty-task-count');

    // ── Init ─────────────────────────────────────────────────────────
    function init() {
        if (!taskListEl) return;
        loadTasks();
        bindEvents();
    }

    function bindEvents() {
        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', function () {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    currentSearch = searchInput.value.trim();
                    renderTasks();
                }, 250);
            });
        }

        if (filterSection) filterSection.addEventListener('change', () => {
            currentFilters.section = filterSection.value;
            renderTasks();
        });
        if (filterStatus) filterStatus.addEventListener('change', () => {
            currentFilters.status = filterStatus.value;
            renderTasks();
        });
        if (filterOwner) filterOwner.addEventListener('change', () => {
            currentFilters.owner = filterOwner.value;
            renderTasks();
        });

        if (missingToggle) missingToggle.addEventListener('click', () => {
            if (currentFilters.missing_data === 'true') {
                currentFilters.missing_data = '';
                missingToggle.classList.remove('active');
            } else {
                currentFilters.missing_data = 'true';
                missingToggle.classList.add('active');
            }
            renderTasks();
        });

        if (resetBtn) resetBtn.addEventListener('click', resetFilters);
    }

    // ── API Calls ────────────────────────────────────────────────────
    function loadTasks() {
        taskListEl.innerHTML = `
            <div class="bounty-loading">
                <div class="bounty-spinner"></div>
                <div>Loading agent tasks…</div>
            </div>
        `;

        fetch('/bounty/api/tasks/')
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    allTasks = data.tasks;
                    filterOptions = data.filter_options;
                    populateFilterDropdowns();
                    renderTasks();
                }
            })
            .catch(err => {
                taskListEl.innerHTML = `
                    <div class="bounty-empty">
                        <div class="bounty-empty-icon">⚠️</div>
                        <div class="bounty-empty-text">Failed to load tasks</div>
                        <div class="bounty-empty-sub">${err.message}</div>
                    </div>
                `;
            });
    }

    function saveChecklist(taskId, items) {
        return fetch(`/bounty/api/checklist/${taskId}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: items }),
        })
            .then(r => r.json());
    }

    function exportReviewPacket(taskId) {
        window.location.href = `/bounty/api/export/${taskId}/`;
    }

    // ── Filter Dropdowns ─────────────────────────────────────────────
    function populateFilterDropdowns() {
        if (filterSection && filterOptions.sections) {
            filterSection.innerHTML = '<option value="">All Sections</option>';
            filterOptions.sections.forEach(s => {
                filterSection.innerHTML += `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`;
            });
        }
        if (filterStatus && filterOptions.statuses) {
            filterStatus.innerHTML = '<option value="">All Statuses</option>';
            filterOptions.statuses.forEach(s => {
                const label = s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                filterStatus.innerHTML += `<option value="${escapeHtml(s)}">${escapeHtml(label)}</option>`;
            });
        }
        if (filterOwner && filterOptions.owners) {
            filterOwner.innerHTML = '<option value="">All Agents</option>';
            filterOptions.owners.forEach(s => {
                const label = s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                filterOwner.innerHTML += `<option value="${escapeHtml(s)}">${escapeHtml(label)}</option>`;
            });
        }
    }

    // ── Filtering & Search ───────────────────────────────────────────
    function getFilteredTasks() {
        let tasks = [...allTasks];

        if (currentFilters.section) {
            tasks = tasks.filter(t => t.section === currentFilters.section);
        }
        if (currentFilters.status) {
            tasks = tasks.filter(t => t.status === currentFilters.status);
        }
        if (currentFilters.owner) {
            tasks = tasks.filter(t => t.owner === currentFilters.owner);
        }
        if (currentFilters.missing_data === 'true') {
            tasks = tasks.filter(t => t.missing_data);
        }
        if (currentSearch) {
            const q = currentSearch.toLowerCase();
            tasks = tasks.filter(t =>
                t.title.toLowerCase().includes(q) ||
                t.section.toLowerCase().includes(q) ||
                t.owner.toLowerCase().includes(q) ||
                t.agent.toLowerCase().includes(q) ||
                (t.notes || '').toLowerCase().includes(q) ||
                t.id.toLowerCase().includes(q) ||
                JSON.stringify(t.generated_content || {}).toLowerCase().includes(q)
            );
        }

        return tasks;
    }

    function resetFilters() {
        currentSearch = '';
        currentFilters = { section: '', status: '', owner: '', missing_data: '' };
        if (searchInput) searchInput.value = '';
        if (filterSection) filterSection.value = '';
        if (filterStatus) filterStatus.value = '';
        if (filterOwner) filterOwner.value = '';
        if (missingToggle) missingToggle.classList.remove('active');
        renderTasks();
    }

    function countActiveFilters() {
        let count = 0;
        if (currentSearch) count++;
        if (currentFilters.section) count++;
        if (currentFilters.status) count++;
        if (currentFilters.owner) count++;
        if (currentFilters.missing_data) count++;
        return count;
    }

    // ── Rendering ────────────────────────────────────────────────────
    function renderTasks() {
        const tasks = getFilteredTasks();

        // Update active filter badge
        const activeCount = countActiveFilters();
        if (activeFiltersEl) {
            if (activeCount > 0) {
                activeFiltersEl.textContent = `${activeCount} active`;
                activeFiltersEl.classList.add('visible');
            } else {
                activeFiltersEl.classList.remove('visible');
            }
        }

        // Update count
        if (taskCountEl) {
            taskCountEl.textContent = `${tasks.length} of ${allTasks.length} tasks`;
        }

        if (tasks.length === 0) {
            taskListEl.innerHTML = `
                <div class="bounty-empty">
                    <div class="bounty-empty-icon">🔍</div>
                    <div class="bounty-empty-text">No tasks match your filters</div>
                    <div class="bounty-empty-sub">Try adjusting your search or filter criteria</div>
                </div>
            `;
            return;
        }

        taskListEl.innerHTML = '';
        tasks.forEach(task => {
            taskListEl.appendChild(createTaskCard(task));
        });
    }

    function createTaskCard(task) {
        const card = document.createElement('div');
        card.className = `bounty-task-card bounty-task-card--${task.status}`;
        card.id = `task-card-${task.id}`;
        if (expandedTaskId === task.id) card.classList.add('expanded');

        // Compute checklist stats
        const items = task.checklist.items;
        const total = items.length;
        const checked = items.filter(i => i.checked).length;
        const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
        const fillClass = pct === 100 ? 'full' : pct >= 50 ? 'partial' : 'low';

        // Highlight search matches
        const title = highlightText(task.title);
        const notes = highlightText(task.notes || '');

        card.innerHTML = `
            <div class="bounty-task-strip"></div>
            <div class="bounty-task-body">
                <div class="bounty-task-header">
                    <div class="bounty-task-title-row">
                        <h3 class="bounty-task-title">${title}</h3>
                        <div class="bounty-task-subtitle">
                            <span class="bounty-task-id">${escapeHtml(task.id)}</span>
                            <span class="bounty-task-section-badge">${escapeHtml(task.section)}</span>
                        </div>
                    </div>
                    <div class="bounty-task-meta">
                        <span class="bounty-status-badge bounty-status-badge--${task.status}">
                            ${escapeHtml(task.status.replace(/_/g, ' '))}
                        </span>
                        ${task.missing_data ? '<span class="bounty-missing-badge">⚠ Missing Data</span>' : ''}
                    </div>
                </div>
                <div class="bounty-task-summary">
                    <span class="bounty-task-summary-item">🤖 ${escapeHtml(task.agent)}</span>
                    <span class="bounty-task-summary-item">📅 ${escapeHtml(task.created_at)}</span>
                    <div class="bounty-completion-bar-wrap">
                        <div class="bounty-completion-bar">
                            <div class="bounty-completion-fill bounty-completion-fill--${fillClass}" style="width:${pct}%"></div>
                        </div>
                        <span class="bounty-completion-pct">${pct}%</span>
                    </div>
                </div>
            </div>
            <div class="bounty-task-expand">▸</div>
            <div class="bounty-task-detail">
                <div class="bounty-detail-grid">
                    ${renderChecklistPanel(task)}
                    ${renderResultsPanel(task)}
                </div>
                ${task.notes ? `<div class="bounty-notes"><div class="bounty-notes-label">Notes</div>${notes}</div>` : ''}
                <div class="bounty-detail-actions">
                    <button class="bounty-btn-collapse" onclick="event.stopPropagation(); bountyCollapseTask('${task.id}')">
                        ▴ Collapse
                    </button>
                    <button class="bounty-btn-export" onclick="event.stopPropagation(); bountyExportTask('${task.id}')">
                        📥 Export Review Packet
                    </button>
                </div>
            </div>
        `;

        // Click to expand/collapse
        card.addEventListener('click', function (e) {
            // Don't toggle if clicking inside the detail panel
            if (e.target.closest('.bounty-task-detail')) return;
            if (expandedTaskId === task.id) {
                expandedTaskId = null;
            } else {
                expandedTaskId = task.id;
            }
            renderTasks();
        });

        return card;
    }

    function renderChecklistPanel(task) {
        const items = task.checklist.items;
        const total = items.length;
        const checked = items.filter(i => i.checked).length;
        const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
        const fillClass = pct === 100 ? 'full' : pct >= 50 ? 'partial' : 'low';
        const fillColor = pct === 100 ? 'var(--accent-green, #10b981)' : pct >= 50 ? 'var(--accent-yellow, #f59e0b)' : 'var(--accent-red, #ef4444)';

        let itemsHtml = items.map((item, idx) => `
            <div class="bounty-checklist-item ${item.checked ? 'checked' : ''}"
                 data-task-id="${task.id}" data-item-key="${item.key}" data-item-idx="${idx}"
                 onclick="event.stopPropagation(); bountyToggleCheck('${task.id}', '${item.key}')">
                <div class="bounty-checklist-checkbox">
                    <span class="bounty-checklist-checkbox-icon">✓</span>
                </div>
                <span class="bounty-checklist-label">${escapeHtml(item.label)}</span>
                ${item.required ? '<span class="bounty-checklist-required">REQ</span>' : ''}
                ${item.value ? `<span class="bounty-checklist-value" title="${escapeHtml(item.value)}">${escapeHtml(item.value)}</span>` : ''}
            </div>
        `).join('');

        return `
            <div class="bounty-checklist-panel">
                <div class="bounty-checklist-header">
                    <div class="bounty-checklist-title">✅ Input Checklist</div>
                    <span class="bounty-checklist-save-badge" id="save-badge-${task.id}">Saved ✓</span>
                </div>
                <div class="bounty-checklist-items">
                    ${itemsHtml}
                </div>
                <div class="bounty-checklist-completion">
                    <div class="bounty-checklist-completion-bar">
                        <div class="bounty-checklist-completion-fill"
                             style="width:${pct}%; background:${fillColor}"></div>
                    </div>
                    <span class="bounty-checklist-completion-text" style="color:${fillColor}">${checked}/${total}</span>
                </div>
            </div>
        `;
    }

    function renderResultsPanel(task) {
        let contentHtml = '';

        if (task.generated_content) {
            const entries = Object.entries(task.generated_content);
            contentHtml = '<div class="bounty-results-content">';
            entries.forEach(([key, value]) => {
                const label = key.replace(/_/g, ' ');
                let displayVal;
                if (Array.isArray(value)) {
                    displayVal = value.join(', ');
                } else if (typeof value === 'number') {
                    displayVal = value % 1 !== 0 ? value.toFixed(4) : String(value);
                } else {
                    displayVal = String(value);
                }
                contentHtml += `
                    <div class="bounty-result-row">
                        <span class="bounty-result-key">${escapeHtml(label)}</span>
                        <span class="bounty-result-value">${highlightText(displayVal)}</span>
                    </div>
                `;
            });
            contentHtml += '</div>';
        } else {
            contentHtml = '<div class="bounty-no-content">No generated content yet. Task is pending or awaiting inputs.</div>';
        }

        // Warnings
        let warningsHtml = '';
        if (task.validation_warnings && task.validation_warnings.length > 0) {
            warningsHtml = `
                <div class="bounty-warnings">
                    <div class="bounty-warnings-title">⚠️ Validation Warnings (${task.validation_warnings.length})</div>
                    ${task.validation_warnings.map(w => `<div class="bounty-warning-item">${highlightText(w)}</div>`).join('')}
                </div>
            `;
        }

        return `
            <div class="bounty-results-panel">
                <div class="bounty-results-title">📋 Generated Content</div>
                ${contentHtml}
                ${warningsHtml}
            </div>
        `;
    }

    // ── Checklist Toggle ─────────────────────────────────────────────
    window.bountyToggleCheck = function (taskId, itemKey) {
        const task = allTasks.find(t => t.id === taskId);
        if (!task) return;

        const item = task.checklist.items.find(i => i.key === itemKey);
        if (!item) return;

        item.checked = !item.checked;

        // Update missing_data flag
        task.missing_data = task.checklist.items.some(i => i.required && !i.checked);

        // Save to server
        const saveItems = task.checklist.items.map(i => ({
            key: i.key,
            checked: i.checked,
            value: i.value,
        }));

        saveChecklist(taskId, saveItems).then(resp => {
            if (resp.success) {
                // Flash save badge
                const badge = document.getElementById(`save-badge-${taskId}`);
                if (badge) {
                    badge.classList.add('visible');
                    setTimeout(() => badge.classList.remove('visible'), 2000);
                }
            }
        });

        // Re-render
        renderTasks();
    };

    // ── Collapse ─────────────────────────────────────────────────────
    window.bountyCollapseTask = function (taskId) {
        expandedTaskId = null;
        renderTasks();
    };

    // ── Export ────────────────────────────────────────────────────────
    window.bountyExportTask = function (taskId) {
        const btn = document.querySelector(`#task-card-${taskId} .bounty-btn-export`);
        if (btn) {
            btn.classList.add('downloading');
            btn.textContent = '⏳ Generating…';
        }
        // Small delay for UX feedback, then trigger download
        setTimeout(() => {
            exportReviewPacket(taskId);
            if (btn) {
                setTimeout(() => {
                    btn.classList.remove('downloading');
                    btn.innerHTML = '📥 Export Review Packet';
                }, 1500);
            }
        }, 400);
    };

    // ── Text Highlighting ────────────────────────────────────────────
    function highlightText(text) {
        if (!currentSearch || !text) return escapeHtml(text || '');
        const escaped = escapeHtml(text);
        const searchEscaped = escapeRegex(currentSearch);
        const regex = new RegExp(`(${searchEscaped})`, 'gi');
        return escaped.replace(regex, '<mark class="bounty-highlight">$1</mark>');
    }

    // ── Utilities ────────────────────────────────────────────────────
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ── Boot ─────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);

})();
