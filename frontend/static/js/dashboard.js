// frontend/static/js/dashboard.js
//
// Rakshak — Dashboard-specific JavaScript
// Handles: Chart.js initialization, dashboard network map overview,
//          sparkline rendering, and theme change handling.
// Only loaded on the Dashboard page (not on every page).
//
// Common utilities (clock, counters, sidebar) are in common.js.

'use strict';

// ====================================================================
// CHART.JS INITIALIZATION — Sensor trend charts on the dashboard
// ====================================================================

// Shared Chart.js defaults — glass-themed
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
    var gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, colorTop);
    gradient.addColorStop(1, colorBottom);
    return gradient;
}

// Store chart instances globally to allow destruction
window.rakshakChartInstances = window.rakshakChartInstances || {};

function getChartColorConfig(type, values) {
    if (!values || values.length === 0) return { main: '#4fbf7a', bg: 'rgba(79,191,122,0.22)', status: 'healthy' };
    var lastValue = values[values.length - 1];
    var status = 'healthy';
    
    if (type === 'vibration') {
        if (lastValue > 5.0) status = 'critical';
        else if (lastValue >= 3.5) status = 'warning';
    } else if (type === 'temperature') {
        if (lastValue > 50) status = 'critical';
        else if (lastValue >= 40) status = 'warning';
    } else if (type === 'gauge') {
        var absVal = Math.abs(lastValue);
        if (absVal > 6) status = 'critical';
        else if (absVal >= 2) status = 'warning';
    } else if (type === 'strain') {
        if (lastValue > 3.5) status = 'critical';
        else if (lastValue >= 2.5) status = 'warning';
    }

    if (status === 'critical') return { main: '#f28b8b', bg: 'rgba(242,139,139,0.22)', status: status };
    if (status === 'warning') return { main: '#e0c07a', bg: 'rgba(224,192,122,0.22)', status: status };
    return { main: '#4fbf7a', bg: 'rgba(79,191,122,0.20)', status: status };
}

/**
 * Generate plain-English data insight for a chart.
 * This makes graphs understandable to non-technical judges.
 */
function generateDataInsight(type, values) {
    if (!values || values.length < 2) return { text: 'Collecting data...', level: 'info' };

    var last = values[values.length - 1];
    var trend = values[values.length - 1] - values[Math.max(0, values.length - 6)];
    var trendDir = trend > 0.1 ? 'rising' : trend < -0.1 ? 'falling' : 'stable';
    var trendLabel = trend > 0.1 ? 'up' : trend < -0.1 ? 'down' : 'steady';

    if (type === 'vibration') {
        if (last > 5.0) return { text: 'Vibration is <strong>critically high</strong> at ' + last.toFixed(1) + ' mm/s (' + trendLabel + ') - immediate inspection needed', level: 'critical' };
        if (last >= 3.5) return { text: 'Vibration <strong>approaching threshold</strong> at ' + last.toFixed(1) + ' mm/s (' + trendLabel + ') - monitor closely', level: 'warning' };
        return { text: 'Vibration <strong>within safe range</strong> at ' + last.toFixed(1) + ' mm/s (' + trendLabel + ') - all clear', level: 'healthy' };
    }

    if (type === 'temperature') {
        if (last > 50) return { text: 'Rail temp <strong>dangerously high</strong> at ' + last.toFixed(0) + ' deg C (' + trendLabel + ') - buckling risk', level: 'critical' };
        if (last >= 40) return { text: 'Rail temp <strong>elevated</strong> at ' + last.toFixed(0) + ' deg C (' + trendLabel + ') - ' + (trendDir === 'rising' ? 'still rising' : 'stabilizing'), level: 'warning' };
        return { text: 'Rail temp <strong>normal</strong> at ' + last.toFixed(0) + ' deg C (' + trendLabel + ') - safe range', level: 'healthy' };
    }

    if (type === 'gauge') {
        var absLast = Math.abs(last);
        if (absLast > 6) return { text: 'Gauge deviation <strong>critical</strong> at ' + last.toFixed(1) + 'mm (' + trendLabel + ') - alignment issue', level: 'critical' };
        if (absLast >= 2) return { text: 'Gauge deviation <strong>notable</strong> at ' + last.toFixed(1) + 'mm (' + trendLabel + ') - schedule inspection', level: 'warning' };
        return { text: 'Gauge deviation <strong>minimal</strong> at ' + last.toFixed(1) + 'mm (' + trendLabel + ') - well aligned', level: 'healthy' };
    }

    if (type === 'strain') {
        if (last > 3.5) return { text: 'Strain load <strong>excessive</strong> at ' + last.toFixed(1) + ' kN (' + trendLabel + ') - structural stress', level: 'critical' };
        if (last >= 2.5) return { text: 'Strain load <strong>elevated</strong> at ' + last.toFixed(1) + ' kN (' + trendLabel + ') - traffic load rising', level: 'warning' };
        return { text: 'Strain load <strong>normal</strong> at ' + last.toFixed(1) + ' kN (' + trendLabel + ') - structure healthy', level: 'healthy' };
    }

    return { text: 'Telemetry stream healthy.', level: 'healthy' };
}

function updateDataInsightUI(chartId, type, values) {
    var el = document.getElementById('insight-' + chartId);
    if (!el) return;
    var insight = generateDataInsight(type, values);
    el.innerHTML = insight.text;
    el.className = 'data-insight';
    if (insight.level === 'warning') el.classList.add('data-insight--warning');
    else if (insight.level === 'critical') el.classList.add('data-insight--critical');
}

function updateChartStats(id, values, statsData, statKey) {
    var latestEl = document.getElementById('stat-' + id + '-latest');
    var maxEl = document.getElementById('stat-' + id + '-max');
    var minEl = document.getElementById('stat-' + id + '-min');
    if (latestEl && values && values.length > 0) {
        var latest = values[values.length - 1];
        latestEl.textContent = id === 'temperature' ? latest.toFixed(0) : latest.toFixed(2);
    }
    if (maxEl && minEl) {
        if (statsData && statsData[statKey]) {
            maxEl.textContent = statsData[statKey].max.toFixed(2);
            minEl.textContent = statsData[statKey].min.toFixed(2);
        } else if (values && values.length > 0) {
            maxEl.textContent = Math.max.apply(null, values).toFixed(2);
            minEl.textContent = Math.min.apply(null, values).toFixed(2);
        }
    }
}

/**
 * Initialize all dashboard sensor trend charts.
 * Called from dashboard.html after DOM load with parsed JSON data.
 * @param {Object} data - Sensor trend data
 */
function initDashboardCharts(data) {
    // Only run on pages that have the chart canvases
    if (!document.getElementById('chart-vibration')) return;

    // Destroy existing instances
    ['vibration', 'temperature', 'gauge', 'strain'].forEach(function (type) {
        if (window.rakshakChartInstances[type]) {
            window.rakshakChartInstances[type].destroy();
        }
    });

    var timestamps = data.timestamps;
    
    function createCompactChart(id, label, values, statsKey) {
        var canvas = document.getElementById('chart-' + id);
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        var colors = getChartColorConfig(id, values);
        var pointBg = '#1a1420';
        
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

// ====================================================================
// THEME CHANGE HANDLER — Rebuild charts on theme switch
// ====================================================================
window.addEventListener('themeChanged', function(e) {
    // Update Chart.js instances
    var trendsEl = document.getElementById('sensor-trends-data');
    if (trendsEl && window.rakshakChartInstances) {
        Object.values(window.rakshakChartInstances).forEach(function (chart) { chart.destroy(); });
        window.rakshakChartInstances = {};
        initDashboardCharts(JSON.parse(trendsEl.textContent));
    }
});

// ====================================================================
// NETWORK MAP OVERVIEW (dashboard)
// Lightweight Leaflet map reusing the existing /api/stations and
// /api/routes endpoints. Loads once on dashboard init, no live polling.
// ====================================================================
var RAKSHAK_DASHBOARD_MAP_COLORS = {
    healthy: '#4fbf7a',
    warning: '#e0c07a',
    critical: '#f28b8b',
    routeDefault: '#9aa4b2',
};

function _renderDashboardSelection(payload) {
    var el = document.getElementById('dashboard-map-selection');
    if (!el) return;
    if (!payload) {
        el.innerHTML = '<span class="network-selection-label">Select a station or track</span>';
        return;
    }
    var statusCls = _rakshakStatusClass(payload.status);
    var parts = [
        '<span class="network-selection-status ' + statusCls + '">' + _rakshakEscape(_rakshakFmtStatus(payload.status)) + '</span>',
        '<span class="network-selection-title">' + _rakshakEscape(payload.title) + '</span>',
    ];
    if (payload.meta) {
        parts.push('<span class="network-selection-meta">' + _rakshakEscape(payload.meta) + '</span>');
    }
    el.innerHTML = parts.join('');
}

// Throttle helper for resize
var _dashboardResizeTimer = null;

function initDashboardMap() {
    var mapEl = document.getElementById('dashboard-map');
    if (!mapEl || typeof L === 'undefined') return;
    if (mapEl.dataset.mapInitialized === '1') return;
    mapEl.dataset.mapInitialized = '1';

    var mapEndpoint = mapEl.getAttribute('data-map-endpoint') || '';

    var map = L.map(mapEl, {
        center: [22.5, 79.0],
        zoom: 4,
        minZoom: 3,
        maxZoom: 10,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
        scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20,
    }).addTo(map);

    var routesLayer = L.layerGroup().addTo(map);
    var stationsLayer = L.layerGroup().addTo(map);

    function fetchJson(url) {
        return fetch(url, { credentials: 'same-origin' }).then(function (r) {
            if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
            return r.json();
        });
    }

    Promise.all([
        fetchJson('/api/stations/'),
        fetchJson('/api/routes/'),
    ]).then(function (results) {
        var stations = results[0] || [];
        var routes = (results[1] || []).filter(function (r) {
            return Array.isArray(r.coordinates) && r.coordinates.length >= 2;
        });

        var allPoints = [];

        routes.forEach(function (route) {
            var status = route.status || 'healthy';
            var color = RAKSHAK_DASHBOARD_MAP_COLORS[status] || RAKSHAK_DASHBOARD_MAP_COLORS.routeDefault;
            var line = L.polyline(route.coordinates, {
                color: color,
                weight: status === 'critical' ? 3.4 : 2.4,
                opacity: status === 'healthy' ? 0.68 : 0.9,
                dashArray: status === 'healthy' ? null : '6, 6',
                lineCap: 'round',
                lineJoin: 'round',
            });
            line.on('click', function () {
                _renderDashboardSelection({
                    title: route.name || route.id || 'Track section',
                    status: status,
                    meta: (route.source || '') + (route.destination ? ' → ' + route.destination : ''),
                });
            });
            line.on('dblclick', function () {
                if (mapEndpoint) {
                    window.location.href = mapEndpoint + '?focus_route=' + encodeURIComponent(route.id || '');
                }
            });
            routesLayer.addLayer(line);
            route.coordinates.forEach(function (pt) { allPoints.push(pt); });
        });

        stations.forEach(function (station) {
            if (typeof station.lat !== 'number' || typeof station.lng !== 'number') return;
            var status = station.status || 'healthy';
            var color = RAKSHAK_DASHBOARD_MAP_COLORS[status] || RAKSHAK_DASHBOARD_MAP_COLORS.healthy;
            var marker = L.circleMarker([station.lat, station.lng], {
                radius: station.is_junction ? 5.5 : 4,
                color: '#f5f3f7',
                weight: 1.1,
                fillColor: color,
                fillOpacity: 0.92,
            });
            marker.on('click', function () {
                _renderDashboardSelection({
                    title: station.name || station.code || 'Station',
                    status: status,
                    meta: station.code ? station.code + (station.zone ? ' · ' + station.zone : '') : (station.zone || ''),
                });
            });
            marker.on('dblclick', function () {
                if (mapEndpoint) {
                    window.location.href = mapEndpoint + '?focus_station=' + encodeURIComponent(station.code || '');
                }
            });
            stationsLayer.addLayer(marker);
            allPoints.push([station.lat, station.lng]);
        });

        if (allPoints.length) {
            try {
                map.fitBounds(L.latLngBounds(allPoints), { padding: [16, 16], maxZoom: 6 });
            } catch (e) {
                map.setView([22.5, 79.0], 4);
            }
        }

        window.setTimeout(function () { map.invalidateSize(); }, 60);
    }).catch(function () {
        var overlay = document.createElement('div');
        overlay.className = 'network-overview-empty';
        overlay.textContent = 'Network map data unavailable.';
        mapEl.appendChild(overlay);
    });

    // Throttled resize handler (250ms) instead of firing on every resize event
    window.addEventListener('resize', function () {
        if (!map) return;
        clearTimeout(_dashboardResizeTimer);
        _dashboardResizeTimer = setTimeout(function () {
            map.invalidateSize();
        }, 250);
    });
}

// ====================================================================
// INITIALIZE ON DOM READY — Dashboard-specific features
// ====================================================================
document.addEventListener('DOMContentLoaded', function () {
    // Dashboard charts (only if chart elements exist)
    var trendsEl = document.getElementById('sensor-trends-data');
    if (trendsEl) {
        var trendData = JSON.parse(trendsEl.textContent);
        initDashboardCharts(trendData);
    }

    // Dashboard network overview map
    if (document.getElementById('dashboard-map')) {
        initDashboardMap();
    }
});

// ====================================================================
// SPARKLINE RENDERER — SVG sparklines for data-spark divs
// ====================================================================
(function () {
  function renderSpark(el) {
    var values = (el.dataset.values || '').split(',').map(Number).filter(function (v) { return !isNaN(v); });
    if (!values.length) return;
    var stroke = el.dataset.color || '#c9a24a';
    var w = 200, h = 44, pad = 4;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var stepX = (w - pad * 2) / (values.length - 1);
    var scaleY = function (v) { return h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2); };
    var pts = values.map(function (v, i) { return [pad + i * stepX, scaleY(v)]; });
    var d = 'M ' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 1; i < pts.length; i++) {
      var x0 = pts[i - 1][0], y0 = pts[i - 1][1], x1 = pts[i][0], y1 = pts[i][1];
      var cx = (x0 + x1) / 2;
      d += ' C ' + cx + ' ' + y0 + ', ' + cx + ' ' + y1 + ', ' + x1 + ' ' + y1;
    }
    var area = d + ' L ' + pts[pts.length - 1][0] + ' ' + h + ' L ' + pts[0][0] + ' ' + h + ' Z';
    var gid = 'g' + Math.random().toString(36).slice(2, 8);
    el.innerHTML =
      '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none">' +
        '<defs>' +
          '<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="' + stroke + '" stop-opacity="0.35"/>' +
            '<stop offset="100%" stop-color="' + stroke + '" stop-opacity="0"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
        '<path d="' + d + '" stroke="' + stroke + '" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '</svg>';
  }
  document.querySelectorAll('[data-spark]').forEach(renderSpark);
})();
