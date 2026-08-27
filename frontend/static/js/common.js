// frontend/static/js/common.js
//
// Rakshak — Common utilities loaded on every page.
// Handles: live clock, KPI counter animations, sidebar behavior,
//          and shared formatting utilities.
// Split from dashboard.js to avoid loading dashboard-specific code
// (charts, map, sparklines) on non-dashboard pages.

'use strict';

// ====================================================================
// LIVE CLOCK — Updates every second with IST time
// ====================================================================

// Hoist DateTimeFormat instances to avoid 2 allocations/second
var _rakshakTimeFmt = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});
var _rakshakDateFmt = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
});

function initLiveClock() {
    var clockTime = document.getElementById('clock-time');
    var clockDate = document.getElementById('clock-date');

    if (!clockTime) return;

    function updateClock() {
        var now = new Date();
        clockTime.textContent = _rakshakTimeFmt.format(now);
        if (clockDate) clockDate.textContent = _rakshakDateFmt.format(now);
    }

    updateClock();
    setInterval(updateClock, 1000);
}

// ====================================================================
// KPI COUNTER ANIMATION — Animates numbers from 0 to target
// ====================================================================
function animateCounters() {
    var counters = document.querySelectorAll('.num[data-target], .kpi-item-value[data-target]');

    counters.forEach(function (counter) {
        var target = parseFloat(counter.getAttribute('data-target'));
        var duration = 1500; // milliseconds
        var startTime = performance.now();
        var isDecimal = target % 1 !== 0;

        // Format large numbers with Indian locale (Lakhs/Crores)
        function formatValue(val) {
            if (target >= 100000) {
                // Format as Lakhs: 24,50,000 → "24.5L"
                return (val / 100000).toFixed(1) + 'L';
            }
            if (isDecimal) {
                return val.toFixed(1);
            }
            return Math.round(val).toLocaleString('en-IN');
        }

        function step(currentTime) {
            var elapsed = currentTime - startTime;
            var progress = Math.min(elapsed / duration, 1);

            // Ease-out cubic for smooth deceleration
            var eased = 1 - Math.pow(1 - progress, 3);
            var current = eased * target;

            counter.textContent = formatValue(current);

            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }

        requestAnimationFrame(step);
    });
}

// ====================================================================
// SHARED FORMATTING UTILITIES
// ====================================================================
function _rakshakEscape(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _rakshakFmtStatus(value) {
    if (!value) return 'N/A';
    return String(value).replace(/_/g, ' ').replace(/\b\w/g, function (c) {
        return c.toUpperCase();
    });
}

function _rakshakStatusClass(status) {
    if (status === 'critical') return 'crit';
    if (status === 'warning') return 'warn';
    return 'good';
}

// ====================================================================
// APP SIDEBAR TOGGLE
// ====================================================================
function initSidebar() {
    var sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return;

    // Load state from local storage
    if (localStorage.getItem('rakshak_sidebar_collapsed') === 'true') {
        sidebar.classList.add('collapsed');
    }

    // Use event delegation for the toggle button
    document.addEventListener('click', function (e) {
        var toggleBtn = e.target.closest('#sidebar-toggle');
        if (!toggleBtn) return;

        e.preventDefault();
        var appSidebar = document.getElementById('app-sidebar');
        if (!appSidebar) return;

        appSidebar.classList.toggle('collapsed');
        var isCollapsed = appSidebar.classList.contains('collapsed');
        localStorage.setItem('rakshak_sidebar_collapsed', isCollapsed);

        // Explicitly resize charts after CSS transition (which is ~250ms)
        setTimeout(function () {
            window.dispatchEvent(new Event('resize'));

            // Explicit Chart.js resize (if charts are loaded)
            if (window.rakshakChartInstances) {
                Object.values(window.rakshakChartInstances).forEach(function (chart) {
                    if (chart && typeof chart.resize === 'function') chart.resize();
                });
            }
        }, 260);
    });
}

// ====================================================================
// INITIALIZE ON DOM READY — Common features only
// ====================================================================
document.addEventListener('DOMContentLoaded', function () {
    initLiveClock();
    animateCounters();
    initSidebar();
});
