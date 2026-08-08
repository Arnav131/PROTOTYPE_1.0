// frontend/static/js/map.js
//
// RAKSHAK — India-Wide Dark Charcoal Engineering Railway Control Map
// Base Railway Geometry: OpenStreetMap (Open Geographic Data Fallback)
// Operational Overlays: RAKSHAK Predictive Monitoring System

'use strict';

var rakshakMap = null;
var mainRailwayGeoJsonLayer = null;
var glowLayerGroup = null;
var stationLayerGroup = null;
var rakshakBasemapLayer = null;

var g_railwayMajorData = null;
var g_railwayFullData = null;
var g_stationData = null;
var g_zonesData = [];
var g_monitoringData = null;

var g_selectedFeatureId = null;

/**
 * Main Initialization for Rakshak Control Map
 */
function initRakshakControlMap() {
    var mapContainer = document.getElementById('railway-map');
    if (!mapContainer) return;

    // ----------------------------------------------------------------
    // 1. Initialize Leaflet Map with Canvas Vector Renderer
    // ----------------------------------------------------------------
    var canvasRenderer = L.canvas({ padding: 0.5, tolerance: 5 });

    rakshakMap = L.map('railway-map', {
        center: [20.5937, 78.9629], // India Center
        zoom: 5,
        minZoom: 4,
        maxZoom: 17,
        zoomControl: false,
        renderer: canvasRenderer,
        attributionControl: false // Custom attribution added below
    });

    // Base Tile Layer initialization depends on the current theme
    updateRakshakMapTheme();

    // Custom OpenStreetMap & RAKSHAK attribution
    L.control.attribution({
        position: 'bottomright',
        prefix: 'Base Geometry: <a href="https://www.openstreetmap.org/copyright" target="_blank" style="color:#64748b">OpenStreetMap</a> (Open Geographic Data) | RAKSHAK Systems'
    }).addTo(rakshakMap);

    // Layer groups for clean z-index ordering
    glowLayerGroup = L.layerGroup().addTo(rakshakMap);
    stationLayerGroup = L.layerGroup().addTo(rakshakMap);

    // Fit map to India Geographic Bounds immediately
    var indiaBounds = L.latLngBounds([6.5, 68.0], [35.5, 97.5]);
    rakshakMap.fitBounds(indiaBounds, { padding: [10, 10] });

    // Setup map control listeners (+, -, Fit India)
    _setupMapControls(indiaBounds);

    // Setup filter listeners
    _setupFilters();

    // Zoom-dependent rendering listener
    rakshakMap.on('zoomend', function() {
        _updateLayerVisibility();
    });

    // ----------------------------------------------------------------
    // 2. Fetch Datasets (36,000+ Real OSM Lines + Stations + RAKSHAK)
    // ----------------------------------------------------------------
    Promise.all([
        fetch('/static/data/railway/india_railways_major.geojson').then(function(r) { return r.json(); }),
        fetch('/static/data/railway/india_railways_full.geojson').then(function(r) { return r.json(); }),
        fetch('/static/data/stations/india_stations.geojson').then(function(r) { return r.json(); }),
        fetch('/static/data/zones/rakshak_zones.json').then(function(r) { return r.json(); }),
        fetch('/static/data/monitoring/rakshak_monitoring.json').then(function(r) { return r.json(); })
    ]).then(function(results) {
        g_railwayMajorData = results[0];
        g_railwayFullData  = results[1];
        g_stationData      = results[2];
        g_zonesData        = results[3];
        g_monitoringData   = results[4];

        console.log('RAKSHAK Map Data Loaded:',
            g_railwayFullData.features.length, 'real OSM track lines,',
            g_stationData.features.length, 'stations,',
            g_zonesData.length, 'zones.'
        );

        // Render Zone Navigator
        _renderZoneNavigator(g_zonesData);

        // Render Layers
        _renderTracksData();
        _renderStationsData();

        // Update Bottom Status Bar
        _updateStatusBar();

        // Default selection: Critical Asset VIB-04A (Zone 04)
        _selectCriticalAsset();

    }).catch(function(err) {
        console.error('Failed to load railway data datasets:', err);
    });

    // Update timestamp clock
    _startClock();
}


// ================================================================
// MAP CONTROLS & EVENT LISTENERS
// ================================================================

function _setupMapControls(indiaBounds) {
    var btnIn = document.getElementById('btn-zoom-in');
    var btnOut = document.getElementById('btn-zoom-out');
    var btnReset = document.getElementById('btn-reset-india');

    if (btnIn) btnIn.addEventListener('click', function() { rakshakMap.zoomIn(); });
    if (btnOut) btnOut.addEventListener('click', function() { rakshakMap.zoomOut(); });
    if (btnReset) btnReset.addEventListener('click', function() {
        rakshakMap.fitBounds(indiaBounds, { padding: [10, 10] });
    });

    // View Switcher (MAP | SCHEMATIC)
    var btnMap = document.getElementById('btn-view-map');
    var btnSch = document.getElementById('btn-view-schematic');
    if (btnMap && btnSch) {
        btnMap.addEventListener('click', function() {
            btnMap.classList.add('active');
            btnSch.classList.remove('active');
        });
        btnSch.addEventListener('click', function() {
            btnSch.classList.add('active');
            btnMap.classList.remove('active');
        });
    }
}

function _setupFilters() {
    var assetFilter = document.getElementById('asset-type-filter');
    var priorityFilter = document.getElementById('alert-priority-filter');

    if (assetFilter) assetFilter.addEventListener('change', _applyFilters);
    if (priorityFilter) priorityFilter.addEventListener('change', _applyFilters);
}

function _applyFilters() {
    var assetType = document.getElementById('asset-type-filter').value;

    if (assetType === 'station') {
        if (mainRailwayGeoJsonLayer) rakshakMap.removeLayer(mainRailwayGeoJsonLayer);
        glowLayerGroup.clearLayers();
        _renderStationsData();
    } else if (assetType === 'track') {
        stationLayerGroup.clearLayers();
        _renderTracksData();
    } else {
        _renderTracksData();
        _renderStationsData();
    }
}

function _updateLayerVisibility() {
    if (g_railwayFullData) _renderTracksData();
    if (g_stationData) _renderStationsData();
}


// ================================================================
// ZONE NAVIGATOR
// ================================================================

function _renderZoneNavigator(zones) {
    var container = document.getElementById('zone-list');
    if (!container) return;
    container.innerHTML = '';

    zones.forEach(function(z) {
        var item = document.createElement('div');
        item.className = 'zone-item';
        item.dataset.zoneId = z.id;

        var statusClass = z.status.toLowerCase();
        var iconHtml = '<div class="status-badge-icon ' + statusClass + '"></div>';

        item.innerHTML =
            '<span class="zone-name">' + z.short_name + ': ' + z.status + '</span>' +
            iconHtml;

        item.addEventListener('click', function() {
            document.querySelectorAll('.zone-item').forEach(function(el) { el.classList.remove('active'); });
            item.classList.add('active');

            if (z.bounds) {
                rakshakMap.fitBounds(z.bounds, { padding: [20, 20] });
            } else if (z.center) {
                rakshakMap.setView(z.center, z.zoom || 7);
            }

            if (z.id === 'ZONE-04') {
                _selectCriticalAsset();
            }
        });

        container.appendChild(item);
    });
}


// ================================================================
// HIGH-PERFORMANCE CANVAS VECTOR TRACK RENDERING (36,000+ REAL LINES)
// ================================================================

function _renderTracksData() {
    if (mainRailwayGeoJsonLayer) {
        rakshakMap.removeLayer(mainRailwayGeoJsonLayer);
        mainRailwayGeoJsonLayer = null;
    }
    glowLayerGroup.clearLayers();

    var currentZoom = rakshakMap.getZoom();
    var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    // Choose data source based on zoom level for maximum performance & detail
    var activeDataset = (currentZoom < 7 && g_railwayMajorData) ? g_railwayMajorData : g_railwayFullData;
    if (!activeDataset || !activeDataset.features) return;

    var monitoredMap = (g_monitoringData && g_monitoringData.monitored_tracks) ? g_monitoringData.monitored_tracks : {};

    // Dynamic weight & color based on zoom
    var baseWeight = 0.9;
    var baseColor  = isDark ? '#475569' : '#64748b'; // Slightly darker for light mode contrast

    if (currentZoom >= 7 && currentZoom <= 9) {
        baseWeight = 1.4;
        baseColor  = isDark ? '#64748b' : '#334155';
    } else if (currentZoom >= 10) {
        baseWeight = 2.2;
        baseColor  = isDark ? '#8193a8' : '#1e293b';
    }

    // Single unified Leaflet GeoJSON layer using HTML5 Canvas renderer
    mainRailwayGeoJsonLayer = L.geoJSON(activeDataset, {
        style: function(feature) {
            var featId = feature.id;
            var status = monitoredMap[featId] || 'normal';
            var isSelected = (featId === g_selectedFeatureId);

            var color = baseColor;
            var weight = baseWeight;
            var opacity = 0.85;

            if (status === 'warning') {
                color = '#f59e0b';
                weight = Math.max(3.0, baseWeight + 1.5);
                opacity = 1.0;
            } else if (status === 'critical') {
                color = '#ef4444';
                weight = Math.max(3.5, baseWeight + 2.0);
                opacity = 1.0;
            } else if (status === 'healthy') {
                color = '#10b981';
                weight = Math.max(2.2, baseWeight + 0.8);
                opacity = 0.95;
            } else if (isSelected) {
                color = '#06b6d4';
                weight = Math.max(3.5, baseWeight + 2.0);
                opacity = 1.0;
            }

            return {
                color: color,
                weight: weight,
                opacity: opacity,
                lineCap: 'round',
                lineJoin: 'round'
            };
        },
        onEachFeature: function(feature, layer) {
            var featId = feature.id;
            var status = monitoredMap[featId] || 'normal';

            // Add glow polylines for warning and critical monitored sections
            if (status === 'warning' || status === 'critical') {
                var glowColor = (status === 'critical') ? '#ef4444' : '#f59e0b';
                var glowPoly = L.geoJSON(feature, {
                    style: { color: glowColor, weight: 12, opacity: 0.3, lineCap: 'round' }
                });
                glowLayerGroup.addLayer(glowPoly);
            }

            layer.on('click', function(e) {
                L.DomEvent.stopPropagation(e);
                g_selectedFeatureId = featId;
                _renderTracksData(); // Refresh styling
                _renderTrackInspector(feature.properties, status);
            });
        }
    }).addTo(rakshakMap);
}


// ================================================================
// RENDER STATIONS (3,900+ REAL OSM STATIONS & JUNCTIONS)
// ================================================================

function _renderStationsData() {
    stationLayerGroup.clearLayers();
    if (!g_stationData || !g_stationData.features) return;

    var currentZoom = rakshakMap.getZoom();

    g_stationData.features.forEach(function(feature) {
        var coords = feature.geometry.coordinates; // [lon, lat]
        var props = feature.properties;

        var lat = coords[1];
        var lng = coords[0];

        var isJunction = (props.railway === 'junction');

        // Zoom filter: at national zoom (zoom < 7), hide all station circle markers so track lines dominate
        if (currentZoom < 7) {
            return;
        }

        var circleMarker = L.circleMarker([lat, lng], {
            radius: isJunction ? 4.0 : 2.5,
            color: isJunction ? '#38bdf8' : '#64748b',
            fillColor: isJunction ? '#0284c7' : '#0f172a',
            fillOpacity: 1.0,
            weight: isJunction ? 1.5 : 1.0
        });

        circleMarker.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            _renderStationInspector(props);
        });

        if (currentZoom >= 8) {
            circleMarker.bindTooltip(props.name + (props.ref !== 'Not available' ? ' (' + props.ref + ')' : ''), {
                direction: 'top',
                offset: [0, -6],
                className: 'station-tooltip'
            });
        }

        stationLayerGroup.addLayer(circleMarker);
    });

    // Add Critical Sensor VIB-04A marker
    if (g_monitoringData && g_monitoringData.critical_asset) {
        var crit = g_monitoringData.critical_asset;
        var critMarker = L.circleMarker([crit.position.lat, crit.position.lng], {
            radius: 6.5,
            color: '#ffffff',
            fillColor: '#ef4444',
            fillOpacity: 1.0,
            weight: 2
        });

        var critGlow = L.circleMarker([crit.position.lat, crit.position.lng], {
            radius: 16,
            color: 'transparent',
            fillColor: '#ef4444',
            fillOpacity: 0.35,
            interactive: false
        });

        critMarker.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            _selectCriticalAsset();
        });

        stationLayerGroup.addLayer(critGlow);
        stationLayerGroup.addLayer(critMarker);
    }
}


// ================================================================
// INSPECTOR PANEL RENDERING
// ================================================================

function _selectCriticalAsset() {
    if (!g_monitoringData || !g_monitoringData.critical_asset) return;
    var crit = g_monitoringData.critical_asset;

    document.querySelectorAll('.zone-item').forEach(function(el) {
        if (el.dataset.zoneId === 'ZONE-04') el.classList.add('active');
        else el.classList.remove('active');
    });

    _renderCriticalAssetInspector(crit);
}

function _renderCriticalAssetInspector(crit) {
    var container = document.getElementById('inspector-content');
    if (!container) return;

    var historyHtml = crit.maintenance_history.map(function(item) {
        return '<div style="font-size:0.75rem;color:var(--text-primary);padding:2px 0;">' + item + '</div>';
    }).join('');

    container.innerHTML =
        '<div class="asset-title">' +
            '<span>ASSET: ' + crit.sensor_id + '</span>' +
            '<span class="risk-tag high">HIGH (' + crit.failure_risk + ')</span>' +
        '</div>' +

        '<div class="prop-group">' +
            '<div class="prop-row"><span class="prop-key">ZONE</span><span class="prop-val">' + crit.zone + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">STATUS</span><span class="prop-val" style="color:var(--critical)">' + crit.status + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">CURRENT READING</span><span class="prop-val" style="color:var(--critical)">' + crit.reading + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">LAT, LNG</span><span class="prop-val">' + crit.position.lat.toFixed(4) + ', ' + crit.position.lng.toFixed(4) + '</span></div>' +
        '</div>' +

        '<div class="waveform-box">' +
            '<div class="waveform-header">' +
                '<span>SIGNAL WAVEFORM</span>' +
                '<span style="color:var(--critical)">SPIKE DETECTED</span>' +
            '</div>' +
            '<canvas id="waveform-canvas"></canvas>' +
        '</div>' +

        '<div class="prop-group">' +
            '<div style="font-family:\'JetBrains Mono\',monospace;font-size:0.7rem;color:var(--text-secondary);font-weight:600;margin-bottom:4px;">MAINTENANCE HISTORY</div>' +
            historyHtml +
        '</div>' +

        '<div class="action-card">' +
            '<div class="action-card-title">ACTION REQUIRED</div>' +
            '<button class="action-btn">' + crit.action_required + '</button>' +
        '</div>';

    _drawWaveformCanvas(crit.waveform);
}

function _drawWaveformCanvas(waveform) {
    var canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    // Store globally so theme toggle can redraw it
    if (waveform) {
        window.rakshakCurrentWaveform = waveform;
    } else {
        waveform = window.rakshakCurrentWaveform;
    }
    
    var isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    canvas.width = canvas.offsetWidth || 230;
    canvas.height = canvas.offsetHeight || 55;

    var w = canvas.width;
    var h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Dynamic grid color based on theme
    ctx.strokeStyle = isDark ? '#1e293b' : '#cbd5e1';
    ctx.lineWidth = 1;

    for (var x = 0; x < w; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (var y = 0; y < h; y += 12) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    if (!waveform || waveform.length === 0) return;

    var step = w / (waveform.length - 1);
    ctx.beginPath();
    ctx.lineWidth = 2;

    waveform.forEach(function(val, idx) {
        var px = idx * step;
        var py = h - ((val / 6.5) * h);

        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });

    var style = getComputedStyle(document.documentElement);
    var criticalColor = style.getPropertyValue('--critical').trim() || '#F04B55';
    
    ctx.strokeStyle = criticalColor;
    ctx.stroke();
}

function _renderTrackInspector(props, status) {
    var container = document.getElementById('inspector-content');
    if (!container) return;

    var statusColor = (status === 'critical') ? 'var(--critical)' : (status === 'warning' ? 'var(--warning)' : 'var(--success)');

    container.innerHTML =
        '<div class="asset-title">' +
            '<span>RAILWAY TRACK</span>' +
            '<span class="risk-tag info">' + (props.ref || 'OSM') + '</span>' +
        '</div>' +

        '<div class="prop-group">' +
            '<div class="prop-row"><span class="prop-key">NAME</span><span class="prop-val">' + (props.name || 'Not available') + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">REFERENCE</span><span class="prop-val">' + (props.ref || 'Not available') + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">OPERATOR</span><span class="prop-val">' + (props.operator || 'Not available') + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">STATUS</span><span class="prop-val" style="color:' + statusColor + '">' + status.toUpperCase() + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">GAUGE</span><span class="prop-val">' + (props.gauge || 'Not available') + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">ELECTRIFIED</span><span class="prop-val">' + (props.electrified || 'Not available') + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">TRACKS</span><span class="prop-val">' + (props.tracks || 'Not available') + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">USAGE</span><span class="prop-val">' + (props.usage || 'Not available') + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">MAX SPEED</span><span class="prop-val">' + (props.maxspeed || 'Not available') + '</span></div>' +
        '</div>' +

        '<div class="action-card" style="background:var(--accent-dim);border-color:var(--border)">' +
            '<div class="action-card-title" style="color:var(--text-secondary)">RAKSHAK MONITORED CORRIDOR</div>' +
            '<div style="font-size:0.75rem;color:var(--text-primary);margin-top:4px;">OSM Geometry Verified • Live Sensor Overlay Active</div>' +
        '</div>';
}

function _renderStationInspector(props) {
    var container = document.getElementById('inspector-content');
    if (!container) return;

    container.innerHTML =
        '<div class="asset-title">' +
            '<span>STATION DETAILS</span>' +
            '<span class="risk-tag info" style="background:var(--success-dim);color:var(--success);border-color:var(--success)">' + (props.ref || 'OSM') + '</span>' +
        '</div>' +

        '<div class="prop-group">' +
            '<div class="prop-row"><span class="prop-key">STATION NAME</span><span class="prop-val">' + (props.name || 'Not available') + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">CODE</span><span class="prop-val">' + (props.ref || 'Not available') + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">OPERATOR</span><span class="prop-val">' + (props.operator || 'Not available') + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">TYPE</span><span class="prop-val">' + (props.railway ? props.railway.toUpperCase() : 'STATION') + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">GAUGE</span><span class="prop-val">' + (props.gauge || 'Not available') + '</span></div>' +
            '<div class="prop-row"><span class="prop-key">ELECTRIFIED</span><span class="prop-val">' + (props.electrified || 'Not available') + '</span></div>' +
        '</div>';
}


// ================================================================
// BOTTOM STATUS BAR & LIVE CLOCK
// ================================================================

function _updateStatusBar() {
    var tracksEl = document.getElementById('stat-tracks-count');
    var sensorsEl = document.getElementById('stat-sensors-active');

    if (tracksEl && g_railwayFullData) tracksEl.textContent = g_railwayFullData.features.length;
    if (sensorsEl) sensorsEl.textContent = '98/100';
}

function _startClock() {
    function tick() {
        var el = document.getElementById('stat-timestamp');
        if (el) {
            var now = new Date();
            var hours = String(now.getHours()).padStart(2, '0');
            var mins  = String(now.getMinutes()).padStart(2, '0');
            var secs  = String(now.getSeconds()).padStart(2, '0');
            el.textContent = hours + ':' + mins + ':' + secs + ' IST';
        }
    }
    tick();
    setInterval(tick, 1000);
}

// ================================================================
// THEME SWITCHING (DARK / LIGHT MAP TILES)
// ================================================================

function updateRakshakMapTheme() {
    if (!rakshakMap) return;

    var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    
    // Light and Dark tile URLs (CartoDB)
    var tileUrl = isDark 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    if (rakshakBasemapLayer) {
        rakshakMap.removeLayer(rakshakBasemapLayer);
    }

    rakshakBasemapLayer = L.tileLayer(tileUrl, {
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(rakshakMap);

    // Ensure the base tile layer stays behind all vector layers
    if (rakshakBasemapLayer.setZIndex) {
        rakshakBasemapLayer.setZIndex(0);
    }

    // Refresh track colors to adapt to new background contrast
    if (g_railwayFullData) {
        _renderTracksData();
    }
    
    // Refresh waveform chart if present
    var canvas = document.getElementById('waveform-canvas');
    if (canvas && window.rakshakCurrentWaveform) {
        _drawWaveformCanvas(window.rakshakCurrentWaveform);
    }
}
