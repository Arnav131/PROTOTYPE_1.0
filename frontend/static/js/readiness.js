// ===========================================================================
// RAKSHAK ROUTE READINESS ENGINE (CLIENT CONTROLLER)
// ===========================================================================
'use strict';

let casesData = [];
try {
    const rawContent = document.getElementById('readiness-cases-data').textContent;
    casesData = JSON.parse(rawContent) || [];
} catch (err) {
    console.error('Failed to parse initial cases data:', err);
    casesData = [];
}

let currentViewMode = 'single'; // 'single' or 'split'
let activeCaseCodeA = casesData.length > 0 ? casesData[0].case_code : null;
let activeCaseCodeB = casesData.length > 1 ? casesData[1].case_code : (casesData.length > 0 ? casesData[0].case_code : null);

// Store active inner card tab per case ('health' | 'checklist')
const cardTabState = {};

// ===========================================================================
// TRACK WORKSPACE ENGINE — pin / close track tabs, picker, drag & drop
// ===========================================================================
const WORKSPACE_STORAGE_KEY = 'rakshak_readiness_workspace_v1';

let workspaceOrder = [];       // ordered case_codes currently shown as tabs
let removedCodes = new Set();  // case_codes explicitly closed by the controller
let pickerAnchorEl = null;
let currentPickerFilter = '';

function saveWorkspaceState() {
    try {
        localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
            order: workspaceOrder,
            removed: Array.from(removedCodes)
        }));
    } catch (e) { /* storage unavailable — workspace stays session-only */ }
}

// Restore persisted workspace (closed tabs stay closed across reloads)
function loadWorkspaceState() {
    try {
        const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.order)) workspaceOrder = parsed.order.filter(x => typeof x === 'string');
        if (Array.isArray(parsed.removed)) removedCodes = new Set(parsed.removed);
    } catch (err) { /* corrupted state — fall back to defaults */ }
}

// Load immediately — must run before the ?case= deep-link handler mutates state
loadWorkspaceState();

// Keep workspace aligned with live server cases (poll-safe):
// prune deleted cases, auto-pin newly discovered routes unless closed before.
function syncWorkspaceWithCases() {
    const known = new Set(casesData.map(c => c.case_code));
    workspaceOrder = workspaceOrder.filter(code => known.has(code));
    casesData.forEach(c => {
        if (!workspaceOrder.includes(c.case_code) && !removedCodes.has(c.case_code)) {
            workspaceOrder.push(c.case_code);
        }
    });
    saveWorkspaceState();
}

function getWorkspaceCases() {
    return workspaceOrder
        .map(code => casesData.find(c => c.case_code === code))
        .filter(Boolean);
}

function updateDeepLink(caseCode) {
    try {
        const url = new URL(window.location.href);
        if (caseCode) url.searchParams.set('case', caseCode);
        else url.searchParams.delete('case');
        window.history.replaceState(null, '', url.toString());
    } catch (e) {}
}

// Browser-tab style close (×): hide this gate from the console
function removeCaseFromWorkspace(caseCode) {
    workspaceOrder = workspaceOrder.filter(code => code !== caseCode);
    removedCodes.add(caseCode);

    const remaining = getWorkspaceCases();
    if (activeCaseCodeA === caseCode) {
        activeCaseCodeA = remaining.length > 0 ? remaining[0].case_code : null;
        updateDeepLink(activeCaseCodeA);
    }
    if (activeCaseCodeB === caseCode) {
        const pool = remaining.filter(c => c.case_code !== activeCaseCodeA);
        activeCaseCodeB = pool.length > 0 ? pool[0].case_code : null;
    }

    saveWorkspaceState();
    renderTabs();
    renderMainView();
    if (isPickerOpen()) renderTrackPickerOptions(currentPickerFilter);
    showToast(`Gate ${caseCode} closed from readiness console.`, 'info');
}

// Pin a gate into the console (from picker popover or drag & drop)
function addCaseToWorkspace(caseCode, select = true) {
    if (!caseCode || !casesData.some(c => c.case_code === caseCode)) return;
    removedCodes.delete(caseCode);
    if (!workspaceOrder.includes(caseCode)) workspaceOrder.push(caseCode);
    saveWorkspaceState();

    if (select) {
        selectCase(caseCode, 'A');
    } else {
        renderTabs();
        renderMainView();
    }
    if (isPickerOpen()) renderTrackPickerOptions(currentPickerFilter);
}

// --------------------------- Track Picker Popover --------------------------
function isPickerOpen() {
    const pop = document.getElementById('track-picker-popover');
    return !!(pop && pop.classList.contains('open'));
}

function toggleTrackPicker(anchorEl) {
    const pop = document.getElementById('track-picker-popover');
    if (!pop) return;

    if (isPickerOpen() && pickerAnchorEl === anchorEl) {
        closeTrackPicker();
        return;
    }

    pickerAnchorEl = anchorEl || document.querySelector('.add-track-chip');
    const searchInput = document.getElementById('track-picker-search');
    if (searchInput) searchInput.value = '';
    currentPickerFilter = '';

    positionTrackPicker();
    renderTrackPickerOptions('');
    pop.classList.add('open');
    if (pickerAnchorEl) pickerAnchorEl.setAttribute('aria-expanded', 'true');
    setTimeout(() => { if (searchInput) searchInput.focus(); }, 40);
}

function positionTrackPicker() {
    const pop = document.getElementById('track-picker-popover');
    if (!pop || !pickerAnchorEl) return;
    const rect = pickerAnchorEl.getBoundingClientRect();
    const popWidth = Math.min(380, window.innerWidth - 24);
    let left = rect.left;
    if (left + popWidth > window.innerWidth - 12) left = window.innerWidth - popWidth - 12;
    const top = rect.bottom + 8;
    const availableHeight = window.innerHeight - top - 16;

    pop.style.left = `${Math.max(12, left)}px`;
    pop.style.top = `${top}px`;
    pop.style.width = `${popWidth}px`;
    pop.style.maxHeight = `${Math.max(220, Math.min(360, availableHeight))}px`;
}

function closeTrackPicker() {
    const pop = document.getElementById('track-picker-popover');
    if (pop) pop.classList.remove('open');
    if (pickerAnchorEl) pickerAnchorEl.setAttribute('aria-expanded', 'false');
    pickerAnchorEl = null;
}

function renderTrackPickerOptions(filterText) {
    const listEl = document.getElementById('track-picker-list');
    if (!listEl) return;

    const needle = (filterText || '').trim().toLowerCase();
    const available = casesData
        .filter(c => !workspaceOrder.includes(c.case_code))
        .filter(c => {
            if (!needle) return true;
            const haystack = `${c.title || ''} ${c.case_code || ''} ${c.train_number || ''} ${c.section_name || ''}`.toLowerCase();
            return haystack.includes(needle);
        });

    if (available.length === 0) {
        listEl.innerHTML = `
            <div class="picker-empty">
                All departure gates are already pinned to this console.<br>
                Close a tab above to free it up, or run a new simulated service.
            </div>`;
        return;
    }

    listEl.innerHTML = available.map(c => {
        let beaconClass = 'beacon-hold';
        if (c.readiness_decision === 'ready') beaconClass = 'beacon-go';
        else if (c.readiness_decision === 'conditionally_ready') beaconClass = 'beacon-caution';
        const primary = c.train_number || c.title || c.case_code;
        return `
            <button type="button" class="picker-option" onclick="addCaseToWorkspace('${escapeHtml(c.case_code)}', true)">
                <span class="status-beacon ${beaconClass}"></span>
                <span class="picker-option-text">
                    <span class="picker-option-title">${escapeHtml(primary)}</span>
                    <span class="picker-option-sub">${escapeHtml(c.case_code)} • ${escapeHtml(c.section_name || 'Route section N/A')}</span>
                </span>
            </button>
        `;
    }).join('');
}

// ------------------------------ Drag & Drop --------------------------------
function handleTabDragStart(ev, caseCode) {
    ev.dataTransfer.setData('text/plain', caseCode);
    ev.dataTransfer.effectAllowed = 'copy';
    document.body.classList.add('is-dragging');
    if (ev.currentTarget) ev.currentTarget.classList.add('dragging');
}

function handleTabDragEnd() {
    document.body.classList.remove('is-dragging');
    document.querySelectorAll('.train-tab-btn.dragging').forEach(el => el.classList.remove('dragging'));
    clearDropHighlights();
}

function clearDropHighlights() {
    document.querySelectorAll('.drop-ready').forEach(el => el.classList.remove('drop-ready'));
}

// One-time listeners for drop zones + picker dismissal
function bindWorkspaceGlobalListeners() {
    const main = document.getElementById('readiness-main-container');
    if (main) {
        main.addEventListener('dragover', ev => {
            if (!Array.from(ev.dataTransfer.types || []).includes('text/plain')) return;
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'copy';
            const card = ev.target.closest('.departure-card, .empty-state-card');
            if (!card) return;
            clearDropHighlights();
            card.classList.add('drop-ready');
        });
        main.addEventListener('dragleave', ev => {
            const card = ev.target.closest('.departure-card, .empty-state-card');
            if (card && !(ev.relatedTarget && card.contains(ev.relatedTarget))) {
                card.classList.remove('drop-ready');
            }
        });
        main.addEventListener('drop', ev => {
            const card = ev.target.closest('.departure-card, .empty-state-card');
            const caseCode = ev.dataTransfer ? ev.dataTransfer.getData('text/plain') : '';
            ev.preventDefault();
            clearDropHighlights();
            document.body.classList.remove('is-dragging');
            document.querySelectorAll('.train-tab-btn.dragging').forEach(el => el.classList.remove('dragging'));
            if (!card || !caseCode) return;
            const slot = card.dataset.slot === 'B' ? 'B' : 'A';
            addCaseToWorkspace(caseCode, false);
            selectCase(caseCode, slot);
            playClearanceChime('tick');
            const sideLabel = currentViewMode === 'split' ? (slot === 'A' ? 'LEFT' : 'RIGHT') : 'MAIN';
            showToast(`Track pinned to ${sideLabel} view: ${caseCode}`, 'success');
        });
    }

    // Close picker on outside click / Escape / resize re-anchor
    document.addEventListener('mousedown', ev => {
        if (!isPickerOpen()) return;
        if (ev.target.closest('#track-picker-popover')) return;
        if (ev.target.closest('[data-picker-toggle]')) return;
        closeTrackPicker();
    });
    document.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') closeTrackPicker();
    });
    window.addEventListener('resize', () => {
        if (isPickerOpen()) positionTrackPicker();
    });

    const searchInput = document.getElementById('track-picker-search');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            currentPickerFilter = this.value;
            renderTrackPickerOptions(currentPickerFilter);
        });
    }
}

// Track whether any modal is actively open to pause background polling
let isModalOpen = false;

// Check query param e.g. /readiness/?case=OPR-DEP-12951
(function initQueryParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const caseParam = urlParams.get('case');
    if (caseParam && casesData.some(c => c.case_code === caseParam)) {
        addCaseToWorkspace(caseParam, false); // deep-link always re-pins the gate
        activeCaseCodeA = caseParam;
    }
})();

// Real-Time System Clock
function updateClock() {
    const clockEl = document.getElementById('hud-clock');
    if (!clockEl) return;
    const now = new Date();
    clockEl.textContent = now.toTimeString().split(' ')[0] + ' IST';
}
setInterval(updateClock, 1000);
updateClock();

// CSRF Token Helper
function getCSRFToken() {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, 10) === ('csrftoken=')) {
                cookieValue = decodeURIComponent(cookie.substring(10));
                break;
            }
        }
    }
    return cookieValue;
}

// XSS Prevention: Sanitizer helper
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Audio Feedback Chime (Synthetic Web Audio API)
function playClearanceChime(type) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const audioCtx = new AudioContext();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === 'go') {
            osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
            osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12); // A5
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.45);
        } else if (type === 'tick') {
            osc.frequency.setValueAtTime(1046.5, audioCtx.currentTime); // C6
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.18);
        }
    } catch (e) {
        // Suppress audio policy errors
    }
}

// Toast Notification
let toastTimer = null;
function showToast(msg, type = 'info') {
    const toast = document.getElementById('readiness-toast');
    const toastText = document.getElementById('toast-text');
    const toastIcon = document.getElementById('toast-icon');
    if (!toast || !toastText) return;

    toastText.textContent = msg;
    toast.className = 'toast-msg';

    if (type === 'error') {
        toast.classList.add('toast-msg--error');
        toastIcon.innerHTML = '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>';
    } else if (type === 'success') {
        toast.classList.add('toast-msg--success');
        toastIcon.innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>';
    } else {
        toastIcon.innerHTML = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>';
    }

    toast.style.display = 'flex';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.style.display = 'none';
    }, 3800);
}

// Reusable Confirmation Modal
let confirmResolveCallback = null;
function showConfirmModal({ title, message, confirmText = 'Confirm', danger = false, onConfirm }) {
    const backdrop = document.getElementById('confirm-modal-backdrop');
    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-message');
    const proceedBtn = document.getElementById('btn-confirm-proceed');

    if (!backdrop || !titleEl || !msgEl || !proceedBtn) return;

    titleEl.textContent = title || 'Confirmation';
    msgEl.textContent = message || 'Are you sure you want to proceed?';
    proceedBtn.textContent = confirmText;
    proceedBtn.className = danger ? 'btn-danger' : 'btn-primary';

    confirmResolveCallback = onConfirm;
    proceedBtn.onclick = function() {
        closeConfirmModal();
        if (typeof confirmResolveCallback === 'function') {
            confirmResolveCallback();
        }
    };

    isModalOpen = true;
    backdrop.style.display = 'flex';
}

function closeConfirmModal() {
    const backdrop = document.getElementById('confirm-modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';
    confirmResolveCallback = null;
    checkAllModalsClosed();
}

// Reusable Prompt Modal
let promptResolveCallback = null;
function showPromptModal({ title, message, label, placeholder, defaultValue = '', onConfirm }) {
    const backdrop = document.getElementById('prompt-modal-backdrop');
    const titleEl = document.getElementById('prompt-modal-title');
    const msgEl = document.getElementById('prompt-modal-message');
    const labelEl = document.getElementById('prompt-modal-label');
    const inputEl = document.getElementById('prompt-modal-input');
    const submitBtn = document.getElementById('btn-prompt-submit');

    if (!backdrop || !titleEl || !msgEl || !inputEl || !submitBtn) return;

    titleEl.textContent = title || 'Input Required';
    msgEl.textContent = message || 'Please enter details:';
    if (labelEl) labelEl.textContent = label || 'Input';
    inputEl.placeholder = placeholder || 'Enter text...';
    inputEl.value = defaultValue;

    promptResolveCallback = onConfirm;
    submitBtn.onclick = function() {
        const val = inputEl.value.trim();
        if (!val) {
            inputEl.focus();
            return;
        }
        closePromptModal();
        if (typeof promptResolveCallback === 'function') {
            promptResolveCallback(val);
        }
    };

    isModalOpen = true;
    backdrop.style.display = 'flex';
    setTimeout(() => inputEl.focus(), 50);
}

function closePromptModal() {
    const backdrop = document.getElementById('prompt-modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';
    promptResolveCallback = null;
    checkAllModalsClosed();
}

function checkAllModalsClosed() {
    const worker = document.getElementById('worker-modal-backdrop');
    const confirmM = document.getElementById('confirm-modal-backdrop');
    const promptM = document.getElementById('prompt-modal-backdrop');
    const anyOpen = (worker && worker.style.display === 'flex') ||
                    (confirmM && confirmM.style.display === 'flex') ||
                    (promptM && promptM.style.display === 'flex');
    isModalOpen = anyOpen;
}

// View Mode (Single vs Split)
function setViewMode(mode) {
    currentViewMode = mode;
    const btnSingle = document.getElementById('btn-single-view');
    const btnSplit = document.getElementById('btn-split-view');
    if (btnSingle) btnSingle.classList.toggle('active', mode === 'single');
    if (btnSplit) btnSplit.classList.toggle('active', mode === 'split');

    const container = document.getElementById('readiness-main-container');
    if (container) {
        container.className = `readiness-container readiness-container--${mode}`;
    }
    renderMainView();
}

// Select Case & Deep-link URL push
function selectCase(caseCode, targetSlot = 'A') {
    if (targetSlot === 'A') {
        activeCaseCodeA = caseCode;
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('case', caseCode);
            window.history.replaceState(null, '', url.toString());
        } catch (e) {}
    } else {
        activeCaseCodeB = caseCode;
    }
    renderTabs();
    renderMainView();
}

// Card Inner Tab Switcher (Route Health vs Ground Patrol vs Checklist)
function setCardTab(caseCode, tabName) {
    cardTabState[caseCode] = tabName;
    const cardEl = document.getElementById(`card-${caseCode}`);
    if (!cardEl) return;

    // Toggle button active states
    const healthBtn = cardEl.querySelector('.card-tab-btn--health');
    const patrolBtn = cardEl.querySelector('.card-tab-btn--patrol');
    const checklistBtn = cardEl.querySelector('.card-tab-btn--checklist');
    const healthPane = cardEl.querySelector('.card-tab-pane--health');
    const patrolPane = cardEl.querySelector('.card-tab-pane--patrol');
    const checklistPane = cardEl.querySelector('.card-tab-pane--checklist');

    if (healthBtn) {
        healthBtn.classList.toggle('active', tabName === 'health');
        healthBtn.setAttribute('aria-selected', tabName === 'health' ? 'true' : 'false');
    }
    if (patrolBtn) {
        patrolBtn.classList.toggle('active', tabName === 'patrol');
        patrolBtn.setAttribute('aria-selected', tabName === 'patrol' ? 'true' : 'false');
    }
    if (checklistBtn) {
        checklistBtn.classList.toggle('active', tabName === 'checklist');
        checklistBtn.setAttribute('aria-selected', tabName === 'checklist' ? 'true' : 'false');
    }
    if (healthPane) healthPane.style.display = (tabName === 'health') ? 'flex' : 'none';
    if (patrolPane) patrolPane.style.display = (tabName === 'patrol') ? 'flex' : 'none';
    if (checklistPane) checklistPane.style.display = (tabName === 'checklist') ? 'flex' : 'none';
}

// Render Train Selection Tabs (workspace-managed, closable & draggable)
function renderTabs() {
    const bar = document.getElementById('case-selector-bar');
    if (!bar) return;

    if (casesData.length === 0) {
        bar.innerHTML = '<span style="color:#64748b; font-size:0.8rem; padding:0.4rem;">No departure cases loaded</span>';
        return;
    }

    const wsCases = getWorkspaceCases();

    const tabsHtml = wsCases.map(c => {
        let beaconClass = 'beacon-hold';
        if (c.readiness_decision === 'ready') beaconClass = 'beacon-go';
        else if (c.readiness_decision === 'conditionally_ready') beaconClass = 'beacon-caution';

        const isActive = (c.case_code === activeCaseCodeA);
        const label = c.train_number || c.case_code;

        return `
            <button class="train-tab-btn ${isActive ? 'active' : ''}"
                    role="tab"
                    aria-selected="${isActive ? 'true' : 'false'}"
                    tabindex="0"
                    draggable="true"
                    title="${escapeHtml(c.title || label)} — drag onto a split pane or click to inspect"
                    ondragstart="handleTabDragStart(event, '${escapeHtml(c.case_code)}')"
                    ondragend="handleTabDragEnd()"
                    onclick="selectCase('${escapeHtml(c.case_code)}', 'A')">
                <span class="status-beacon ${beaconClass}"></span>
                <span>${escapeHtml(label)}</span>
                <span class="tab-close-x" role="button" tabindex="-1"
                      aria-label="Close ${escapeHtml(label)} from readiness console"
                      onclick="event.stopPropagation(); removeCaseFromWorkspace('${escapeHtml(c.case_code)}')">&times;</span>
            </button>
        `;
    }).join('');

    bar.innerHTML = tabsHtml + `
        <button type="button" class="add-track-chip" data-picker-toggle="true"
                aria-haspopup="dialog" aria-expanded="false"
                onclick="toggleTrackPicker(this)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Add Track
        </button>
    `;
}

// Department Info & Icon helper
function getDepartmentInfo(item) {
    const code = (item.item_code || '').toUpperCase();
    const cat = (item.category || '').toUpperCase();
    
    if (code.includes('SIGNAL') || code.includes('INTERLOCK') || cat === 'SIGNAL') {
        return {
            deptCode: 'S&T',
            deptName: 'Signalling & Interlocking',
            badgeColor: '#06b6d4',
            bgColor: 'rgba(6, 182, 212, 0.12)',
            defaultRole: 'Chief Signal Inspector (Section Interlocking)',
            defaultNote: 'Electronic point machine and route locking interlock confirmed normal.',
            icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="6" r="3"></circle><circle cx="12" cy="12" r="3"></circle><circle cx="12" cy="18" r="3"></circle></svg>'
        };
    }
    if (code.includes('OHE') || code.includes('POWER') || cat === 'OHE') {
        return {
            deptCode: 'TRD',
            deptName: '25kV Traction Power (TRD)',
            badgeColor: '#f59e0b',
            bgColor: 'rgba(245, 158, 11, 0.12)',
            defaultRole: 'Traction Power Controller (25kV OHE)',
            defaultNote: 'Traction power sub-station and 25kV OHE feeder energized and synchronized.',
            icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>'
        };
    }
    if (code.includes('PW') || code.includes('CREW') || code.includes('TRACK') || cat === 'CIVIL' || cat === 'SAFETY') {
        return {
            deptCode: 'ENGG',
            deptName: 'Permanent Way (Civil P-Way)',
            badgeColor: '#a855f7',
            bgColor: 'rgba(168, 85, 247, 0.12)',
            defaultRole: 'Section Engineer (P-Way / Ultrasonic)',
            defaultNote: 'Track alignment, ultrasonic weld integrity, and crew clearance verified.',
            icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>'
        };
    }
    if (code.includes('KAVACH') || code.includes('ATP') || code.includes('BRAKE') || code.includes('LOCO')) {
        return {
            deptCode: 'ATP',
            deptName: 'Kavach Cab ATP & Rolling Stock',
            badgeColor: '#10b981',
            bgColor: 'rgba(16, 185, 129, 0.12)',
            defaultRole: 'Loco Pilot In-Charge (Kavach Cab ATP)',
            defaultNote: 'Cab signalling ATP health nominal. Brake pipe pressure verified 5.0 kg/cm².',
            icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>'
        };
    }
    return {
        deptCode: 'OPTG',
        deptName: 'Platform & Traffic Operations',
        badgeColor: '#38bdf8',
        bgColor: 'rgba(56, 189, 248, 0.12)',
        defaultRole: 'Station Master (NDLS Platform Control)',
        defaultNote: 'Platform dispatch schedule window clear. Line authority granted.',
        icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
    };
}

// Pillar SVG Icon helper
function getPillarSvg(item) {
    const dept = getDepartmentInfo(item);
    return `<span class="pillar-icon-svg" style="color:${dept.badgeColor};">${dept.icon}</span>`;
}

// Authorization state definitions. Decision codes + speeds match the existing
// backend contract exactly (GO=130, CAUTION=30, HOLD=0) — unchanged.
const AUTH_STATES = {
    go: {
        decision: 'ready', speed: 130, cls: 'go',
        label: 'CLEARED FOR DEPARTURE',
        detail: 'Green signal cleared • Maximum permitted speed 130 km/h.',
        action: 'AUTHORIZE DEPARTURE',
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
    },
    caution: {
        decision: 'conditionally_ready', speed: 30, cls: 'caution',
        label: 'CAUTION DEPARTURE',
        detail: 'Turnout / restriction departure • Speed limited to 30 km/h.',
        action: 'AUTHORIZE CAUTION',
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    },
    hold: {
        decision: 'not_ready', speed: 0, cls: 'hold',
        label: 'HOLD AT PLATFORM',
        detail: 'Red signal locked • Departure held at 0 km/h.',
        action: 'ENFORCE HOLD',
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    },
};

// Builds the Controller Authorization section: the current state is the
// dominant panel with a primary action; the two other states remain fully
// reachable as compact "alternative" buttons. All buttons call the unchanged
// submitDecision() so the existing safety-gate / override flow is preserved.
function renderAuthorizationHtml(c, currentKey) {
    const order = ['go', 'caution', 'hold'];
    const key = order.includes(currentKey) ? currentKey : 'hold';
    const primary = AUTH_STATES[key];
    const code = escapeHtml(c.case_code);

    const altButtons = order.filter(k => k !== key).map(k => {
        const s = AUTH_STATES[k];
        return `
            <button type="button" class="auth-alt-btn auth-alt-btn--${s.cls}"
                    onclick="submitDecision('${code}', '${s.decision}', ${s.speed})">
                <span class="auth-alt-icon">${s.icon}</span>
                <span class="auth-alt-text">${s.label}</span>
                <span class="auth-alt-speed">${s.speed} km/h</span>
            </button>
        `;
    }).join('');

    return `
        <div class="controller-switchboard">
            <div class="switchboard-title">
                <span>Controller Authorization</span>
                ${c.is_overridden ? '<span class="tick-badge tick-badge--failed">OVERRIDE ENFORCED</span>' : ''}
            </div>

            <div class="auth-primary auth-primary--${primary.cls}">
                <div class="auth-primary-info">
                    <div class="auth-primary-state">
                        <span class="auth-primary-icon">${primary.icon}</span>
                        <span>${primary.label}</span>
                    </div>
                    <div class="auth-primary-detail">${primary.detail}</div>
                </div>
                <button type="button" class="auth-primary-btn auth-primary-btn--${primary.cls}"
                        onclick="submitDecision('${code}', '${primary.decision}', ${primary.speed})">
                    ${primary.action}
                </button>
            </div>

            <div class="auth-alt-label">Alternative authorizations</div>
            <div class="auth-alt-group">
                ${altButtons}
            </div>
        </div>
    `;
}

// Render Single Card
function renderCaseCard(c, slot = 'A') {
    if (!c) {
        return `
            <div class="empty-state-card">
                <svg class="empty-state-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <div class="empty-state-title">No Departure Gate Selected</div>
                <div>Select an active train from the tabs above to view readiness status.</div>
            </div>
        `;
    }

    // Current operational state → drives the dominant state card AND the
    // controller authorization panel. Derived strictly from readiness_decision
    // (the existing backend field); no state is hardcoded.
    let clearanceClass = 'clearance-nogo';
    let stateKey = 'hold';                 // 'go' | 'caution' | 'hold'
    let stateLabel = 'HOLD AT PLATFORM';
    let stateSpeed = (c.cleared_speed_kmph != null ? c.cleared_speed_kmph : 0);
    let iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';

    if (c.readiness_decision === 'ready') {
        clearanceClass = 'clearance-go';
        stateKey = 'go';
        stateLabel = 'CLEARED FOR DEPARTURE';
        stateSpeed = c.cleared_speed_kmph || 130;
        iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else if (c.readiness_decision === 'conditionally_ready') {
        clearanceClass = 'clearance-caution';
        stateKey = 'caution';
        stateLabel = 'CAUTION DEPARTURE';
        stateSpeed = c.cleared_speed_kmph || 30;
        iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    }

    const t = c.telemetry || {};
    const activeTab = cardTabState[c.case_code] || 'health';

    // Checklist HTML with Department Badges and Digital Seals
    const checklistItems = c.checklist || [];
    let passedCount = 0;
    const checklistHtml = checklistItems.map(item => {
        const dept = getDepartmentInfo(item);
        let tickBadge = `<span class="tick-badge tick-badge--pending"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> PENDING</span>`;
        let cardModClass = '';
        let digitalSealHtml = '';

        if (item.status === 'passed') {
            passedCount++;
            tickBadge = `<span class="tick-badge tick-badge--passed"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> VERIFIED (PASSED)</span>`;
            cardModClass = 'flightdeck-checklist-card--passed';
            digitalSealHtml = `
                <div class="digital-verification-stamp">
                    <div style="display:flex; align-items:center; gap:0.4rem; color:var(--fd-green); font-weight:700; font-size:0.75rem;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>DIGITALLY SEALED</span>
                    </div>
                    <div style="font-size:0.72rem; color:#cbd5e1;">
                        <strong>${escapeHtml(item.sign_off_designation || item.signed_off_by)}</strong> • ${escapeHtml(item.signed_off_at || 'Recently Synced')}
                    </div>
                    ${item.sign_off_comments ? `<div style="font-size:0.71rem; color:#94a3b8; font-style:italic; line-height:1.35; margin-top:0.15rem;">"${escapeHtml(item.sign_off_comments)}"</div>` : ''}
                </div>
            `;
        } else if (item.status === 'failed') {
            tickBadge = `<span class="tick-badge tick-badge--failed"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> FAILED / HOLD</span>`;
            cardModClass = 'flightdeck-checklist-card--failed';
            digitalSealHtml = `
                <div class="digital-verification-stamp digital-verification-stamp--failed">
                    <div style="display:flex; align-items:center; gap:0.4rem; color:var(--fd-red); font-weight:700; font-size:0.75rem;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>HOLD RESTRICTION LOGGED</span>
                    </div>
                    <div style="font-size:0.72rem; color:#fca5a5;">
                        <strong>${escapeHtml(item.sign_off_designation || item.signed_off_by)}</strong> • ${escapeHtml(item.signed_off_at || 'Recently')}
                    </div>
                    ${item.sign_off_comments ? `<div style="font-size:0.71rem; color:#f87171; font-style:italic; line-height:1.35; margin-top:0.15rem;">"${escapeHtml(item.sign_off_comments)}"</div>` : ''}
                </div>
            `;
        } else {
            digitalSealHtml = `
                <div style="font-size:0.72rem; color:#64748b; display:flex; align-items:center; gap:0.35rem; margin-top:0.25rem;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <span>Awaiting field inspector physical verification & sign-off</span>
                </div>
            `;
        }

        return `
            <div class="flightdeck-checklist-card ${cardModClass}">
                <div class="checklist-main-info">
                    <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                        <span style="font-family:'JetBrains Mono', monospace; font-size:0.68rem; font-weight:700; color:${dept.badgeColor}; background:${dept.bgColor}; padding:0.12rem 0.45rem; border-radius:4px; letter-spacing:0.04em;">
                            ${dept.deptCode} • ${dept.deptName}
                        </span>
                        <span style="font-family:'JetBrains Mono', monospace; font-size:0.68rem; color:#64748b;">
                            ITEM #${item.sequence || 1}
                        </span>
                    </div>
                    <div class="checklist-pillar-title" style="margin-top:0.3rem;">
                        <span style="color:${dept.badgeColor}; display:inline-flex; align-items:center;">${dept.icon}</span>
                        <span>${escapeHtml(item.title)}</span>
                    </div>
                    ${digitalSealHtml}
                </div>
                <div class="checklist-actions-wrap">
                    ${tickBadge}
                    <button class="btn-worker-sign" onclick="openWorkerModalWithItem('${escapeHtml(c.case_code)}', ${item.id})" aria-label="Verify ${escapeHtml(item.title)}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        ${item.status === 'passed' ? 'Re-verify' : 'Sign-off'}
                    </button>
                </div>
            </div>
        `;
    }).join('') || '<div style="color:#64748b; font-size:0.85rem; padding:0.5rem 0;">No checklist items configured.</div>';

    // Ground Patrol HTML
    const p = c.latest_patrol;
    let patrolPaneHtml = '';
    let patrolTabBadge = '';
    if (p) {
        const pScore = p.composite_score !== null ? `${p.composite_score}%` : 'N/A';
        const pScoreColor = p.composite_score >= 80 ? 'var(--fd-green)' : (p.composite_score >= 60 ? 'var(--fd-amber)' : 'var(--fd-red)');
        
        let pStatusBadge = `<span class="tick-badge tick-badge--pending">PENDING REVIEW</span>`;
        if (p.admin_decision === 'cleared') {
            pStatusBadge = `<span class="tick-badge tick-badge--passed"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> CLEARED</span>`;
            patrolTabBadge = `<span style="font-family:'JetBrains Mono'; color:var(--fd-green); font-size:0.72rem; margin-left:0.3rem;">${pScore}</span>`;
        } else if (p.admin_decision === 'blocked' || (p.composite_score !== null && p.composite_score < 50)) {
            pStatusBadge = `<span class="tick-badge tick-badge--failed"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> DEFECT / HOLD</span>`;
            patrolTabBadge = `<span style="font-family:'JetBrains Mono'; color:var(--fd-red); font-size:0.72rem; margin-left:0.3rem;">⚠ ${pScore}</span>`;
        } else {
            patrolTabBadge = `<span style="font-family:'JetBrains Mono'; color:var(--fd-cyan); font-size:0.72rem; margin-left:0.3rem;">${pScore}</span>`;
        }

        const categoryPillsHtml = (p.category_ratings || []).map(cat => {
            const r = cat.rating;
            const rColor = r >= 4 ? 'var(--fd-green)' : (r === 3 ? 'var(--fd-amber)' : 'var(--fd-red)');
            const rBg = r >= 4 ? 'rgba(16, 185, 129, 0.12)' : (r === 3 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.15)');
            return `
                <div class="patrol-cat-card" style="background: rgba(0,0,0,0.25); border: 1px solid var(--fd-border-subtle); border-radius: 8px; padding: 0.65rem 0.85rem; display: flex; flex-direction: column; gap: 0.35rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.8rem; font-weight: 700; color: #f1f5f9;">${escapeHtml(cat.category_display)}</span>
                        <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; font-weight: 700; color: ${rColor}; background: ${rBg}; padding: 0.15rem 0.45rem; border-radius: 4px;">${r}/5 • ${escapeHtml(cat.rating_label)}</span>
                    </div>
                    ${cat.notes ? `<div style="font-size: 0.72rem; color: #94a3b8; line-height: 1.35;">${escapeHtml(cat.notes)}</div>` : ''}
                </div>
            `;
        }).join('');

        patrolPaneHtml = `
            <div class="card-tab-pane card-tab-pane--patrol" style="display: ${activeTab === 'patrol' ? 'flex' : 'none'};">
                <div class="card-section-header">
                    <div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
                        <span>Ground Track Inspection (${escapeHtml(p.patrol_code)})</span>
                        ${pStatusBadge}
                        ${p.conflict_detected ? '<span class="tick-badge tick-badge--failed" style="color:var(--fd-amber);">⚠ WORKER/IOT CONFLICT</span>' : ''}
                    </div>
                    <span style="font-family:'JetBrains Mono'; font-size:0.825rem; color:${pScoreColor}; font-weight:700;">Ground Safety Score: ${pScore}</span>
                </div>
                
                <div style="background: rgba(255, 255, 255, 0.035); border: 1px solid var(--fd-border-subtle); border-radius: 8px; padding: 0.65rem 0.95rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; font-size: 0.78rem; color: #94a3b8;">
                    <div>
                        <strong style="color:#f8fafc;">Inspector:</strong> ${escapeHtml(p.worker_name || p.worker)} • 
                        <strong style="color:#f8fafc;">Section:</strong> ${escapeHtml(p.section_name)} • 
                        <strong style="color:#f8fafc;">Completed:</strong> ${escapeHtml(p.patrol_completed_at || 'Recently')}
                    </div>
                    <div>
                        <span style="color:#38bdf8;">Worker Weight: ${(p.worker_weight*100).toFixed(0)}%</span> | 
                        <span style="color:#38bdf8;">IoT Weight: ${(p.iot_weight*100).toFixed(0)}%</span>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.65rem;">
                    ${categoryPillsHtml}
                </div>
            </div>
        `;
    } else {
        patrolTabBadge = `<span style="font-size:0.72rem; color:#64748b; margin-left:0.3rem;">(Uninspected)</span>`;
        patrolPaneHtml = `
            <div class="card-tab-pane card-tab-pane--patrol" style="display: ${activeTab === 'patrol' ? 'flex' : 'none'};">
                <div class="card-section-header">
                    <span>Physical Ground Patrol Report</span>
                    <span style="font-size:0.75rem; color:var(--fd-amber);">Pending Field Inspection</span>
                </div>
                <div style="background: rgba(255, 255, 255, 0.025); border: 1px dashed rgba(255,255,255,0.12); border-radius: 8px; padding: 1.5rem; text-align: center; color: #94a3b8; display: flex; flex-direction: column; align-items: center; gap: 0.65rem;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.8"><path d="M16 3h5v5M8 3H3v5M3 16v5h5M16 21h5v-5"></path><circle cx="12" cy="12" r="4"></circle></svg>
                    <div>No physical ground inspection recorded yet on corridor <strong>${escapeHtml(c.section_name)}</strong>.</div>
                </div>
            </div>
        `;
    }

    // Audit Log HTML
    const auditRecords = c.audit_trail || [];
    const auditHtml = auditRecords.map(a => `
        <div class="audit-row">
            <span>[${escapeHtml(a.time_str)}]</span> <strong>${escapeHtml(a.actor_identifier)}:</strong> ${escapeHtml(a.notes)}
        </div>
    `).join('') || '<div class="audit-row">No clearance events recorded yet.</div>';

    // Seal Badge in Header
    let sealBadgeHtml = '';
    if (c.readiness_decision && c.readiness_decision !== 'pending') {
        const decisionText = c.readiness_decision === 'ready' ? 'GO' : (c.readiness_decision === 'conditionally_ready' ? 'CAUTION' : 'HOLD');
        const actorName = c.decision_taken_by || 'Operations Controller';
        sealBadgeHtml = `
            <span class="seal-header-badge seal-header-badge--${escapeHtml(c.readiness_decision)}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                SEALED • ${decisionText} • ${c.cleared_speed_kmph} KM/H • ${escapeHtml(actorName)}
            </span>
        `;
    }

    const dropHintLabel = (currentViewMode === 'split')
        ? (slot === 'A' ? 'DROP TO PIN LEFT' : 'DROP TO PIN RIGHT')
        : 'DROP TO OPEN';

    // ---- Verification strip (compact operational pre-condition checklist) ----
    // Uses the real telemetry fields from the backend evaluation. Each check is
    // independent so an invalid condition flips only its own chip.
    const totalCount = checklistItems.length;
    const telemetryValid = !!t.all_telemetry_passed;
    const signoffsComplete = (passedCount === totalCount && totalCount > 0);
    const alertsClear = (t.active_critical_alerts || 0) === 0;
    const activeAlerts = (t.active_critical_alerts != null ? t.active_critical_alerts : 0);
    const isInterlockReady = signoffsComplete && telemetryValid && alertsClear;

    const verifyChip = (ok, okLabel, badLabel) => `
        <span class="verify-chip ${ok ? 'verify-chip--ok' : 'verify-chip--bad'}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                ${ok ? '<polyline points="20 6 9 17 4 12"></polyline>' : '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>'}
            </svg>
            <span>${ok ? okLabel : badLabel}</span>
        </span>`;

    const gateStatusHtml = `
        <div class="verification-strip" role="group" aria-label="Departure pre-conditions">
            ${verifyChip(isInterlockReady, 'Interlock Active', 'Interlock Locked')}
            ${verifyChip(isInterlockReady, 'Signal Authorized', 'Signal Locked')}
            ${verifyChip(telemetryValid, 'Telemetry Valid', 'Telemetry Out of Envelope')}
            ${verifyChip(signoffsComplete, `Field Sign-offs ${passedCount}/${totalCount}`, `Field Sign-offs ${passedCount}/${totalCount}`)}
            ${verifyChip(alertsClear, 'Alerts 0', `Alerts ${activeAlerts}`)}
        </div>
    `;

    return `
        <div class="departure-card" id="card-${escapeHtml(c.case_code)}" data-slot="${slot}">
            <span class="drop-hint-badge">${dropHintLabel}</span>
            <div class="departure-header">
                <div class="train-meta">
                    <div class="badge-strip">
                        <span class="case-id-badge">${escapeHtml(c.case_code)}</span>
                        ${c.train_number ? `<span class="train-num-badge">${escapeHtml(c.train_number)}</span>` : ''}
                        <span class="origin-badge">ORIGIN: PLATFORM 1 (NDLS)</span>
                        ${sealBadgeHtml}
                    </div>
                    <h2 class="train-title">${escapeHtml(c.title || 'Train Departure Gate')}</h2>
                    <div class="train-subtitle">Assigned Route: ${escapeHtml(c.section_name || 'Standard Main Line')} • Dispatch Unit: Northern Central Corridor</div>
                </div>
                <div class="master-clearance-light route-state-card ${clearanceClass}">
                    <div class="route-state-top">
                        ${iconSvg}
                        <span class="route-state-label">${stateLabel}</span>
                    </div>
                    <div class="route-state-speed">
                        <b>${stateSpeed}</b><span>km/h max</span>
                    </div>
                </div>
            </div>

            <!-- Card Section Switcher (Route Health | Ground Patrol | Checklist) -->
            <div class="card-tabs-bar" role="tablist" aria-label="Section View">
                <button class="card-tab-btn card-tab-btn--health ${activeTab === 'health' ? 'active' : ''}"
                        role="tab"
                        aria-selected="${activeTab === 'health' ? 'true' : 'false'}"
                        onclick="setCardTab('${escapeHtml(c.case_code)}', 'health')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                    Route Health
                </button>
                <button class="card-tab-btn card-tab-btn--patrol ${activeTab === 'patrol' ? 'active' : ''}"
                        role="tab"
                        aria-selected="${activeTab === 'patrol' ? 'true' : 'false'}"
                        onclick="setCardTab('${escapeHtml(c.case_code)}', 'patrol')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M8 3H3v5M3 16v5h5M16 21h5v-5"></path><circle cx="12" cy="12" r="4"></circle></svg>
                    Ground Patrol ${patrolTabBadge}
                </button>
                <button class="card-tab-btn card-tab-btn--checklist ${activeTab === 'checklist' ? 'active' : ''}"
                        role="tab"
                        aria-selected="${activeTab === 'checklist' ? 'true' : 'false'}"
                        onclick="setCardTab('${escapeHtml(c.case_code)}', 'checklist')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                    Checklist (${passedCount}/${totalCount})
                </button>
            </div>

            <!-- Tab Pane 1: Route Health (Telemetry) -->
            <div class="card-tab-pane card-tab-pane--health" style="display: ${activeTab === 'health' ? 'flex' : 'none'};">
                <div class="card-section-header">
                    <span>Automated Route Health Telemetry</span>
                    <span style="font-family:'JetBrains Mono'; font-size:0.825rem; color:var(--fd-cyan);">${t.composite_score !== undefined && t.composite_score !== null ? 'Composite Safety Score: ' + t.composite_score + '%' : 'Telemetry Status: Active'}</span>
                </div>
                <div class="telemetry-radar-grid">
                    <div class="telemetry-cell">
                        <span class="telemetry-cell-label">Rail Temperature</span>
                        <span class="telemetry-cell-val" style="color:${t.temperature_passed ? 'var(--fd-green)' : 'var(--fd-red)'}">${t.temperature_celsius !== undefined && t.temperature_celsius !== null ? t.temperature_celsius + '°C' : '--'}</span>
                        <span class="telemetry-cell-status ${t.temperature_passed ? 'text-pass' : 'text-fail'}">
                            ${t.temperature_passed ? '✓ 15°C - 45°C Nominal' : '⚠ Out of Envelope'}
                        </span>
                    </div>
                    <div class="telemetry-cell">
                        <span class="telemetry-cell-label">Track Vibration RMS</span>
                        <span class="telemetry-cell-val" style="color:${t.vibration_passed ? 'var(--fd-green)' : 'var(--fd-red)'}">${t.vibration_rms !== undefined && t.vibration_rms !== null ? t.vibration_rms + ' mm/s' : '--'}</span>
                        <span class="telemetry-cell-status ${t.vibration_passed ? 'text-pass' : 'text-fail'}">
                            ${t.vibration_passed ? '✓ Safe &lt; 2.50 mm/s' : '⚠ High Vibration'}
                        </span>
                    </div>
                    <div class="telemetry-cell">
                        <span class="telemetry-cell-label">AI Defect Risk</span>
                        <span class="telemetry-cell-val" style="color:${t.ai_risk_passed ? 'var(--fd-green)' : 'var(--fd-red)'}">${t.ai_risk_score !== undefined && t.ai_risk_score !== null ? (t.ai_risk_score <= 1.0 ? Math.round(t.ai_risk_score * 100) : Math.round(t.ai_risk_score)) + '%' : '--'}</span>
                        <span class="telemetry-cell-status ${t.ai_risk_passed ? 'text-pass' : 'text-fail'}">
                            ${t.ai_risk_passed ? '✓ Nominal &lt; 25%' : '⚠ Defect Alert'}
                        </span>
                    </div>
                    <div class="telemetry-cell">
                        <span class="telemetry-cell-label">Critical Alerts</span>
                        <span class="telemetry-cell-val" style="color:${t.alerts_passed ? 'var(--fd-green)' : 'var(--fd-red)'}">${t.active_critical_alerts !== undefined ? t.active_critical_alerts : 0}</span>
                        <span class="telemetry-cell-status ${t.alerts_passed ? 'text-pass' : 'text-fail'}">
                            ${t.alerts_passed ? '✓ Zero Critical Alerts' : '⚠ Blocked by Alerts'}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Tab Pane 2: Ground Patrol Inspection -->
            ${patrolPaneHtml}

            <!-- Tab Pane 3: Checklist -->
            <div class="card-tab-pane card-tab-pane--checklist" style="display: ${activeTab === 'checklist' ? 'flex' : 'none'};">
                <div class="card-section-header">
                    <span>Multi-Department Pre-Departure Verification Matrix</span>
                    <span style="font-size:0.75rem; color:#94a3b8;">${passedCount}/${totalCount} Verified • Field Synced</span>
                </div>
                <div class="checklist-list">
                    ${checklistHtml}
                </div>
            </div>

            <!-- Interlocking Pre-Condition Status Bar -->
            ${gateStatusHtml}

            <!-- Controller Authorization — current state dominant, others as alternatives -->
            ${renderAuthorizationHtml(c, stateKey)}

            <!-- Collapsible Audit Log (<details>) -->
            <details class="audit-details">
                <summary class="audit-summary">
                    <svg class="audit-summary-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
                    <span>Audit Log (${auditRecords.length} records)</span>
                </summary>
                <div class="flightdeck-audit-trail">
                    ${auditHtml}
                </div>
            </details>
        </div>
    `;
}

// Render Main View (Single vs Split) — driven by the workspace tab list
function renderMainView() {
    const container = document.getElementById('readiness-main-container');
    if (!container) return;

    if (casesData.length === 0) {
        container.innerHTML = `
            <div class="empty-state-card">
                <svg class="empty-state-icon" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                </svg>
                <h3 class="empty-state-title">No Readiness Cases Found</h3>
                <p style="margin:0; font-size:0.9rem;">There are no active departure gates assigned for today's schedule.</p>
                <a href="/simulation/" class="btn-primary" style="text-decoration:none; margin-top:0.35rem;">Run a Live Simulation to create one</a>
            </div>
        `;
        return;
    }

    const wsCases = getWorkspaceCases();

    // Controller closed every track — offer a way back in
    if (wsCases.length === 0) {
        container.innerHTML = `
            <div class="empty-state-card">
                <svg class="empty-state-icon" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <h3 class="empty-state-title">All Tracks Closed</h3>
                <p style="margin:0; font-size:0.9rem;">Every departure gate has been closed from this console. Pin tracks back to inspect their route health &amp; clearance status.</p>
                <button type="button" class="btn-primary" data-picker-toggle="true" onclick="toggleTrackPicker(this)" style="margin-top:0.35rem;">
                    + Add Track / Route
                </button>
            </div>
        `;
        return;
    }

    const caseA = wsCases.find(c => c.case_code === activeCaseCodeA) || wsCases[0];
    activeCaseCodeA = caseA.case_code;

    if (currentViewMode === 'single') {
        container.innerHTML = renderCaseCard(caseA, 'A');
        return;
    }

    const caseB = wsCases.find(c => c.case_code === activeCaseCodeB && c.case_code !== caseA.case_code)
               || wsCases.find(c => c.case_code !== caseA.case_code)
               || caseA;
    activeCaseCodeB = caseB.case_code;

    container.innerHTML = `
        ${renderCaseCard(caseA, 'A')}
        ${renderCaseCard(caseB, 'B')}
    `;
}

// Controller Decision Flow
async function submitDecision(caseCode, decision, speedKmph) {
    try {
        const resp = await fetch(`/readiness/api/cases/${encodeURIComponent(caseCode)}/decide/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken(),
            },
            body: JSON.stringify({
                decision: decision,
                speed_kmph: speedKmph,
                notes: `Route readiness clearance ${decision.toUpperCase()} authorized via Operations Control.`,
                is_override: false
            })
        });

        const data = await resp.json();
        if (data.status === 'success') {
            if (decision === 'ready') playClearanceChime('go');
            updateLocalCase(data.case);
            showToast(`✓ Gate ${caseCode}: Decision ${decision.toUpperCase()} authorized!`, 'success');
        } else if (data.requires_override) {
            showConfirmModal({
                title: 'Safety Interlock Override Required',
                message: `Safety check failed:\n${data.message}\n\nDo you want to log a mandatory Controller Safety Override?`,
                confirmText: 'Proceed to Override',
                danger: true,
                onConfirm: () => {
                    promptForOverrideReason(caseCode, decision, speedKmph);
                }
            });
        } else {
            showToast('Error: ' + (data.message || 'Failed to submit decision'), 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Network error during decision submission', 'error');
    }
}

function promptForOverrideReason(caseCode, decision, speedKmph) {
    showPromptModal({
        title: 'Controller Safety Override',
        message: 'Mandatory justification is required for safety override audit trail:',
        label: 'Override Justification',
        placeholder: 'e.g., Physical track inspection verified by Senior Safety Officer.',
        onConfirm: (reason) => {
            submitOverride(caseCode, decision, speedKmph, reason);
        }
    });
}

async function submitOverride(caseCode, decision, speedKmph, reason) {
    try {
        const resp = await fetch(`/readiness/api/cases/${encodeURIComponent(caseCode)}/decide/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken(),
            },
            body: JSON.stringify({
                decision: decision,
                speed_kmph: speedKmph,
                notes: `CONTROLLER OVERRIDE: ${reason}`,
                is_override: true,
                override_reason: reason
            })
        });

        const data = await resp.json();
        if (data.status === 'success') {
            if (decision === 'ready') playClearanceChime('go');
            updateLocalCase(data.case);
            showToast(`✓ Gate ${caseCode}: Override recorded!`, 'success');
        } else {
            showToast('Override Error: ' + (data.message || 'Failed to log override'), 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Network error during override submission', 'error');
    }
}

// Modal Helpers
function openWorkerModal() {
    const backdrop = document.getElementById('worker-modal-backdrop');
    if (!backdrop) return;

    const caseSelect = document.getElementById('modal-select-case');
    if (caseSelect) {
        caseSelect.innerHTML = casesData.map(c => `
            <option value="${escapeHtml(c.case_code)}" ${c.case_code === activeCaseCodeA ? 'selected' : ''}>
                ${escapeHtml(c.case_code)} — ${escapeHtml(c.train_number || c.title)}
            </option>
        `).join('');
    }

    populateModalChecklistOptions();
    isModalOpen = true;
    backdrop.style.display = 'flex';
}

function openWorkerModalWithItem(caseCode, itemId) {
    openWorkerModal();
    const caseSelect = document.getElementById('modal-select-case');
    if (caseSelect) {
        caseSelect.value = caseCode;
        populateModalChecklistOptions();
    }
    const itemSelect = document.getElementById('modal-select-item');
    if (itemSelect) {
        itemSelect.value = itemId;
    }

    // Auto-select domain accurate role and note
    const targetCase = casesData.find(c => c.case_code === caseCode);
    if (targetCase && targetCase.checklist) {
        const item = targetCase.checklist.find(it => String(it.id) === String(itemId));
        if (item) {
            const dept = getDepartmentInfo(item);
            const roleSelect = document.getElementById('modal-worker-role');
            const notesInput = document.getElementById('modal-worker-notes');
            if (roleSelect && dept.defaultRole) {
                let found = false;
                for (let opt of roleSelect.options) {
                    if (opt.value === dept.defaultRole) {
                        opt.selected = true;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    const newOpt = new Option(dept.defaultRole, dept.defaultRole, true, true);
                    roleSelect.add(newOpt);
                }
            }
            if (notesInput) {
                notesInput.value = item.sign_off_comments || dept.defaultNote;
            }
        }
    }
}

function closeWorkerModal() {
    const backdrop = document.getElementById('worker-modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';
    checkAllModalsClosed();
}

function populateModalChecklistOptions() {
    const caseSelect = document.getElementById('modal-select-case');
    const itemSelect = document.getElementById('modal-select-item');
    if (!caseSelect || !itemSelect) return;

    const caseCode = caseSelect.value;
    const targetCase = casesData.find(c => c.case_code === caseCode);
    if (!targetCase) return;

    itemSelect.innerHTML = (targetCase.checklist || []).map(item => `
        <option value="${item.id}">
            [${escapeHtml(item.item_code)}] ${escapeHtml(item.title)} (${escapeHtml(item.status.toUpperCase())})
        </option>
    `).join('');
}

async function submitModalSignOff() {
    const caseSelect = document.getElementById('modal-select-case');
    const itemSelect = document.getElementById('modal-select-item');
    const roleSelect = document.getElementById('modal-worker-role');
    const statusSelect = document.getElementById('modal-worker-status');
    const notesInput = document.getElementById('modal-worker-notes');

    if (!caseSelect || !itemSelect) return;

    const caseCode = caseSelect.value;
    const itemId = itemSelect.value;
    const role = roleSelect ? roleSelect.value : '';
    const status = statusSelect ? statusSelect.value : 'passed';
    const notes = notesInput ? notesInput.value.trim() : '';

    const btn = document.getElementById('btn-modal-transmit');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Submitting...';
    }

    try {
        const resp = await fetch(`/readiness/api/cases/${encodeURIComponent(caseCode)}/sign-off/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken(),
            },
            body: JSON.stringify({
                item_id: itemId,
                status: status,
                role_designation: role,
                notes: notes || 'Field inspection confirmed on site.'
            })
        });

        const data = await resp.json();
        if (data.status === 'success') {
            playClearanceChime('tick');
            updateLocalCase(data.case);
            closeWorkerModal();
            showToast(`✓ Field verification recorded for ${caseCode}!`, 'success');
        } else {
            showToast('Sign-off Error: ' + (data.message || 'Failed to submit verification'), 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Network error during verification submission', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Submit Verification
            `;
        }
    }
}

// Pitch Presentation Demo Handlers
async function demoSignOffAll(caseCode) {
    if (!caseCode) return;
    const targetCase = casesData.find(c => c.case_code === caseCode);
    if (!targetCase || !targetCase.checklist) return;

    showToast(`Simulating multi-department field sign-offs for ${caseCode}...`, 'info');
    for (const item of targetCase.checklist) {
        if (item.status !== 'passed') {
            const dept = getDepartmentInfo(item);
            await fetch(`/readiness/api/cases/${encodeURIComponent(caseCode)}/sign-off/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                body: JSON.stringify({
                    item_id: item.id,
                    status: 'passed',
                    role_designation: dept.defaultRole,
                    notes: dept.defaultNote,
                })
            });
        }
    }
    playClearanceChime('go');
    await fetchReadinessData();
    showToast(`✓ All field verification pillars certified for ${caseCode}! Ready to authorize GO.`, 'success');
}

async function demoTriggerDefect(caseCode) {
    if (!caseCode) return;
    const targetCase = casesData.find(c => c.case_code === caseCode);
    if (!targetCase || !targetCase.checklist || targetCase.checklist.length === 0) return;

    const targetItem = targetCase.checklist[0];
    const dept = getDepartmentInfo(targetItem);
    showToast(`Simulating safety hold defect on ${targetItem.title}...`, 'info');

    await fetch(`/readiness/api/cases/${encodeURIComponent(caseCode)}/sign-off/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
        body: JSON.stringify({
            item_id: targetItem.id,
            status: 'failed',
            role_designation: dept.defaultRole,
            notes: 'Field anomaly flagged during physical track walk. Interlocking held in safety mode.',
        })
    });

    await fetchReadinessData();
    showToast(`⚠ Safety defect logged! Departure Gate locked to HOLD (NO-GO).`, 'error');
}

// Update Local Case in State & Refresh DOM
function updateLocalCase(updatedCase) {
    if (!updatedCase || !updatedCase.case_code) return;

    const idx = casesData.findIndex(c => c.case_code === updatedCase.case_code);
    if (idx !== -1) {
        casesData[idx] = updatedCase;
    } else {
        casesData.unshift(updatedCase);
    }

    syncWorkspaceWithCases();

    // Update KPI Summary Strip
    const total = casesData.length;
    const ready = casesData.filter(c => c.readiness_decision === 'ready').length;
    const hold = casesData.filter(c => c.readiness_decision === 'not_ready' || c.readiness_decision === 'pending').length;

    const totalEl = document.getElementById('kpi-total');
    const readyEl = document.getElementById('kpi-ready');
    const holdEl = document.getElementById('kpi-hold');

    if (totalEl) totalEl.textContent = total;
    if (readyEl) readyEl.textContent = ready;
    if (holdEl) holdEl.textContent = hold;

    renderTabs();
    renderMainView();

    // Trigger one-shot state change flash
    const cardEl = document.getElementById(`card-${updatedCase.case_code}`);
    if (cardEl) {
        const lightEl = cardEl.querySelector('.master-clearance-light');
        if (lightEl) {
            lightEl.classList.remove('state-flash');
            void lightEl.offsetWidth; // Force reflow
            lightEl.classList.add('state-flash');
        }
    }
}

// Polling interval (15 seconds) with focus & scroll preservation
setInterval(async function pollCases() {
    // Skip poll update if modal is open or user is actively typing in an input
    if (isModalOpen) return;
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA')) {
        return;
    }

    try {
        const resp = await fetch('/readiness/api/cases/');
        const data = await resp.json();
        if (data.status === 'success' && Array.isArray(data.cases)) {
            // Diff before re-rendering
            const currentStr = JSON.stringify(casesData);
            const newStr = JSON.stringify(data.cases);
            if (currentStr !== newStr) {
                // Preserve scroll positions
                const scrollY = window.scrollY;
                casesData = data.cases;
                syncWorkspaceWithCases();
                renderTabs();
                renderMainView();
                window.scrollTo(0, scrollY);
            }
        }
    } catch (e) {
        // Silent background poll error suppression
    }
}, 15000);

// Initial Render (workspace already loaded above)
syncWorkspaceWithCases();
bindWorkspaceGlobalListeners();
renderTabs();
renderMainView();