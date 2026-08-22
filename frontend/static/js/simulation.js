// frontend/static/js/simulation.js
//
// Rakshak — Live Simulation
// Drives the terminal/pixel-art train animation, calls the backend to
// generate + predict on a fresh synthetic journey, and renders the result.

'use strict';

(function () {
    var setupEl = document.getElementById('sim-setup');
    var terminalEl = document.getElementById('sim-terminal');
    var resultsEl = document.getElementById('sim-results');
    var startBtn = document.getElementById('sim-start-btn');
    var resetBtn = document.getElementById('sim-reset-btn');
    var errorEl = document.getElementById('sim-error');
    var logEl = document.getElementById('sim-log');
    var trainEl = document.getElementById('sim-train');
    var trackWrapEl = document.querySelector('.sim-track');
    var stationSourceEl = document.getElementById('sim-station-source');
    var stationDestEl = document.getElementById('sim-station-dest');

    var chartInstance = null;
    var animationTimer = null;
    var MIN_ANIMATION_MS = 5000;   // journey animation always takes at least this long,
                                    // even if the backend responds faster — keeps the
                                    // demo feeling like a real journey, not an instant API call

    var LOG_LINES = [
        { text: '> Initializing onboard sensor array...', cls: 'sim-log-line--dim' },
        { text: '> Establishing telemetry link...', cls: '' },
        { text: '> Sampling ambient_temp, humidity, vibration_rms, gauge_width...', cls: '' },
        { text: '> Streaming readings from track section...', cls: '' },
        { text: '> Awaiting full 16-reading window...', cls: 'sim-log-line--dim' },
    ];

    if (!startBtn) return;  // page not loaded (defensive)

    startBtn.addEventListener('click', startSimulation);
    if (resetBtn) resetBtn.addEventListener('click', resetSimulation);

    function getCookie(name) {
        var cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            document.cookie.split(';').forEach(function (cookie) {
                var trimmed = cookie.trim();
                if (trimmed.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(trimmed.substring(name.length + 1));
                }
            });
        }
        return cookieValue;
    }

    function startSimulation() {
        var source = document.getElementById('sim-source').value.trim();
        var destination = document.getElementById('sim-destination').value.trim();
        errorEl.textContent = '';

        if (!source || !destination) {
            errorEl.textContent = 'Please enter both a source and destination station.';
            return;
        }
        if (source.toLowerCase() === destination.toLowerCase()) {
            errorEl.textContent = 'Source and destination must be different.';
            return;
        }

        startBtn.disabled = true;
        setupEl.style.display = 'none';
        resultsEl.style.display = 'none';
        terminalEl.style.display = 'block';

        stationSourceEl.textContent = truncateLabel(source);
        stationDestEl.textContent = truncateLabel(destination);
        logEl.innerHTML = '';
        trainEl.style.left = '0px';

        var startTime = Date.now();

        // Kick off the train animation (purely visual, CSS-driven position updates)
        animateTrain();
        typeLogLines();

        // Call the backend — this does the REAL LLM generation + REAL
        // prediction pipeline call, not preloaded/hardcoded data.
        var csrfToken = getCookie('csrftoken') || document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
        fetch('/api/simulation/run/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
            body: JSON.stringify({ source: source, destination: destination }),
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var elapsed = Date.now() - startTime;
                var remaining = Math.max(0, MIN_ANIMATION_MS - elapsed);
                animationTimer = setTimeout(function () {
                    finishJourney(data, source, destination);
                }, remaining);
            })
            .catch(function (err) {
                var elapsed = Date.now() - startTime;
                var remaining = Math.max(0, MIN_ANIMATION_MS - elapsed);
                setTimeout(function () {
                    showError('Simulation request failed: ' + err.message);
                }, remaining);
            });
    }

    function truncateLabel(s) {
        return s.length > 14 ? s.slice(0, 13) + '…' : s;
    }

    function animateTrain() {
        var start = performance.now();
        var trackWidth = trackWrapEl.getBoundingClientRect().width - 60;

        function step(now) {
            var elapsed = now - start;
            var progress = Math.min(elapsed / MIN_ANIMATION_MS, 1.0);
            trainEl.style.left = (progress * trackWidth) + 'px';
            if (progress < 1.0) {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    }

    function typeLogLines() {
        LOG_LINES.forEach(function (line, i) {
            setTimeout(function () {
                var div = document.createElement('div');
                div.className = 'sim-log-line ' + (line.cls || '');
                div.textContent = line.text;
                logEl.appendChild(div);
                logEl.scrollTop = logEl.scrollHeight;
            }, i * (MIN_ANIMATION_MS / (LOG_LINES.length + 1)));
        });
    }

    function finishJourney(data, source, destination) {
        if (!data || !data.success) {
            showError((data && data.error) || 'Simulation failed for an unknown reason.');
            return;
        }

        var arrivalLine = document.createElement('div');
        arrivalLine.className = 'sim-log-line';
        arrivalLine.textContent = '> 🚉 Train reached "' + destination + '" station — 16-reading window complete.';
        logEl.appendChild(arrivalLine);
        logEl.scrollTop = logEl.scrollHeight;

        setTimeout(function () {
            terminalEl.style.display = 'none';
            renderResults(data, source, destination);
            resultsEl.style.display = 'block';
        }, 900);
    }

    function showError(msg) {
        terminalEl.style.display = 'none';
        setupEl.style.display = 'flex';
        startBtn.disabled = false;
        errorEl.textContent = msg;
    }

    function renderResults(data, source, destination) {
        var prediction = data.prediction || {};
        var alertLevel = prediction.alert_level || 'none';
        var score = typeof prediction.anomaly_score === 'number' ? prediction.anomaly_score : 0;
        var faultType = prediction.fault_type || 'unknown';
        var faultConf = typeof prediction.fault_confidence === 'number' ? prediction.fault_confidence : 0;
        var explanation = prediction.explanation || prediction.metadata && prediction.metadata.explanation || '';

        document.getElementById('sim-arrival-banner').textContent =
            '🚉 Journey complete: ' + source + ' → ' + destination +
            '  |  sensor_id: ' + data.sensor_id;

        var alertCard = document.getElementById('sim-alert-card');
        alertCard.className = 'sim-card sim-card--alert level-' + alertLevel;
        document.getElementById('sim-alert-level').textContent = alertLevel.toUpperCase();
        document.getElementById('sim-alert-score').textContent = 'score: ' + score.toFixed(3);

        document.getElementById('sim-fault-type').textContent = faultType.replace(/_/g, ' ');
        document.getElementById('sim-fault-conf').textContent = 'confidence: ' + (faultConf * 100).toFixed(1) + '%';

        document.getElementById('sim-flavour').textContent = (data.scenario_flavour || 'unknown').replace(/_/g, ' ');
        document.getElementById('sim-backend-used').textContent = 'generator: ' + (data.generator_backend || 'unknown');

        document.getElementById('sim-score-bar-fill').style.width = Math.min(100, score * 100) + '%';

        var suggestionsEl = document.getElementById('sim-suggestions');
        suggestionsEl.innerHTML = '';
        (data.suggestions || []).forEach(function (s) {
            var div = document.createElement('div');
            div.className = 'sim-suggestion-line';
            div.textContent = s;
            suggestionsEl.appendChild(div);
        });

        var readinessBtn = document.getElementById('sim-readiness-btn');
        if (readinessBtn && data.readiness_url) {
            readinessBtn.href = data.readiness_url;
        }

        renderChart(data.readings || []);
    }

    function renderChart(readings) {
        var canvas = document.getElementById('sim-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        if (chartInstance) {
            chartInstance.destroy();
        }

        var labels = readings.map(function (_, i) { return 't-' + (readings.length - i); });
        var gauge = readings.map(function (r) { return r.gauge_width; });
        var vibration = readings.map(function (r) { return r.vibration_rms; });

        chartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Gauge Width (mm)',
                        data: gauge,
                        borderColor: '#38bdf8',
                        backgroundColor: 'rgba(56,189,248,0.08)',
                        yAxisID: 'y',
                        tension: 0.3,
                    },
                    {
                        label: 'Vibration RMS',
                        data: vibration,
                        borderColor: '#f87171',
                        backgroundColor: 'rgba(248,113,113,0.08)',
                        yAxisID: 'y1',
                        tension: 0.3,
                    },
                ],
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    y: { type: 'linear', position: 'left', title: { display: true, text: 'mm' } },
                    y1: { type: 'linear', position: 'right', title: { display: true, text: 'RMS' }, grid: { drawOnChartArea: false } },
                },
                plugins: { legend: { labels: { color: '#94a3b8' } } },
            },
        });
    }

    function resetSimulation() {
        resultsEl.style.display = 'none';
        setupEl.style.display = 'flex';
        startBtn.disabled = false;
        document.getElementById('sim-source').value = '';
        document.getElementById('sim-destination').value = '';
        errorEl.textContent = '';
        if (animationTimer) clearTimeout(animationTimer);
    }
})();
