// frontend/static/js/dashboard.js
//
// Rakshak — Core JavaScript
// Handles: live clock, KPI counter animations, Chart.js initialization,
//          map initialization, and shared utilities.
// This file is loaded on every page via base.html.

'use strict';

// ====================================================================
// LIVE CLOCK — Updates every second with IST time
// ====================================================================
function initLiveClock() {
    const clockTime = document.getElementById('clock-time');
    const clockDate = document.getElementById('clock-date');

    if (!clockTime || !clockDate) return;

    function updateClock() {
        const now = new Date();
        // Format time as HH:MM:SS
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        clockTime.textContent = `${hours}:${minutes}:${seconds}`;

        // Format date as YYYY/MM/DD
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        clockDate.textContent = `${year}/${month}/${day}`;
    }

    updateClock();
    setInterval(updateClock, 1000);
}

// ====================================================================
// KPI COUNTER ANIMATION — Animates numbers from 0 to target
// ====================================================================
function animateCounters() {
    const counters = document.querySelectorAll('.kpi-item-value[data-target]');

    counters.forEach(counter => {
        const target = parseFloat(counter.getAttribute('data-target'));
        const duration = 1500; // milliseconds
        const startTime = performance.now();
        const isDecimal = target % 1 !== 0;

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
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease-out cubic for smooth deceleration
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = eased * target;

            counter.textContent = formatValue(current);

            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }

        requestAnimationFrame(step);
    });
}

// ====================================================================
// CHART.JS INITIALIZATION — Sensor trend charts on the dashboard
// ====================================================================

// Shared Chart.js defaults — theme-aware
// Shared Chart.js defaults — glass-themed
function getChartDefaults() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(36, 27, 44, 0.94)',
                titleColor: '#f5f3f7',
                bodyColor: '#a89db0',
                borderColor: 'rgba(240, 168, 200, 0.16)',
                borderWidth: 1,
                padding: 14,
                cornerRadius: 10,
                titleFont: { family: 'Sora', weight: '600', size: 13 },
                bodyFont: { family: 'IBM Plex Mono', size: 12 },
                boxPadding: 4,
                usePointStyle: true,
            },
        },
        scales: {
            x: {
                grid: {
                    color: 'rgba(255,255,255,0.05)',
                    drawBorder: false,
                },
                ticks: {
                    color: '#6f6579',
                    font: { family: 'IBM Plex Mono', size: 10 },
                },
            },
            y: {
                grid: {
                    color: 'rgba(255,255,255,0.05)',
                    drawBorder: false,
                },
                ticks: {
                    color: '#6f6579',
                    font: { family: 'IBM Plex Mono', size: 10 },
                },
            },
        },
    };
}

function getCompactChartDefaults() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(36, 27, 44, 0.94)',
                titleColor: '#f5f3f7',
                bodyColor: '#a89db0',
                borderColor: 'rgba(240, 168, 200, 0.16)',
                borderWidth: 1,
                padding: 10,
                cornerRadius: 10,
                titleFont: { family: 'Sora', size: 11, weight: '600' },
                bodyFont: { family: 'IBM Plex Mono', size: 10 },
                boxPadding: 3,
                usePointStyle: true,
            },
        },
        scales: {
            x: {
                display: false,
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                ticks: { color: '#6f6579', font: { family: 'IBM Plex Mono', size: 9 }, maxTicksLimit: 4 },
            },
        },
    };
}

/**
 * Create a gradient fill for line charts.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} colorTop - Top color (RGBA)
 * @param {string} colorBottom - Bottom color (RGBA)
 * @returns {CanvasGradient}
 */
function createGradient(ctx, colorTop, colorBottom) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, colorTop);
    gradient.addColorStop(1, colorBottom);
    return gradient;
}

// Store chart instances globally to allow destruction
window.rakshakChartInstances = window.rakshakChartInstances || {};

function getChartColorConfig(type, values) {
    if (!values || values.length === 0) return { main: '#e79bd0', bg: 'rgba(224,92,154,0.22)', status: 'healthy' };
    const lastValue = values[values.length - 1];
    let status = 'healthy';
    
    if (type === 'vibration') {
        if (lastValue > 5.0) status = 'critical';
        else if (lastValue >= 3.5) status = 'warning';
    } else if (type === 'temperature') {
        if (lastValue > 50) status = 'critical';
        else if (lastValue >= 40) status = 'warning';
    } else if (type === 'gauge') {
        const absVal = Math.abs(lastValue);
        if (absVal > 6) status = 'critical';
        else if (absVal >= 2) status = 'warning';
    } else if (type === 'acoustic') {
        status = 'healthy';
    } else if (type === 'strain') {
        if (lastValue > 3.5) status = 'critical';
        else if (lastValue >= 2.5) status = 'warning';
    } else if (type === 'accelerometer') {
        if (lastValue > 1.8) status = 'critical';
        else if (lastValue >= 1.2) status = 'warning';
    }

    return { main: '#e79bd0', bg: 'rgba(224,92,154,0.24)', status: status };
}

/**
 * Generate plain-English data insight for a chart.
 * This makes graphs understandable to non-technical judges.
 */
function generateDataInsight(type, values) {
    if (!values || values.length < 2) return { text: 'Collecting data...', level: 'info' };
    
    const last = values[values.length - 1];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const trend = values[values.length - 1] - values[Math.max(0, values.length - 6)];
    const trendDir = trend > 0.1 ? 'rising' : trend < -0.1 ? 'falling' : 'stable';
    const trendIcon = trend > 0.1 ? '↑' : trend < -0.1 ? '↓' : '→';
    
    let insight = { text: '', level: 'healthy' };
    
    if (type === 'vibration') {
        if (last > 5.0) {
            insight = { text: `Vibration is <strong>critically high</strong> at ${last.toFixed(1)} mm/s ${trendIcon} — immediate inspection needed`, level: 'critical' };
        } else if (last >= 3.5) {
            insight = { text: `Vibration <strong>approaching threshold</strong> at ${last.toFixed(1)} mm/s ${trendIcon} — monitor closely`, level: 'warning' };
        } else {
            insight = { text: `Vibration <strong>within safe range</strong> at ${last.toFixed(1)} mm/s ${trendIcon} — all clear`, level: 'healthy' };
        }
    } else if (type === 'temperature') {
        if (last > 50) {
            insight = { text: `Rail temp <strong>dangerously high</strong> at ${last.toFixed(0)}°C ${trendIcon} — risk of track buckling`, level: 'critical' };
        } else if (last >= 40) {
            insight = { text: `Rail temp <strong>elevated</strong> at ${last.toFixed(0)}°C ${trendIcon} — ${trendDir === 'rising' ? 'still rising' : 'stabilizing'}`, level: 'warning' };
        } else {
            insight = { text: `Rail temp <strong>normal</strong> at ${last.toFixed(0)}°C ${trendIcon} — safe operating range`, level: 'healthy' };
        }
    } else if (type === 'gauge') {
        const absLast = Math.abs(last);
        if (absLast > 6) {
            insight = { text: `Gauge deviation <strong>critical</strong> at ${last.toFixed(1)}mm ${trendIcon} — track alignment issue`, level: 'critical' };
        } else if (absLast >= 2) {
            insight = { text: `Gauge deviation <strong>notable</strong> at ${last.toFixed(1)}mm ${trendIcon} — schedule inspection`, level: 'warning' };
        } else {
            insight = { text: `Gauge deviation <strong>minimal</strong> at ${last.toFixed(1)}mm ${trendIcon} — track well-aligned`, level: 'healthy' };
        }
    } else if (type === 'strain') {
        if (last > 3.5) {
            insight = { text: `Strain load <strong>excessive</strong> at ${last.toFixed(1)} kN ${trendIcon} — structural stress detected`, level: 'critical' };
        } else if (last >= 2.5) {
            insight = { text: `Strain load <strong>elevated</strong> at ${last.toFixed(1)} kN ${trendIcon} — increased traffic load`, level: 'warning' };
        } else {
            insight = { text: `Strain load <strong>normal</strong> at ${last.toFixed(1)} kN ${trendIcon} — structure healthy`, level: 'healthy' };
        }
    }
    
    return insight;
}

/**
 * Update the data-insight box in the DOM for a chart.
 */
function generateDataInsight(type, values) {
    if (!values || values.length < 2) return { text: 'Collecting data...', level: 'info' };

    const last = values[values.length - 1];
    const trend = values[values.length - 1] - values[Math.max(0, values.length - 6)];
    const trendDir = trend > 0.1 ? 'rising' : trend < -0.1 ? 'falling' : 'stable';
    const trendLabel = trend > 0.1 ? 'up' : trend < -0.1 ? 'down' : 'steady';

    if (type === 'vibration') {
        if (last > 5.0) return { text: `Vibration is <strong>critically high</strong> at ${last.toFixed(1)} mm/s (${trendLabel}) - immediate inspection needed`, level: 'critical' };
        if (last >= 3.5) return { text: `Vibration <strong>approaching threshold</strong> at ${last.toFixed(1)} mm/s (${trendLabel}) - monitor closely`, level: 'warning' };
        return { text: `Vibration <strong>within safe range</strong> at ${last.toFixed(1)} mm/s (${trendLabel}) - all clear`, level: 'healthy' };
    }

    if (type === 'temperature') {
        if (last > 50) return { text: `Rail temp <strong>dangerously high</strong> at ${last.toFixed(0)} deg C (${trendLabel}) - buckling risk`, level: 'critical' };
        if (last >= 40) return { text: `Rail temp <strong>elevated</strong> at ${last.toFixed(0)} deg C (${trendLabel}) - ${trendDir === 'rising' ? 'still rising' : 'stabilizing'}`, level: 'warning' };
        return { text: `Rail temp <strong>normal</strong> at ${last.toFixed(0)} deg C (${trendLabel}) - safe range`, level: 'healthy' };
    }

    if (type === 'gauge') {
        const absLast = Math.abs(last);
        if (absLast > 6) return { text: `Gauge deviation <strong>critical</strong> at ${last.toFixed(1)}mm (${trendLabel}) - alignment issue`, level: 'critical' };
        if (absLast >= 2) return { text: `Gauge deviation <strong>notable</strong> at ${last.toFixed(1)}mm (${trendLabel}) - schedule inspection`, level: 'warning' };
        return { text: `Gauge deviation <strong>minimal</strong> at ${last.toFixed(1)}mm (${trendLabel}) - well aligned`, level: 'healthy' };
    }

    if (type === 'strain') {
        if (last > 3.5) return { text: `Strain load <strong>excessive</strong> at ${last.toFixed(1)} kN (${trendLabel}) - structural stress`, level: 'critical' };
        if (last >= 2.5) return { text: `Strain load <strong>elevated</strong> at ${last.toFixed(1)} kN (${trendLabel}) - traffic load rising`, level: 'warning' };
        return { text: `Strain load <strong>normal</strong> at ${last.toFixed(1)} kN (${trendLabel}) - structure healthy`, level: 'healthy' };
    }

    return { text: 'Telemetry stream healthy.', level: 'healthy' };
}

function updateDataInsightUI(chartId, type, values) {
    const el = document.getElementById(`insight-${chartId}`);
    if (!el) return;
    const insight = generateDataInsight(type, values);
    el.innerHTML = insight.text;
    el.className = 'data-insight';
    if (insight.level === 'warning') el.classList.add('data-insight--warning');
    else if (insight.level === 'critical') el.classList.add('data-insight--critical');
}

function updateChartStats(id, values, statsData, statKey) {
    const maxEl = document.getElementById(`stat-${id}-max`);
    const minEl = document.getElementById(`stat-${id}-min`);
    if (maxEl && minEl) {
        if (statsData && statsData[statKey]) {
            maxEl.textContent = statsData[statKey].max.toFixed(2);
            minEl.textContent = statsData[statKey].min.toFixed(2);
        } else if (values && values.length > 0) {
            maxEl.textContent = Math.max(...values).toFixed(2);
            minEl.textContent = Math.min(...values).toFixed(2);
        }
    }
}

/**
 * Initialize all six dashboard sensor trend charts.
 * Called from dashboard.html after DOM load with parsed JSON data.
 * @param {Object} data - Sensor trend data
 */
function initDashboardCharts(data) {
    // Only run on pages that have the chart canvases
    if (!document.getElementById('chart-vibration')) return;

    // Store data for re-rendering if needed
    window.rakshakLastChartData = data;

    // Destroy existing instances
    ['vibration', 'temperature', 'gauge', 'strain'].forEach(type => {
        if (window.rakshakChartInstances[type]) {
            window.rakshakChartInstances[type].destroy();
        }
    });

    const timestamps = data.timestamps;
    
    function createCompactChart(id, label, values, statsKey) {
        const canvas = document.getElementById(`chart-${id}`);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const colors = getChartColorConfig(id, values);
        const pointBg = '#1a1420';
        
        window.rakshakChartInstances[id] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [{
                    label: label,
                    data: values,
                    borderColor: colors.main,
                    backgroundColor: createGradient(ctx, colors.bg, 'rgba(0,0,0,0)'),
                    borderWidth: 2.25,
                    pointBackgroundColor: colors.main,
                    pointBorderColor: pointBg,
                    pointBorderWidth: 1.5,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: colors.main,
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 2,
                    fill: true,
                    tension: 0.42,
                }],
            },
            options: getCompactChartDefaults(),
        });
        
        updateChartStats(id, values, data.sensor_stats, statsKey || id);
        updateDataInsightUI(id, id === 'gauge' ? 'gauge' : (id === 'strain' ? 'strain' : id), values);
    }

    createCompactChart('vibration', 'Vibration (mm/s)', data.vibration);
    createCompactChart('temperature', 'Temperature (deg C)', data.temperature);
    createCompactChart('gauge', 'Gauge Deviation (mm)', data.gauge_deviation, 'gauge_deviation');
    createCompactChart('strain', 'Strain Gauge Load (kN)', data.strain_gauge_load, 'strain_gauge_load');
}

function initDashboardMap() {
    var mapEl = document.getElementById('dashboard-map');
    if (!mapEl) return;
    
    var map = L.map('dashboard-map', {
        center: [22.5, 79.0],
        zoom: 5,
        zoomControl: true,
        attributionControl: false,
        preferCanvas: true,
    });
    
    var darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
    });
    
    var lightLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
    });

    if (isDarkMode()) {
        darkLayer.addTo(map);
    } else {
        lightLayer.addTo(map);
    }
    
    window.rakshakMap = {
        map: map,
        darkLayer: darkLayer,
        lightLayer: lightLayer
    };
    
    var mapBounds = L.latLngBounds();
    
    Promise.all([
        fetch('/api/stations/').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).catch(() => []),
        fetch('/api/routes/').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).catch(() => [])
    ]).then(([stations, routes]) => {
        stations.forEach(s => {
            if (s.latitude && s.longitude) {
                var color = s.health === 'critical' ? '#ef4444' : s.health === 'warning' ? '#f59e0b' : '#06d6a0';
                L.circleMarker([s.latitude, s.longitude], {
                    radius: 3,
                    fillColor: color,
                    fillOpacity: 0.9,
                    color: color,
                    weight: 1,
                }).addTo(map);
                mapBounds.extend([s.latitude, s.longitude]);
            }
        });
        
        routes.forEach(route => {
            if (route.geometry && route.geometry.length >= 2) {
                var color = route.status === 'critical' ? '#ef4444' : route.status === 'warning' ? '#f59e0b' : 'rgba(6,214,160,0.35)';
                var polyline = L.polyline(route.geometry, {
                    color: color,
                    weight: 1.5,
                    opacity: 0.8,
                }).addTo(map);
                mapBounds.extend(polyline.getBounds());
            }
        });
        
        setTimeout(() => {
            requestAnimationFrame(() => {
                map.invalidateSize();
                if (mapBounds.isValid()) {
                    // Filter out crazy bounds that include Africa/Middle East
                    var indiaBounds = L.latLngBounds([8.4, 68.7], [37.6, 97.2]);
                    if (!indiaBounds.contains(mapBounds.getSouthWest()) || !indiaBounds.contains(mapBounds.getNorthEast())) {
                        // Some geometry is wildly out of bounds, use India as fallback
                        map.fitBounds(indiaBounds, { padding: [20, 20] });
                    } else {
                        map.fitBounds(mapBounds, { padding: [20, 20] });
                    }
                } else {
                    map.fitBounds([[8.4, 68.7], [37.6, 97.2]], { padding: [20, 20] });
                }
            });
        }, 100);
    });
    
    let resizeTimeout;
    const resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            requestAnimationFrame(() => {
                map.invalidateSize();
            });
        }, 50);
    });
    resizeObserver.observe(mapEl);
}

// ====================================================================
// THEME-AWARE HELPERS
// ====================================================================
function isDarkMode() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme !== 'light';
}

window.addEventListener('themeChanged', function(e) {
    const isDark = e.detail.theme === 'dark';
    
    // Update map tile layers
    if (window.rakshakMap) {
        if (isDark) {
            window.rakshakMap.map.removeLayer(window.rakshakMap.lightLayer);
            window.rakshakMap.map.addLayer(window.rakshakMap.darkLayer);
        } else {
            window.rakshakMap.map.removeLayer(window.rakshakMap.darkLayer);
            window.rakshakMap.map.addLayer(window.rakshakMap.lightLayer);
        }
        window.rakshakMap.map.invalidateSize();
    }
    
    // Update Chart.js instances
    var trendsEl = document.getElementById('sensor-trends-data');
    if (trendsEl && window.rakshakChartInstances) {
        Object.values(window.rakshakChartInstances).forEach(chart => chart.destroy());
        window.rakshakChartInstances = {};
        initDashboardCharts(JSON.parse(trendsEl.textContent));
    }
});

// ====================================================================
// APP SIDEBAR TOGGLE
// ====================================================================
function initSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return;
    
    // Load state from local storage
    if (localStorage.getItem('rakshak_sidebar_collapsed') === 'true') {
        sidebar.classList.add('collapsed');
    }

    // Use event delegation for the toggle button
    document.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('#sidebar-toggle');
        if (!toggleBtn) return;
        
        e.preventDefault();
        const appSidebar = document.getElementById('app-sidebar');
        if (!appSidebar) return;
        
        appSidebar.classList.toggle('collapsed');
        const isCollapsed = appSidebar.classList.contains('collapsed');
        localStorage.setItem('rakshak_sidebar_collapsed', isCollapsed);
        
        // Explicitly resize charts after CSS transition (which is ~250ms)
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
            
            // Explicit Chart.js resize
            if (window.rakshakChartInstances) {
                Object.values(window.rakshakChartInstances).forEach(chart => {
                    if(chart && typeof chart.resize === 'function') chart.resize();
                });
            }
            // Explicit Leaflet Map resize
            if (window.rakshakMap && window.rakshakMap.map) {
                window.rakshakMap.map.invalidateSize();
            }
        }, 300); 
    });
}

// ====================================================================
// CHART EXPANSION MODAL
// ====================================================================
let currentModalChart = null;

function initChartModal() {
    const modal = document.getElementById('chart-modal');
    if (!modal) return;
    
    function closeModal() {
        if (modal) modal.style.display = 'none';
        if (currentModalChart) {
            currentModalChart.destroy();
            currentModalChart = null;
        }
    }
    
    // Event delegation for opening and closing modal
    document.addEventListener('click', (e) => {
        // Close modal if clicking close button or backdrop
        if (e.target.closest('#btn-close-modal') || e.target === modal) {
            closeModal();
            return;
        }
        
        // Expand chart
        const btn = e.target.closest('.btn-expand-chart');
        if (!btn) return;
        
        e.preventDefault();
        
        const chartId = btn.getAttribute('data-chart-id');
        const data = window.rakshakLastChartData;
        if (!data || !window.rakshakChartInstances || !window.rakshakChartInstances[chartId]) return;
        
        const titleEl = document.getElementById('modal-chart-title');
        
        // Map chartId to data key and labels
        let dataKey = chartId;
        let label = "";
        let statsKey = chartId;
        
        if (chartId === 'vibration') { label = 'Vibration Amplitude'; }
        else if (chartId === 'temperature') { label = 'Rail Temperature'; }
        else if (chartId === 'gauge') { label = 'Gauge Deviation'; dataKey = 'gauge_deviation'; statsKey = 'gauge_deviation'; }
        else if (chartId === 'strain') { label = 'Strain Gauge Load'; dataKey = 'strain_gauge_load'; statsKey = 'strain_gauge_load'; }
        
        if (titleEl) titleEl.textContent = label;
        modal.style.display = 'flex';
        
        // Render temporary large chart
        const canvas = document.getElementById('modal-chart-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const colors = getChartColorConfig(chartId, data[dataKey]);
        
        // ALWAYS destroy previous instance if it exists to avoid "Canvas already in use"
        if (currentModalChart) {
            currentModalChart.destroy();
        }
        
        currentModalChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.timestamps,
                datasets: [{
                    label: label,
                    data: data[dataKey],
                    borderColor: colors.main,
                    backgroundColor: createGradient(ctx, colors.bg, 'rgba(0,0,0,0)'),
                    borderWidth: 2.5,
                    pointBackgroundColor: colors.main,
                    pointBorderColor: '#1a1420',
                    pointBorderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 7,
                    pointHoverBackgroundColor: '#ffffff',
                    pointHoverBorderColor: colors.main,
                    pointHoverBorderWidth: 3,
                    fill: true,
                    tension: 0.4,
                }],
            },
            options: getChartDefaults(),
        });
        
        // Adjust options for the large view
        currentModalChart.options.maintainAspectRatio = false;
        if (currentModalChart.options.plugins && currentModalChart.options.plugins.legend) {
            currentModalChart.options.plugins.legend.display = true;
        }
        currentModalChart.update();
        
        // Update stats
        if (data.sensor_stats && data.sensor_stats[statsKey]) {
            const maxEl = document.getElementById('modal-stat-max');
            const minEl = document.getElementById('modal-stat-min');
            if (maxEl) maxEl.textContent = data.sensor_stats[statsKey].max.toFixed(2);
            if (minEl) minEl.textContent = data.sensor_stats[statsKey].min.toFixed(2);
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
    });
}

// ====================================================================
// INITIALIZE ON DOM READY
// ====================================================================
document.addEventListener('DOMContentLoaded', function () {
    initLiveClock();
    animateCounters();
    initSidebar();
    initChartModal();
    
    // Dashboard charts
    var trendsEl = document.getElementById('sensor-trends-data');
    if (trendsEl) {
        var trendData = JSON.parse(trendsEl.textContent);
        initDashboardCharts(trendData);
    }
    
    // Dashboard map
    initDashboardMap();
});

// ====================================================================
// SPARKLINE RENDERER — SVG sparklines for data-spark divs
// (Appended from handoff/static/js/dashboard.js)
// ====================================================================
(function () {
  function renderSpark(el) {
    const values = (el.dataset.values || '').split(',').map(Number).filter(v => !isNaN(v));
    if (!values.length) return;
    const stroke = el.dataset.color || '#c9a24a';
    const w = 200, h = 44, pad = 4;
    const min = Math.min(...values), max = Math.max(...values);
    const stepX = (w - pad * 2) / (values.length - 1);
    const scaleY = v => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    const pts = values.map((v, i) => [pad + i * stepX, scaleY(v)]);
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const cx = (x0 + x1) / 2;
      d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    const area = `${d} L ${pts[pts.length - 1][0]} ${h} L ${pts[0][0]} ${h} Z`;
    const gid = 'g' + Math.random().toString(36).slice(2, 8);
    el.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${stroke}" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="${stroke}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${area}" fill="url(#${gid})"/>
        <path d="${d}" stroke="${stroke}" stroke-width="2" fill="none" stroke-linecap="round"/>
      </svg>`;
  }
  document.querySelectorAll('[data-spark]').forEach(renderSpark);

  // Theme cards — click to visually mark active (visual only)
  document.querySelectorAll('.theme-card').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('.theme-card').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
    });
  });
})();
