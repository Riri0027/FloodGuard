/**
 * ============================================================
 * SCRIPT.JS
 * Main application initialization and event binding
 * Initializes the app, binds UI events, and coordinates modules
 * ============================================================
 */

(function () {
  const stateApi = window.FloodGuardState;
  const ui = window.FloodGuardUI;
  const logic = window.FloodGuardLogic;
  const config = window.FloodGuardConfig;
  const state = stateApi.state;
  const $ = stateApi.$;
  const SENSOR_HISTORY_STORAGE_KEY = 'floodguard.sensor-history.FG-001.v1';
  const MAX_HISTORY_RECORDS = 40;
  let stopRealtimeTelemetry = null;
  let stopRealtimeHistory = null;
  let sensorConnectionInProgress = false;
  let pendingSensorPort = null;
  let sensorReconnectTimer = null;
  let manualSensorDisconnect = false;
  let serialConnectionEventsBound = false;
  let historyStorageWarningShown = false;
  let resumeAlertOnNextReading = false;
  const WEATHER_LOCATION = {
    label: 'Bicol Region · Bilog Falls',
    coordinates: '13.83°N, 123.53°E',
    latitude: 13.8333,
    longitude: 123.5333
  };

  if (!stateApi || !ui || !logic || !config) {
    console.error('FloodGuard: required app modules not loaded.');
    return;
  }

  function normalizeSensorHistory(records) {
    if (!Array.isArray(records)) return [];
    const readings = new Map();
    records.forEach((reading) => {
      const timestamp = Number(reading && reading.t);
      const level = Number(reading && reading.v);
      if (Number.isFinite(timestamp) && timestamp > 0 && Number.isFinite(level) && level >= 0 && level <= config.TUBE_MAX_CM) {
        readings.set(timestamp, { t: timestamp, v: level });
      }
    });
    return Array.from(readings.values()).sort((a, b) => a.t - b.t).slice(-MAX_HISTORY_RECORDS);
  }

  function mergeSensorHistory(...recordSets) {
    return normalizeSensorHistory(recordSets.flat());
  }

  function persistSensorHistory() {
    try {
      localStorage.setItem(SENSOR_HISTORY_STORAGE_KEY, JSON.stringify(state.history));
    } catch (error) {
      if (!historyStorageWarningShown) {
        console.error('Unable to save local sensor history:', error);
        historyStorageWarningShown = true;
      }
    }
  }

  function restoreSensorHistory() {
    try {
      const stored = localStorage.getItem(SENSOR_HISTORY_STORAGE_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) throw new Error('Stored sensor history is not a list.');
      return normalizeSensorHistory(parsed);
    } catch (error) {
      console.error('Unable to restore local sensor history:', error);
      return [];
    }
  }

  function recordSensorReading(timestamp, level) {
    state.history.splice(0, state.history.length, ...mergeSensorHistory(state.history, [{ t: timestamp, v: level }]));
    persistSensorHistory();
  }

  function renderLastSensorReading() {
    const latest = state.history[state.history.length - 1];
    const sensorReadingEl = $('sensorLastReading');
    if (latest && sensorReadingEl) sensorReadingEl.textContent = `${(latest.v / 100).toFixed(2)} m`;
  }

  function syncReportData() {
    window.FloodGuardReportData = {
      get level() { return state.level; },
      history: state.history,
      get hasVerifiedLiveReading() { return state.hasVerifiedLiveReading; },
      get currentUser() { return state.currentUser; },
      get rainLoc() { return state.rainLoc; },
      get currentCause() { return state.currentCause; },
      get alertsToday() { return state.alertsToday; },
      thresholds: config.THRESHOLDS,
      decisionMatrix: config.DECISION_MATRIX,
      statusForLevel: stateApi.statusForLevel,
      computeForecast: stateApi.computeForecast,
      formatMeters: stateApi.formatMeters,
      toast: ui.toast
    };
  }

  async function fetchWeather() {
    const formatManilaDate = (dateIso) => {
      const date = new Date(`${dateIso}T12:00:00+08:00`);
      return new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      }).format(date);
    };

    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LOCATION.latitude}&longitude=${WEATHER_LOCATION.longitude}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&daily=weather_code,precipitation_sum,temperature_2m_max,temperature_2m_min&temperature_unit=celsius&wind_speed_unit=kmh&timezone=Asia/Manila`
      );

      if (!response.ok) throw new Error('Weather API error');

      const data = await response.json();
      const daily = data.daily;

      function getWeatherIcon(code) {
        if (code === 0) return '☀️';
        if (code === 1 || code === 2) return '🌤️';
        if (code === 3) return '☁️';
        if (code === 45 || code === 48) return '🌫️';
        if (code >= 51 && code <= 67) return '🌦️';
        if (code >= 71 && code <= 75) return '🌨️';
        if (code >= 80 && code <= 82) return '🌧️';
        if (code >= 85 && code <= 86) return '❄️';
        if (code >= 95 && code <= 99) return '⛈️';
        return '🌤️';
      }

      function getWeatherDescription(code) {
        if (code === 0) return 'Clear sky';
        if (code === 1 || code === 2) return 'Partly cloudy';
        if (code === 3) return 'Overcast';
        if (code === 45 || code === 48) return 'Foggy';
        if (code >= 51 && code <= 67) return 'Light rain';
        if (code >= 71 && code <= 75) return 'Snowfall';
        if (code >= 80 && code <= 82) return 'Rain showers';
        if (code >= 85 && code <= 86) return 'Snow showers';
        if (code >= 95 && code <= 99) return 'Thunderstorm';
        return 'Partly cloudy';
      }

      const weatherCards = [];
      for (let i = 0; i < Math.min(7, daily.time.length); i++) {
        const code = daily.weather_code[i];
        const rain = Math.round(Number(daily.precipitation_sum[i] || 0));
        const tempMax = Math.round(Number(daily.temperature_2m_max[i] || 0));
        const icon = getWeatherIcon(code);
        const note = rain > 10 ? `${rain}mm rainfall expected` : `High ${tempMax}°C · ${rain}mm rain`;

        weatherCards.push({
          day: formatManilaDate(daily.time[i]),
          icon,
          rain: rain > 0 ? `${rain}mm` : 'Dry',
          note
        });
      }

      const totalRain = (daily.precipitation_sum || []).slice(0, 7).reduce((sum, val) => sum + Number(val || 0), 0);
      const season = totalRain > 30 ? 'Rainy season' : totalRain > 10 ? 'Transition' : 'Dry season';
      const summary = totalRain > 30
        ? 'Enhanced rainfall accumulation around the watershed.'
        : totalRain > 10
          ? 'Moderate rainfall expected. Monitor the falls.'
          : 'Stable dry conditions with low rainfall risk.';

      const current = data.current || {};
      const currentCondition = {
        icon: getWeatherIcon(current.weather_code),
        description: getWeatherDescription(current.weather_code),
        temperature: Math.round(Number(current.temperature_2m || 0)),
        precipitation: Number(current.precipitation || 0).toFixed(1),
        wind: Math.round(Number(current.wind_speed_10m || 0))
      };
      state.lastSeasonInfo = { season, summary, cards: weatherCards, current: currentCondition };
    } catch (err) {
      console.warn('Weather API failed, using demo data:', err.message);
      const season = 'Unavailable';
      const weatherCards = [];
      const summary = 'Live weather data is temporarily unavailable for Bicol Region.';
      state.lastSeasonInfo = {
        season,
        summary,
        cards: weatherCards,
        current: null
      };
    }

    const { season, summary, cards, current } = state.lastSeasonInfo || { season: 'Unknown', summary: 'Loading…', cards: [], current: null };
    const weatherBody = $('weatherBody');
    if (weatherBody) {
      const totalRain = (cards || []).reduce((sum, d) => sum + (Number(String(d.rain).replace(/[^\d.]/g, '')) || 0), 0);

      weatherBody.innerHTML = `
        <div class="weather-summary">
          <div class="weather-current">
            <div class="weather-big">${current?.icon || cards[0]?.icon || '🌤️'}</div>
            <div>
              <div class="weather-seq">${current?.description || season}</div>
              <div class="weather-note">${current ? `${current.temperature}°C · ${current.precipitation}mm precipitation · ${current.wind} km/h wind` : summary}</div>
              <div style="font-size:0.7rem; color:#7385b3; margin-top:6px; font-family:'Roboto Mono', monospace;">
                📍 ${WEATHER_LOCATION.label} (${WEATHER_LOCATION.coordinates}) · ${season} · 7-day total: ${totalRain}mm
              </div>
            </div>
          </div>
          <div class="weather-forecast">
            ${cards.map((d) => `
              <div class="weather-day">
                <span class="day-name">${d.day}</span>
                <span class="day-icon">${d.icon}</span>
                <span class="day-rain">${d.rain}</span>
                <small>${d.note}</small>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:12px; padding-top:10px; border-top:1px solid rgba(36,58,114,0.3); font-size:0.65rem; color:#7385b3; font-family:'Roboto Mono', monospace;">
            📡 Real-time Bicol Region weather from Open-Meteo API · Manila timezone
          </div>
        </div>
      `;
    }

    const wsSeason = $('wsSeason');
    const wsSummary = $('wsSummary');
    const wsIcon = $('wsIcon');
    if (wsSeason) wsSeason.textContent = current?.description || season;
    if (wsSummary) wsSummary.textContent = current ? `${current.temperature}°C · ${current.wind} km/h wind` : summary;
    if (wsIcon) wsIcon.textContent = current?.icon || cards[0]?.icon || '🌤️';

    const wsUpdated = $('wsUpdated');
    if (wsUpdated) {
      const manilaNow = new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(new Date());
      wsUpdated.textContent = 'near-real-time conditions · Bilog Falls area · last updated ' + manilaNow;
    }
  }

  function updateFooterYear() {
    const footerYear = document.getElementById('footerYear');
    if (!footerYear) return;
    footerYear.textContent = new Date().getFullYear();
  }

  async function firebaseServices() {
    if (!window.FloodGuardFirebase) throw new Error('Firebase did not load. Check your internet connection and refresh the page.');
    return window.FloodGuardFirebase.ready;
  }

  async function loadServerPolicy() {
    const firebase = await firebaseServices();
    const user = firebase.auth.currentUser;
    if (!user) return;
    const response = await fetch('/api/system-config', { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    if (!response.ok) throw new Error('Unable to load server alert policy.');
    const policy = await response.json();
    config.TUBE_MAX_CM = Number(policy.maxLevelCm) || config.TUBE_MAX_CM;
    const warning = config.THRESHOLDS.find((item) => item.key === 'alert');
    const evacuate = config.THRESHOLDS.find((item) => item.key === 'critical');
    if (warning) warning.min = Number(policy.warningCm) || warning.min;
    if (evacuate) evacuate.min = Number(policy.evacuateCm) || evacuate.min;
    ui.renderThresholds();
  }

  function friendlyAuthError(error) {
    const messages = {
      'auth/invalid-credential': 'Incorrect email or password.',
      'auth/user-not-found': 'No account was found for that email address.',
      'auth/wrong-password': 'Incorrect email or password.',
      'auth/email-already-in-use': 'An account already exists for that email address.',
      'auth/weak-password': 'Password must contain at least 6 characters.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/operation-not-allowed': 'Email/password sign-in is disabled in Firebase Authentication.',
      'auth/network-request-failed': 'Network error. Check your connection and try again.'
    };
    if (error && (error.code === 'permission-denied' || error.code === 'firestore/permission-denied')) return 'Account request could not be saved. Publish the Firestore rules, then try again.';
    return messages[error && error.code] || error.message || 'Unable to complete authentication.';
  }

  function setSignupStatus(message = '', kind = '') {
    const status = $('signupStatus');
    if (!status) return;
    status.textContent = message;
    status.className = `auth-status${kind ? ` ${kind}` : ''}`;
  }

  function updateClock() {
    const clockTime = $('clockTime');
    const clockDate = $('clockDate');
    const now = new Date();

    updateFooterYear();
    
    // Update sensor status indicator
    logic.updateSensorStatus();
    
    if (!clockTime || !clockDate) return;

    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      hourCycle: 'h12'
    });
    const dateFormatter = new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    clockTime.textContent = timeFormatter.format(now);
    clockDate.textContent = dateFormatter.format(now);
  }

  function setSensorConnectionState(connected, { label = 'Unknown device', lastConnectionAt = null, battery = '—', signal = '—', notify = true } = {}) {
    state.sensorDevice.connected = connected;
    state.sensorDevice.lastConnectionAt = lastConnectionAt || state.sensorDevice.lastConnectionAt;
    state.sensorDevice.battery = battery;
    state.sensorDevice.signal = signal;

    const lastEl = $('sensorLastConnection');
    const batteryEl = $('sensorBattery');
    const signalEl = $('sensorSignal');
    const dashboardLabelEl = $('dashboardSensorLabel');

    if (dashboardLabelEl) {
      dashboardLabelEl.textContent = connected ? 'ESP32 FloodGuard · connected' : 'JSN-SR04T · ESP32';
    }

    if (lastEl) {
      const timestamp = state.sensorDevice.lastConnectionAt
        ? new Intl.DateTimeFormat('en-PH', {
            timeZone: 'Asia/Manila',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }).format(new Date(state.sensorDevice.lastConnectionAt))
        : 'Waiting for connection';
      lastEl.textContent = timestamp;
    }

    if (batteryEl) batteryEl.textContent = battery;
    if (signalEl) signalEl.textContent = signal;

    state.liveTelemetryActive = connected && state.hasVerifiedLiveReading;
    logic.updateSensorStatus();

    if (notify) ui.toast(connected ? `Sensor connected: ${label}` : 'Sensor disconnected. Device is offline.');
  }

  function showWaitingForLiveData() {
    state.hasVerifiedLiveReading = false;
    state.realtimeTelemetryActive = false;
    state.liveTelemetryActive = false;
    $('levelValue').textContent = '—';
    logic.updateMeta(state.level);
    ui.drawTube();
    ui.drawChartOn($('trendChart'));
    ui.renderHistoryTable();
  }

  function readRealtimeTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return Date.now();
  }

  function realtimeHealthStatus(reading, timestamp) {
    if (reading.isOnline === false) return 'offline';
    const age = Date.now() - timestamp;
    if (age > 5 * 60 * 1000) return 'offline';
    if (age > 2 * 60 * 1000) return 'delayed';
    return 'online';
  }

  function processCurrentStatus(forceResponse = false) {
    const st = stateApi.statusForLevel(state.level);
    if (st.key !== state.lastStatusKey || (forceResponse && st.key !== 'normal')) {
      logic.resetChannels();
      if (st.key !== 'normal') {
        logic.fireChannel('chanDash', 'chanDashState', 'notified', 600);
        if (state.realtimeTelemetryActive) {
          $('chanSMSState').textContent = 'server-managed';
        } else {
          $('chanSMSState').textContent = 'unavailable · no server link';
          if (st.key === 'critical') {
            $('sirenRing').classList.add('on');
            $('chanSirenState').textContent = 'browser alarm only';
          }
        }
      }
      logic.logAlert(st, state.level);
      if (!state.realtimeTelemetryActive) {
        logic.setCriticalAlarm(st.key === 'critical');
      }
      state.lastStatusKey = st.key;
    }
  }

  async function startRealtimeTelemetry() {
    if (stopRealtimeTelemetry) return;

    try {
      const firebase = await firebaseServices();
      const deviceRef = firebase.ref(firebase.rtdb, 'devices/FG-001');
      const historyRef = firebase.query(
        firebase.ref(firebase.rtdb, 'telemetry/FG-001'),
        firebase.limitToLast(40)
      );

      stopRealtimeHistory = firebase.onValue(historyRef, (snapshot) => {
        const readings = [];
        snapshot.forEach((child) => {
          const reading = child.val();
          const level = Number(reading && reading.levelCm);
          const timestamp = Number(reading && reading.recordedAt);
          if (!reading || reading.source !== 'floodguard-telemetry-api' || !Number.isFinite(level) || !Number.isFinite(timestamp)) return;
          readings.push({ t: timestamp, v: Math.min(config.TUBE_MAX_CM, Math.max(0, level)) });
        });

        readings.sort((a, b) => a.t - b.t);
        state.history.splice(0, state.history.length, ...mergeSensorHistory(state.history, readings));
        persistSensorHistory();
        renderLastSensorReading();
        ui.drawChartOn($('trendChart'));
        ui.renderHistoryTable();
        ui.renderForecast();
        if (state.currentUser) ui.renderDecisionSupport();
      }, (error) => {
        console.error('Telemetry history listener failed:', error);
      });

      stopRealtimeTelemetry = firebase.onValue(deviceRef, (snapshot) => {
        const reading = snapshot.val();
        const level = Number(reading && reading.levelCm);

        if (!reading || !Number.isFinite(level) || reading.source !== 'floodguard-telemetry-api') {
          if (state.hasVerifiedLiveReading) resumeAlertOnNextReading = true;
          showWaitingForLiveData();
          setSensorConnectionState(false, { label: 'No live database reading', notify: false });
          return;
        }

        const timestamp = readRealtimeTimestamp(reading.updatedAt);
        if (state.hasVerifiedLiveReading && Date.now() - state.lastTelemetryAt > 5 * 60 * 1000) {
          resumeAlertOnNextReading = true;
        }
        const previousLevel = state.level;
        const battery = Number(reading.batteryV);
        const signal = typeof reading.signal === 'string' && reading.signal.trim() ? reading.signal.trim() : 'Unknown';
        const healthStatus = realtimeHealthStatus(reading, timestamp);
        const online = healthStatus === 'online';
        const sirenActive = Boolean(reading.siren && reading.siren.active && Number(reading.siren.expiresAt) > Date.now());

        const liveLevel = Math.min(config.TUBE_MAX_CM, Math.max(0, level));
        state.hasVerifiedLiveReading = true;
        state.level = liveLevel;
        state.lastTelemetryAt = timestamp;
        state.liveTelemetryActive = online;
        state.realtimeTelemetryActive = true;

        recordSensorReading(timestamp, liveLevel);

        setSensorConnectionState(online, {
          label: healthStatus === 'delayed' ? 'Telemetry delayed' : 'Firebase Realtime Database · FG-001',
          lastConnectionAt: timestamp,
          battery: Number.isFinite(battery) ? `${battery.toFixed(1)}V` : '—',
          signal,
          health: healthStatus,
          notify: false
        });

        $('levelValue').textContent = (state.level / 100).toFixed(2);
        renderLastSensorReading();
        logic.updateMeta(previousLevel);
        if (resumeAlertOnNextReading && online) {
          resumeAlertOnNextReading = false;
          processCurrentStatus(true);
        }
        ui.drawTube();
        ui.drawChartOn($('trendChart'));
        ui.renderSourceCard();
        ui.renderForecast();
        const remoteAlertActive = reading.alert && reading.alert.status && reading.alert.status !== 'normal';
        $('chanSMS').classList.toggle('active', Boolean(remoteAlertActive));
        $('chanSMSState').textContent = remoteAlertActive ? 'server-managed' : 'idle';
        $('sirenRing').classList.toggle('on', sirenActive);
        $('chanSiren').classList.toggle('active', sirenActive);
        $('chanSirenState').textContent = sirenActive ? 'physical siren active' : 'idle';
        logic.setCriticalAlarm(sirenActive);
        if (state.currentUser) ui.renderDecisionSupport();
      }, (error) => {
        console.error('Realtime Database listener failed:', error);
        state.realtimeTelemetryActive = false;
        setSensorConnectionState(false, { label: 'Realtime Database unavailable', notify: false });
        ui.toast('Live database connection failed. Check Firebase Realtime Database rules.');
      });
    } catch (error) {
      console.error('Realtime Database setup failed:', error);
      ui.toast('Unable to start live database monitoring.');
    }
  }

  function stopRealtimeDatabaseTelemetry() {
    if (stopRealtimeTelemetry) stopRealtimeTelemetry();
    if (stopRealtimeHistory) stopRealtimeHistory();
    stopRealtimeTelemetry = null;
    stopRealtimeHistory = null;
    state.realtimeTelemetryActive = false;
  }

  function scheduleSensorReconnect(port, delay = 3000) {
    if (!port || manualSensorDisconnect || sensorReconnectTimer) return;
    sensorReconnectTimer = setTimeout(() => {
      sensorReconnectTimer = null;
      if (!manualSensorDisconnect && !sensorConnectionInProgress && !state.sensorDevice.connected) {
        connectToSensor(port, true);
      }
    }, delay);
  }

  async function connectToSensor(portOverride = null, isRetry = false) {
    if (!('serial' in navigator)) {
      setSensorConnectionState(false, { label: 'Web Serial not supported' });
      ui.toast('This browser does not support Web Serial. Use a compatible browser with a real sensor attached.');
      return;
    }
    if (sensorConnectionInProgress || state.sensorDevice.connected) {
      if (portOverride && sensorConnectionInProgress) pendingSensorPort = portOverride;
      return;
    }

    sensorConnectionInProgress = true;
    manualSensorDisconnect = false;
    let port = portOverride;
    let reader = null;
    let opened = false;
    try {
      if (!port) {
        const ports = await navigator.serial.getPorts();
        port = ports[0] || await navigator.serial.requestPort();
      }
      if (!port) {
        setSensorConnectionState(false, { label: 'No sensor found', lastConnectionAt: Date.now() });
        return;
      }

      await port.open({ baudRate: 115200 });
      if (sensorReconnectTimer) {
        clearTimeout(sensorReconnectTimer);
        sensorReconnectTimer = null;
      }
      opened = true;
      state.sensorDevice.port = port;
      state.sensorDevice.connected = true;
      state.sensorDevice.lastConnectionAt = Date.now();
      state.sensorDevice.battery = '—';
      state.sensorDevice.signal = 'Good';
      setSensorConnectionState(true, {
        label: 'ESP32 FloodGuard sensor',
        lastConnectionAt: state.sensorDevice.lastConnectionAt,
        battery: '—',
        signal: 'Good'
      });

      const textDecoder = new TextDecoderStream();
      if (port.readable) {
        port.readable.pipeTo(textDecoder.writable).catch(() => {});
      }
      reader = textDecoder.readable.getReader();
      state.sensorDevice.reader = reader;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const line = value.trim();
        if (!line) continue;

        const match = line.match(/(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)/);
        if (match) {
          const sensorLevel = Number(match[1]);
          const voltage = Number(match[2]);
          if (Number.isFinite(sensorLevel) && sensorLevel >= 0 && sensorLevel <= config.TUBE_MAX_CM) {
            const previousLevel = state.level;
            const timestamp = Date.now();
            state.hasVerifiedLiveReading = true;
            state.level = sensorLevel;
            state.lastTelemetryAt = timestamp;
            state.liveTelemetryActive = true;
            recordSensorReading(timestamp, sensorLevel);
            $('levelValue').textContent = (sensorLevel / 100).toFixed(2);
            logic.updateMeta(previousLevel);
            if (resumeAlertOnNextReading) {
              resumeAlertOnNextReading = false;
              processCurrentStatus(true);
            }
            const batteryValue = Number.isFinite(voltage) && voltage > 0 ? `${(voltage * 2.5).toFixed(1)}V` : '—';
            state.sensorDevice.battery = batteryValue;
            state.sensorDevice.signal = 'Strong';
            renderLastSensorReading();
            if ($('sensorBattery')) $('sensorBattery').textContent = batteryValue;
            if ($('sensorSignal')) $('sensorSignal').textContent = 'Strong';
            ui.drawTube();
            ui.drawChartOn($('trendChart'));
            ui.renderHistoryTable();
            ui.renderSourceCard();
            ui.renderForecast();
            if (state.currentUser) ui.renderDecisionSupport();
          }
        }
      }
    } catch (error) {
      if (opened && state.sensorDevice.port !== port) {
        console.warn('Sensor disconnected while reading:', error);
      } else {
        console.error('Sensor connect failed:', error);
        if (port && !manualSensorDisconnect) pendingSensorPort = port;
        setSensorConnectionState(false, { label: 'Connection failed', lastConnectionAt: Date.now(), battery: '—', signal: '—', notify: !isRetry });
        if (!isRetry) ui.toast('Unable to connect to the real sensor. Please check the device and permissions.');
      }
    } finally {
      if (reader) {
        if (state.sensorDevice.reader === reader) state.sensorDevice.reader = null;
        reader.releaseLock();
      }
      if (opened && state.sensorDevice.port === port) {
        if (!manualSensorDisconnect) {
          if (state.hasVerifiedLiveReading) resumeAlertOnNextReading = true;
          pendingSensorPort = port;
        }
        state.sensorDevice.port = null;
        state.sensorDevice.connected = false;
        state.liveTelemetryActive = false;
        if (!state.realtimeTelemetryActive) showWaitingForLiveData();
        setSensorConnectionState(false, {
          label: 'Sensor disconnected',
          lastConnectionAt: Date.now(),
          battery: '—',
          signal: '—',
          notify: false
        });
        try {
          await port.close();
        } catch (error) {
          console.warn('Unable to close disconnected sensor port:', error);
        }
      }
      sensorConnectionInProgress = false;
      const reconnectPort = pendingSensorPort;
      pendingSensorPort = null;
      if (reconnectPort && !manualSensorDisconnect && !state.sensorDevice.connected) {
        scheduleSensorReconnect(reconnectPort);
      }
    }
  }

  function bindSerialConnectionEvents() {
    if (!('serial' in navigator) || serialConnectionEventsBound) return;
    serialConnectionEventsBound = true;
    navigator.serial.addEventListener('connect', (event) => {
      manualSensorDisconnect = false;
      if (state.sensorDevice.connected && state.sensorDevice.port === event.port) return;
      pendingSensorPort = event.port;
      if (!sensorConnectionInProgress && !state.sensorDevice.connected) {
        const port = pendingSensorPort;
        pendingSensorPort = null;
        connectToSensor(port);
      }
    });
    navigator.serial.addEventListener('disconnect', (event) => {
      if (state.sensorDevice.port !== event.port) return;
      if (!manualSensorDisconnect) {
        if (state.hasVerifiedLiveReading) resumeAlertOnNextReading = true;
        pendingSensorPort = event.port;
      }
      const reader = state.sensorDevice.reader;
      state.sensorDevice.port = null;
      state.sensorDevice.reader = null;
      state.sensorDevice.connected = false;
      state.sensorDevice.lastConnectionAt = Date.now();
      state.sensorDevice.battery = '—';
      state.sensorDevice.signal = '—';
      state.liveTelemetryActive = false;
      setSensorConnectionState(false, {
        label: 'Sensor disconnected',
        lastConnectionAt: state.sensorDevice.lastConnectionAt,
        battery: '—',
        signal: '—',
        notify: false
      });
      if (!state.realtimeTelemetryActive) showWaitingForLiveData();
      if (reader) reader.cancel().catch((error) => console.warn('Unable to stop disconnected sensor reader:', error));
    });
  }

  async function autoConnectSensor() {
    if (!('serial' in navigator)) return;
    try {
      const ports = await navigator.serial.getPorts();
      if (!ports.length) return;
      await connectToSensor(ports[0]);
    } catch (error) {
      console.warn('Auto sensor connection skipped:', error);
    }
  }

  function disconnectFromSensor() {
    manualSensorDisconnect = true;
    if (sensorReconnectTimer) {
      clearTimeout(sensorReconnectTimer);
      sensorReconnectTimer = null;
    }
    if (state.hasVerifiedLiveReading) resumeAlertOnNextReading = true;
    pendingSensorPort = null;
    const port = state.sensorDevice.port;
    if (state.sensorDevice.reader) state.sensorDevice.reader.cancel().catch((error) => console.warn('Unable to stop sensor reader:', error));
    if (!state.sensorDevice.reader && port && typeof port.close === 'function') port.close().catch((error) => console.warn('Unable to close sensor port:', error));
    state.sensorDevice.connected = false;
    state.sensorDevice.lastConnectionAt = Date.now();
    state.sensorDevice.battery = '—';
    state.sensorDevice.signal = '—';
    state.liveTelemetryActive = false;
    setSensorConnectionState(false, {
      label: 'Sensor disconnected',
      lastConnectionAt: state.sensorDevice.lastConnectionAt,
      battery: '—',
      signal: '—'
    });
    if (!state.realtimeTelemetryActive) showWaitingForLiveData();
  }

  function escapeReportValue(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function buildSessionPdfHtml(payload) {
    const exportedAt = new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila', dateStyle: 'full', timeStyle: 'long'
    }).format(new Date(payload.exportedAt));
    const rows = [];
    rows.push(['Exported at', exportedAt]);
    rows.push(['Current water level', state.hasVerifiedLiveReading ? `${(state.level / 100).toFixed(2)} m` : 'No verified live reading']);
    rows.push(['Current flood status', state.hasVerifiedLiveReading ? stateApi.statusForLevel(state.level).name : 'Waiting for sensor data']);
    rows.push(['Recorded reading count', payload.state.history.length]);
    payload.state.history.slice().reverse().forEach((reading, index) => {
      const status = stateApi.statusForLevel(reading.v);
      const timestamp = new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'medium', hour12: true
      }).format(new Date(reading.t));
      rows.push([`Reading ${index + 1} · ${timestamp}`, `${Number(reading.v).toFixed(1)} cm (${(Number(reading.v) / 100).toFixed(2)} m) · ${status.name}`]);
    });
    rows.push(['Alert log count', payload.state.alertLog.length]);
    payload.state.alertLog.forEach((alert, index) => {
      rows.push([`Alert ${index + 1} · ${alert.time || 'time not recorded'}`, `${alert.statusName || alert.statusKey || 'Status unknown'} · ${alert.levelCm ?? '—'} cm${alert.cause ? ` · ${alert.cause}` : ''}`]);
    });
    const summaryRows = rows.map(([label, value]) => `<tr><th>${escapeReportValue(label)}</th><td>${escapeReportValue(value)}</td></tr>`).join('');
    const thresholdRows = config.THRESHOLDS.filter((threshold) => threshold.key !== 'normal')
      .map((threshold) => `<tr><th>${escapeReportValue(threshold.name)}</th><td>${escapeReportValue((threshold.min / 100).toFixed(2))} m</td></tr>`).join('');

    return `<div class="official-report">
      <div class="report-meta"><span>FloodGuard dashboard session export</span><span>${escapeReportValue(exportedAt)}</span><span>Station FG-001 · Lagonoy, Camarines Sur</span></div>
      <h1>Dashboard Session Snapshot</h1>
      <section><h2>Current Monitoring Summary</h2><table>${summaryRows}</table></section>
      <section><h2>Assessment</h2><p>This PDF contains the dashboard's locally loaded readings and alert records at export time. It is a view snapshot and does not include server-only data.</p></section>
      <section><h2>Recommended Action</h2><ol><li>Use the JSON backup when you need to import dashboard data again.</li><li>Confirm current conditions with live sensor data before making operational decisions.</li></ol></section>
      <section><h2>Alert Thresholds</h2><table>${thresholdRows}</table></section>
    </div>`;
  }

  function bindStaticEvents() {
    $('roleCardMdrrmo')?.addEventListener('click', () => {
      state.selectedRole = 'mdrrmo';
      $('roleCardMdrrmo').classList.toggle('selected', true);
      $('roleCardBarangay').classList.toggle('selected', false);
    });

    $('roleCardBarangay')?.addEventListener('click', () => {
      state.selectedRole = 'barangay';
      $('roleCardMdrrmo').classList.toggle('selected', false);
      $('roleCardBarangay').classList.toggle('selected', true);
    });

    $('menuToggle').addEventListener('click', () => {
      ui.setMobileMenu(!$('sidebarMenu').classList.contains('mobile-open'));
    });

    const userDetailsToggle = $('userDetailsToggle');
    const userChip = userDetailsToggle?.closest('.user-chip');
    const closeUserDetails = () => {
      if (!userChip || !userDetailsToggle) return;
      userChip.classList.remove('show-details');
      userDetailsToggle.setAttribute('aria-expanded', 'false');
      userDetailsToggle.setAttribute('aria-label', 'Show user details');
    };
    userDetailsToggle?.addEventListener('click', () => {
      const isOpen = userChip.classList.toggle('show-details');
      userDetailsToggle.setAttribute('aria-expanded', String(isOpen));
      userDetailsToggle.setAttribute('aria-label', isOpen ? 'Hide user details' : 'Show user details');
    });
    document.addEventListener('click', (event) => {
      if (userChip && !userChip.contains(event.target)) closeUserDetails();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 860) ui.setMobileMenu(false);
      if (window.innerWidth > 600) closeUserDetails();
    });

    document.querySelectorAll('.nav-btn[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        // Close first so the menu disappears immediately on page selection.
        if (window.innerWidth <= 860) ui.setMobileMenu(false);
        ui.showView(btn.dataset.view);
      });
    });

    $('loginBtn').addEventListener('click', async () => {
      const email = $('loginName').value.trim();
      const password = $('loginPassword').value;
      if (!email || !password) return ui.toast('Enter your email address and password.');

      try {
        const firebase = await firebaseServices();
        const credential = await firebase.signInWithEmailAndPassword(firebase.auth, email, password);
        const profileSnapshot = await firebase.getDoc(firebase.doc(firebase.db, 'users', credential.user.uid));
        if (!profileSnapshot.exists()) {
          await firebase.signOut(firebase.auth);
          throw new Error('This account has no FloodGuard access profile. Contact an administrator.');
        }
        const profile = profileSnapshot.data();
        if (profile.status !== 'Active') {
          await firebase.signOut(firebase.auth);
          return ui.toast(profile.status === 'Blocked' ? 'Access denied: this user has been blocked.' : 'Your account is awaiting administrator approval.');
        }
        const displayName = String(profile.name || '').trim();
        if (!displayName) {
          await firebase.signOut(firebase.auth);
          throw new Error('Your account profile needs a full name. Ask an administrator to update the name field.');
        }
        state.currentUser = {
          name: displayName,
          role: profile.role || 'MDRRMO Personnel',
          // Keep Barangay navigation restricted for legacy profiles whose
          // role label is correct but whose stored roleKey was entered wrong.
          roleKey: profile.roleKey === 'barangay' || profile.role === 'Barangay Official'
            ? 'barangay'
            : 'mdrrmo',
          uid: credential.user.uid
        };
        logic.doLogin();
        await loadServerPolicy();
        startRealtimeTelemetry();
      } catch (error) {
        console.error('Firebase sign-in failed:', error);
        ui.toast(friendlyAuthError(error));
      }
    });

    $('connectSensorBtn').addEventListener('click', () => connectToSensor());
    $('disconnectSensorBtn').addEventListener('click', disconnectFromSensor);

    $('loginName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginBtn').click(); });
    $('loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginBtn').click(); });

    $('signupBtn').addEventListener('click', async () => {
      const name = $('signupName').value.trim();
      const email = $('signupEmail').value.trim();
      const password = $('signupPassword').value;
      const confirmation = $('signupConfirmPassword').value;
      const button = $('signupBtn');
      const showValidation = (message) => { setSignupStatus(message, 'error'); ui.toast(message); };
      if (!name) return showValidation('Please enter your full name.');
      if (!email) return showValidation('Please enter your email address.');
      if (password.length < 6) return showValidation('Password must have at least 6 characters.');
      if (password !== confirmation) return showValidation('Passwords do not match.');
      const roleKey = $('signupRole').value;
      const requestedRole = roleKey === 'mdrrmo' ? 'MDRRMO Personnel' : 'Barangay Official';

      try {
        button.disabled = true;
        button.textContent = 'Submitting request…';
        setSignupStatus('Creating your pending access request…');
        const firebase = await firebaseServices();
        const credential = await firebase.createUserWithEmailAndPassword(firebase.auth, email, password);
        // Use Firebase's authenticated email, which is the value validated by
        // the Firestore rule, instead of relying on the raw form value.
        const authenticatedEmail = credential.user.email;
        if (!authenticatedEmail) throw new Error('Firebase did not return an email for this account.');
        await firebase.setDoc(firebase.doc(firebase.db, 'users', credential.user.uid), {
          name,
          email: authenticatedEmail,
          role: 'Pending approval',
          roleKey: 'pending',
          requestedRole,
          requestedRoleKey: roleKey,
          area: '',
          status: 'Pending',
          createdAt: firebase.serverTimestamp()
        });
        await firebase.signOut(firebase.auth);
        $('signupPassword').value = '';
        $('signupConfirmPassword').value = '';
        $('signupScreen').hidden = true;
        $('loginScreen').style.display = 'flex';
        $('loginName').value = authenticatedEmail;
        setSignupStatus('');
        ui.toast('Account request submitted. An administrator must approve it before you can log in.');
      } catch (error) {
        console.error('Firebase sign-up failed:', error);
        const message = friendlyAuthError(error);
        setSignupStatus(message, 'error');
        ui.toast(message);
      } finally {
        button.disabled = false;
        button.textContent = 'Create account';
      }
    });

    $('showSignupBtn').addEventListener('click', () => {
      $('loginScreen').style.display = 'none';
      $('signupScreen').hidden = false;
      setSignupStatus('');
      $('signupName').focus();
    });

    $('showLoginBtn').addEventListener('click', () => {
      $('signupScreen').hidden = true;
      $('loginScreen').style.display = 'flex';
      $('loginName').focus();
    });

    document.querySelectorAll('[data-password-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = $(button.dataset.passwordToggle);
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        button.classList.toggle('is-visible', visible);
        button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
        button.setAttribute('aria-pressed', String(visible));
      });
    });

    const handleLogout = async () => {
      try {
        const firebase = await firebaseServices();
        await firebase.signOut(firebase.auth);
        stopRealtimeDatabaseTelemetry();
        state.currentUser = null;
        $('appShell').classList.remove('active');
        $('loginScreen').style.display = 'flex';
        $('signupScreen').hidden = true;
        $('loginName').value = '';
        $('loginPassword').value = '';
        ui.toast('Logged out successfully.');
      } catch (error) {
        console.error('Firebase sign-out failed:', error);
        ui.toast(friendlyAuthError(error));
      }
    };

    $('logoutBtn').addEventListener('click', handleLogout);
    $('sidebarLogoutBtn').addEventListener('click', handleLogout);

    const showLessBtn = $('showLessHistoryBtn');
    const showMoreBtn = $('showMoreHistoryBtn');

    if (showLessBtn) {
      showLessBtn.addEventListener('click', () => {
        // The initial log view contains 10 rows, so "Show less" must be able
        // to return to that baseline after the user expands the list.
        state.visibleHistoryRows = Math.max(10, state.visibleHistoryRows - 10);
        ui.renderHistoryTable();
      });
    }

    if (showMoreBtn) {
      showMoreBtn.addEventListener('click', () => {
        state.visibleHistoryRows += 10;
        ui.renderHistoryTable();
      });
    }

    $('backupDataBtn').addEventListener('click', () => {
      try {
        const payload = stateApi.buildBackupPayload();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = 'floodguard-backup-' + stamp + '.json';
        a.click();
        URL.revokeObjectURL(url);
        logic.setBackupStatus('Backup saved: ' + a.download, 'ok');
        ui.toast('Backup downloaded.');
      } catch (err) {
        console.error(err);
        logic.setBackupStatus('Backup failed: ' + err.message, 'err');
      }
    });

    $('backupPdfBtn').addEventListener('click', async () => {
      try {
        const payload = stateApi.buildBackupPayload();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = await window.FloodGuardReports.downloadReport(
          buildSessionPdfHtml(payload),
          `floodguard-session-${stamp}.pdf`
        );
        logic.setBackupStatus('PDF saved: ' + filename, 'ok');
        ui.toast('Dashboard PDF downloaded.');
      } catch (err) {
        console.error('Dashboard PDF export failed:', err);
        logic.setBackupStatus('PDF export failed: ' + err.message, 'err');
        ui.toast('Unable to export the dashboard PDF. Please try again.');
      }
    });

    $('importDataBtn').addEventListener('click', () => $('importDataInput').click());
    $('importDataInput').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const s = parsed.state;
          if (!s) throw new Error('File does not contain a valid FloodGuard backup.');
          if (Array.isArray(s.history) && s.history.length) {
            state.history.splice(0, state.history.length, ...normalizeSensorHistory(s.history));
            persistSensorHistory();
            renderLastSensorReading();
          }
          if (Array.isArray(s.alertLog)) { state.alertLog.length = 0; state.alertLog.push(...s.alertLog); }
          if (Array.isArray(s.users) && s.users.length) { state.users.length = 0; state.users.push(...s.users); }
          // Thresholds are server-controlled operational policy and are never
          // restored from an untrusted browser export.
          if (typeof s.level === 'number') state.level = s.level;
          if (typeof s.alertsToday === 'number') state.alertsToday = s.alertsToday;
          if (typeof s.alertIdCounter === 'number') state.alertIdCounter = s.alertIdCounter;
          if (typeof s.rainLoc === 'number') state.rainLoc = s.rainLoc;
          if (s.currentCauseKey) state.currentCause = config.CAUSES.find((cause) => cause.key === s.currentCauseKey) || null;
          state.lastStatusKey = s.lastStatusKey || stateApi.statusForLevel(state.level).key;

          ui.drawTube();
          ui.drawChartOn($('trendChart'));
          ui.renderHistoryTable();
          logic.rebuildAlertLogTable();
          ui.renderSourceCard();
          ui.renderForecast();
          if (state.currentUser) ui.renderDecisionSupport();
          $('alertCountStat').textContent = state.alertsToday;
          logic.setBackupStatus('Restored backup from ' + (parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('en-PH') : file.name) + '.', 'ok');
          ui.toast('Data restored from backup.');
        } catch (err) {
          console.error(err);
          logic.setBackupStatus('Import failed: ' + err.message, 'err');
          ui.toast('Import failed — invalid backup file.');
        } finally {
          e.target.value = '';
        }
      };
      reader.onerror = () => logic.setBackupStatus('Could not read the selected file.', 'err');
      reader.readAsText(file);
    });

    document.addEventListener('click', () => {
      const ctx = window.FloodGuardLogic && window.FloodGuardLogic.ensureAudioCtx ? window.FloodGuardLogic.ensureAudioCtx() : null;
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    }, { once: true });
  }

  function init() {
    state.history.splice(0, state.history.length, ...mergeSensorHistory(state.history, restoreSensorHistory()));
    renderLastSensorReading();
    syncReportData();
    bindStaticEvents();
    if (window.FloodGuardReports && window.FloodGuardReports.initialize) {
      window.FloodGuardReports.initialize();
    }
    ui.renderThresholds();
    showWaitingForLiveData();
    ui.renderSourceCard();
    ui.renderForecast();
    if (state.currentUser) {
      logic.renderHero();
      ui.renderDecisionSupport();
    }

    function tick() {
      const serialPort = state.sensorDevice.port;
      const serialReader = state.sensorDevice.reader;
      const serialLastActivity = state.hasVerifiedLiveReading
        ? state.lastTelemetryAt
        : state.sensorDevice.lastConnectionAt;
      if (serialPort && serialReader && serialLastActivity && Date.now() - serialLastActivity > 30 * 1000 && !manualSensorDisconnect) {
        pendingSensorPort = serialPort;
        if (state.hasVerifiedLiveReading) resumeAlertOnNextReading = true;
        setSensorConnectionState(false, { label: 'Sensor data stalled', notify: false });
        showWaitingForLiveData();
        state.sensorDevice.reader = null;
        serialReader.cancel().catch((error) => console.warn('Unable to restart stalled sensor reader:', error));
        return;
      }

      if (!state.hasVerifiedLiveReading) {
        logic.updateMeta(state.level);
        return;
      }
      const ageMs = Date.now() - state.lastTelemetryAt;
      if (!state.realtimeTelemetryActive) {
        state.liveTelemetryActive = ageMs <= 5 * 60 * 1000;
      }
      logic.updateMeta(state.level);
      ui.renderSourceCard();
      ui.renderForecast();
      if (state.currentUser) ui.renderDecisionSupport();
      if ($('view-historical').classList.contains('active')) {
        ui.drawChartOn($('historyChart'));
        ui.renderHistoryTable();
      }

      if (ageMs > 5 * 60 * 1000) return;

      processCurrentStatus();
    }

    ui.drawTube();
    ui.drawChartOn($('trendChart'));
    updateClock();
    setInterval(updateClock, 1000);
    bindSerialConnectionEvents();
    autoConnectSensor();
    setInterval(tick, 1400);
    fetchWeather();
    setInterval(fetchWeather, 5 * 60000);
    logic.rebuildAlertLogTable();
    ui.renderHistoryTable();
    ui.renderSourceCard();
    ui.renderForecast();
    ui.renderDecisionSupport();
    ui.showView('dashboard');
    syncReportData();
  }

  window.FloodGuardApp = { init, state, syncReportData };
  updateClock();
  setInterval(updateClock, 1000);
  init();
})();
