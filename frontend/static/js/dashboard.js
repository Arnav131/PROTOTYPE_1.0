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
function getChartDefaults() {
    const dark = isDarkMode();
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
                backgroundColor: dark ? '#111111' : '#f0f0f0',
                titleColor: dark ? '#ffffff' : '#000000',
                bodyColor: dark ? '#a0a0a0' : '#555555',
                borderColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 8,
                titleFont: { family: 'Inter', weight: '600' },
                bodyFont: { family: 'JetBrains Mono' },
            },
        },
        scales: {
            x: {
                grid: {
                    color: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
                    drawBorder: false,
                },
                ticks: {
                    color: dark ? '#666666' : '#888888',
                    font: { family: 'JetBrains Mono', size: 10 },
                },
            },
            y: {
                grid: {
                    color: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
                    drawBorder: false,
                },
                ticks: {
                    color: dark ? '#666666' : '#888888',
                    font: { family: 'JetBrains Mono', size: 10 },
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
                backgroundColor: '#171A21',
                titleColor: '#F5F5F5',
                bodyColor: '#9CA3AF',
                borderColor: '#2A2F3A',
                borderWidth: 1,
                padding: 8,
                cornerRadius: 6,
                titleFont: { family: 'Inter', size: 11, weight: '600' },
                bodyFont: { family: 'JetBrains Mono', size: 10 },
            },
        },
        scales: {
            x: {
                display: false, // Hide x-axis for compactness
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                ticks: { color: '#6B7280', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 4 },
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
    if (!values || values.length === 0) return { main: '#10b981', bg: 'rgba(16,185,129,0.2)' };
    const lastValue = values[values.length - 1];
    let status = 'healthy'; // default
    
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

    if (status === 'critical') return { main: '#ef4444', bg: 'rgba(239,68,68,0.2)' }; // Red
    if (status === 'warning') return { main: '#f59e0b', bg: 'rgba(245,158,11,0.2)' }; // Amber
    return { main: '#10b981', bg: 'rgba(16,185,129,0.2)' }; // Green
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
    ['vibration', 'temperature', 'gauge', 'acoustic', 'strain', 'accelerometer'].forEach(type => {
        if (window.rakshakChartInstances[type]) {
            window.rakshakChartInstances[type].destroy();
        }
    });

    const timestamps = data.timestamps;
    const pointBorder = '#171A21';
    
    function createCompactChart(id, label, values, statsKey) {
        const canvas = document.getElementById(`chart-${id}`);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const colors = getChartColorConfig(id, values);
        
        window.rakshakChartInstances[id] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [{
                    label: label,
                    data: values,
                    borderColor: colors.main,
                    backgroundColor: createGradient(ctx, colors.bg, 'rgba(0,0,0,0)'),
                    borderWidth: 1.5,
                    pointBackgroundColor: colors.main,
                    pointBorderColor: pointBorder,
                    pointBorderWidth: 1,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    fill: true,
                    tension: 0.4,
                }],
            },
            options: getCompactChartDefaults(),
        });
        
        updateChartStats(id, values, data.sensor_stats, statsKey || id);
    }

    createCompactChart('vibration', 'Vibration (mm/s)', data.vibration);
    createCompactChart('temperature', 'Temperature (°C)', data.temperature);
    createCompactChart('gauge', 'Gauge Deviation (mm)', data.gauge_deviation, 'gauge_deviation');
    createCompactChart('acoustic', 'Acoustic Emissions (dB)', data.acoustic_emissions, 'acoustic_emissions');
    createCompactChart('strain', 'Strain Gauge Load (kN)', data.strain_gauge_load, 'strain_gauge_load');
    createCompactChart('accelerometer', 'Accelerometer Data (g)', data.accelerometer_data, 'accelerometer_data');
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
                var color = s.health === 'critical' ? '#DC2626' : s.health === 'warning' ? '#D97706' : '#16A34A';
                L.circleMarker([s.latitude, s.longitude], {
                    radius: 3,
                    fillColor: color,
                    fillOpacity: 0.8,
                    color: color,
                    weight: 1,
                }).addTo(map);
                mapBounds.extend([s.latitude, s.longitude]);
            }
        });
        
        routes.forEach(route => {
            if (route.geometry && route.geometry.length >= 2) {
                var color = route.status === 'critical' ? '#DC2626' : route.status === 'warning' ? '#D97706' : 'rgba(37,99,235,0.4)';
                var polyline = L.polyline(route.geometry, {
                    color: color,
                    weight: 1.5,
                    opacity: 0.7,
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
// INITIALIZE ON DOM READY
// ====================================================================
document.addEventListener('DOMContentLoaded', function () {
    initLiveClock();
    animateCounters();
    
    // Dashboard charts
    var trendsEl = document.getElementById('sensor-trends-data');
    if (trendsEl) {
        var trendData = JSON.parse(trendsEl.textContent);
        initDashboardCharts(trendData);
    }
    
    // Dashboard map
    initDashboardMap();
});
