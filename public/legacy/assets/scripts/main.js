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
  let stopRealtimeTelemetry = null;

  if (!stateApi || !ui || !logic || !config) {
    console.error('FloodGuard: required app modules not loaded.');
    return;
  }

  function syncReportData() {
    window.FloodGuardReportData = {
      level: state.level,
      history: state.history,
      currentUser: state.currentUser,
      rainLoc: state.rainLoc,
      currentCause: state.currentCause,
      alertsToday: state.alertsToday,
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
      // Bilog Falls, Barangay Cabotonan, Lagonoy, Camarines Sur, Philippines
      const lat = 13.8333;
      const lon = 123.5333;

      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&daily=weather_code,precipitation_sum,temperature_2m_max,temperature_2m_min&temperature_unit=celsius&wind_speed_unit=kmh&timezone=Asia/Manila`
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
      const month = new Date().toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'numeric'
      });
      const season = Number(month) >= 5 && Number(month) <= 9 ? 'Rainy season' : Number(month) >= 10 || Number(month) <= 1 ? 'Cold season' : 'Dry season';
      const weatherCards = [
        { day: 'Today', icon: '🌧️', rain: '31mm', note: 'Scattered rain over the falls basin' },
        { day: 'Tue', icon: '🌦️', rain: '18mm', note: 'Intermittent showers' },
        { day: 'Wed', icon: '⛈️', rain: '54mm', note: 'Thunderstorm risk' },
        { day: 'Thu', icon: '🌤️', rain: '12mm', note: 'Brief clearing' },
        { day: 'Fri', icon: '🌧️', rain: '39mm', note: 'Moderate rainfall' },
        { day: 'Sat', icon: '🌦️', rain: '27mm', note: 'Patchy shower bands' },
        { day: 'Sun', icon: '🌤️', rain: '15mm', note: 'Mostly fair' }
      ];
      const summary = season === 'Rainy season'
        ? 'Enhanced rainfall accumulation around the watershed.'
        : season === 'Cold season'
          ? 'Cooler conditions with shallow cloud cover.'
          : 'Stable dry conditions with low rainfall risk.';
      state.lastSeasonInfo = {
        season,
        summary,
        cards: weatherCards,
        current: { icon: '🌧️', description: 'Scattered rain', temperature: 27, precipitation: '1.2', wind: 12 }
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
                📍 Bilog Falls (13.83°N, 123.53°E) · ${season} · 7-day total: ${totalRain}mm
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
            📡 Real-time forecast from Open-Meteo API · Manila timezone
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

  function friendlyAuthError(error) {
    const messages = {
      'auth/invalid-credential': 'Incorrect email or password.',
      'auth/user-not-found': 'No account was found for that email address.',
      'auth/wrong-password': 'Incorrect email or password.',
      'auth/email-already-in-use': 'An account already exists for that email address.',
      'auth/weak-password': 'Password must contain at least 6 characters.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/network-request-failed': 'Network error. Check your connection and try again.'
    };
    return messages[error && error.code] || error.message || 'Unable to complete authentication.';
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

    const statusEl = $('sensorDeviceStatus');
    const lastEl = $('sensorLastConnection');
    const batteryEl = $('sensorBattery');
    const signalEl = $('sensorSignal');
    const dashboardStatusEl = $('dashboardSensorStatus');
    const dashboardLabelEl = $('dashboardSensorLabel');
    const connText = $('connText');

    if (statusEl) {
      statusEl.textContent = connected ? '● Online' : '● Offline';
      statusEl.classList.toggle('online', connected);
      statusEl.classList.toggle('offline', !connected);
    }

    if (dashboardStatusEl) {
      dashboardStatusEl.textContent = connected ? 'Online' : 'Offline';
      dashboardStatusEl.classList.toggle('ok', connected);
      dashboardStatusEl.classList.toggle('warn', !connected);
    }

    if (dashboardLabelEl) {
      dashboardLabelEl.textContent = connected ? 'ESP32 FloodGuard · connected' : 'JSN-SR04T · ESP32';
    }

    // Update the top status pill (SENSOR ONLINE / OFFLINE)
    logic.updateSensorStatus();

    if (connText) {
      connText.textContent = connected ? 'SENSOR ONLINE' : 'SENSOR OFFLINE';
    }

    if (lastEl) {
      const timestamp = connected && state.sensorDevice.lastConnectionAt
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

    if (connected) {
      state.liveTelemetryActive = true;
      state.lastTelemetryAt = Date.now();
    } else {
      state.liveTelemetryActive = false;
    }

    if (notify) ui.toast(connected ? `Sensor connected: ${label}` : 'Sensor disconnected. Device is offline.');
  }

  function readRealtimeTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return Date.now();
  }

  async function startRealtimeTelemetry() {
    if (stopRealtimeTelemetry) return;

    try {
      const firebase = await firebaseServices();
      const deviceRef = firebase.ref(firebase.rtdb, 'devices/FG-001');
      stopRealtimeTelemetry = firebase.onValue(deviceRef, (snapshot) => {
        const reading = snapshot.val();
        const level = Number(reading && reading.levelCm);

        if (!reading || !Number.isFinite(level)) {
          state.realtimeTelemetryActive = false;
          setSensorConnectionState(false, { label: 'No live database reading', notify: false });
          return;
        }

        const previousLevel = state.level;
        const timestamp = readRealtimeTimestamp(reading.updatedAt);
        const battery = Number(reading.batteryV);
        const signal = typeof reading.signal === 'string' && reading.signal.trim() ? reading.signal.trim() : 'Unknown';
        const online = reading.isOnline !== false;

        state.level = Math.min(config.TUBE_MAX_CM, Math.max(0, level));
        state.target = state.level;
        state.lastTelemetryAt = timestamp;
        state.liveTelemetryActive = online;
        state.realtimeTelemetryActive = true;

        if (!state.history.length || state.history[state.history.length - 1].v !== state.level) {
          state.history.push({ t: timestamp, v: state.level });
          if (state.history.length > 40) state.history.shift();
        }

        setSensorConnectionState(online, {
          label: 'Firebase Realtime Database · FG-001',
          lastConnectionAt: timestamp,
          battery: Number.isFinite(battery) ? `${battery.toFixed(1)}V` : '—',
          signal,
          notify: false
        });

        $('levelValue').textContent = (state.level / 100).toFixed(2);
        logic.updateMeta(previousLevel);
        ui.drawTube();
        ui.drawChartOn($('trendChart'));
        ui.renderSourceCard();
        ui.renderForecast();
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
    stopRealtimeTelemetry = null;
    state.realtimeTelemetryActive = false;
  }

  async function connectToSensor() {
    if (!('serial' in navigator)) {
      setSensorConnectionState(false, { label: 'Web Serial not supported' });
      ui.toast('This browser does not support Web Serial. Use a compatible browser with a real sensor attached.');
      return;
    }

    try {
      const ports = await navigator.serial.getPorts();
      const port = ports[0] || await navigator.serial.requestPort();
      if (!port) {
        setSensorConnectionState(false, { label: 'No sensor found', lastConnectionAt: Date.now() });
        return;
      }

      await port.open({ baudRate: 115200 });
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
      const reader = textDecoder.readable.getReader();
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
          if (Number.isFinite(sensorLevel)) {
            state.level = Math.min(config.TUBE_MAX_CM, Math.max(0, sensorLevel));
            state.target = state.level;
            state.lastTelemetryAt = Date.now();
            state.liveTelemetryActive = true;
            const batteryValue = Number.isFinite(voltage) && voltage > 0 ? `${(voltage * 2.5).toFixed(1)}V` : '—';
            state.sensorDevice.battery = batteryValue;
            state.sensorDevice.signal = 'Strong';
            const sensorReadingEl = $('sensorLastReading');
            if (sensorReadingEl) sensorReadingEl.textContent = `${(state.level / 100).toFixed(2)} m`;
            if ($('sensorBattery')) $('sensorBattery').textContent = batteryValue;
            if ($('sensorSignal')) $('sensorSignal').textContent = 'Strong';
            ui.toast('Real sensor reading received.');
            ui.renderSourceCard();
            ui.renderForecast();
            ui.renderDecisionSupport();
          }
        }
      }
    } catch (error) {
      console.error('Sensor connect failed:', error);
      setSensorConnectionState(false, { label: 'Connection failed', lastConnectionAt: Date.now(), battery: '—', signal: '—' });
      ui.toast('Unable to connect to the real sensor. Please check the device and permissions.');
    }
  }

  async function autoConnectSensor() {
    if (!('serial' in navigator)) return;
    try {
      const ports = await navigator.serial.getPorts();
      if (!ports.length) return;
      await connectToSensor();
    } catch (error) {
      console.warn('Auto sensor connection skipped:', error);
    }
  }

  function disconnectFromSensor() {
    const port = state.sensorDevice.port;
    if (port && port.readable) {
      port.readable.cancel().catch(() => {});
    }
    if (state.sensorDevice.reader) {
      state.sensorDevice.reader.cancel().catch(() => {});
      state.sensorDevice.reader.releaseLock?.();
      state.sensorDevice.reader = null;
    }
    if (state.sensorDevice.port && typeof state.sensorDevice.port.close === 'function') {
      state.sensorDevice.port.close().catch(() => {});
    }
    state.sensorDevice.port = null;
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
        startRealtimeTelemetry();
      } catch (error) {
        console.error('Firebase sign-in failed:', error);
        ui.toast(friendlyAuthError(error));
      }
    });

    $('connectSensorBtn').addEventListener('click', connectToSensor);
    $('disconnectSensorBtn').addEventListener('click', disconnectFromSensor);

    $('loginName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginBtn').click(); });
    $('loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginBtn').click(); });

    $('signupBtn').addEventListener('click', async () => {
      const name = $('signupName').value.trim();
      const email = $('signupEmail').value.trim();
      const password = $('signupPassword').value;
      const confirmation = $('signupConfirmPassword').value;
      if (!name) return ui.toast('Please enter your full name.');
      if (!email) return ui.toast('Please enter your email address.');
      if (password.length < 6) return ui.toast('Password must have at least 6 characters.');
      if (password !== confirmation) return ui.toast('Passwords do not match.');
      if (stateApi.isBlockedUser(name)) return ui.toast('Access denied: this user has been blocked.');
      const roleKey = $('signupRole').value;
        const requestedRole = roleKey === 'mdrrmo' ? 'MDRRMO Personnel' : 'Barangay Official';

      try {
        const firebase = await firebaseServices();
        const credential = await firebase.createUserWithEmailAndPassword(firebase.auth, email, password);
        await firebase.setDoc(firebase.doc(firebase.db, 'users', credential.user.uid), {
          name,
          email,
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
        $('loginName').value = email;
        ui.toast('Account request submitted. An administrator must approve it before you can log in.');
      } catch (error) {
        console.error('Firebase sign-up failed:', error);
        ui.toast(friendlyAuthError(error));
      }
    });

    $('showSignupBtn').addEventListener('click', () => {
      $('loginScreen').style.display = 'none';
      $('signupScreen').hidden = false;
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
          if (Array.isArray(s.history) && s.history.length) { state.history.length = 0; state.history.push(...s.history); }
          if (Array.isArray(s.alertLog)) { state.alertLog.length = 0; state.alertLog.push(...s.alertLog); }
          if (Array.isArray(s.users) && s.users.length) { state.users.length = 0; state.users.push(...s.users); }
          if (Array.isArray(s.thresholds)) {
            s.thresholds.forEach((saved) => {
              const t = config.THRESHOLDS.find((item) => item.key === saved.key);
              if (t) t.min = saved.min;
            });
          }
          if (typeof s.level === 'number') {
            state.level = s.level;
            state.target = s.target ?? s.level;
          }
          if (typeof s.alertsToday === 'number') state.alertsToday = s.alertsToday;
          if (typeof s.alertIdCounter === 'number') state.alertIdCounter = s.alertIdCounter;
          if (typeof s.rainLoc === 'number') { state.rainLoc = state.rainLocT = s.rainLoc; }
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
    syncReportData();
    bindStaticEvents();
    if (window.FloodGuardReports && window.FloodGuardReports.initialize) {
      window.FloodGuardReports.initialize();
    }
    ui.renderThresholds();
    ui.renderSourceCard();
    ui.renderForecast();
    ui.drawTube();
    ui.drawChartOn($('trendChart'));
    ui.renderHistoryTable();
    if (state.currentUser) {
      logic.renderHero();
      ui.renderDecisionSupport();
    }

    function tick() {
      const noise = (Math.random() - 0.5) * 1.6;
      if (!state.realtimeTelemetryActive && (!state.liveTelemetryActive || Date.now() - state.lastTelemetryAt > 10 * 60 * 1000)) {
        state.liveTelemetryActive = false;
        state.level += (state.target - state.level) * 0.08 + noise;
      }
      state.level = Math.max(0, Math.min(config.TUBE_MAX_CM, state.level));
      const prevLevel = state.history.length ? state.history[state.history.length - 1].v : state.level;
      const lastReading = state.history[state.history.length - 1];
      if (!state.liveTelemetryActive && (!lastReading || Date.now() - lastReading.t >= 180000)) {
        state.history.push({ t: Date.now(), v: state.level });
        if (state.history.length > 40) state.history.shift();
      }
      state.wavePhase += 0.25;
      const st = stateApi.statusForLevel(state.level);
      $('levelValue').textContent = (state.level / 100).toFixed(2);
      logic.updateMeta(prevLevel);
      ui.drawTube();
      ui.drawChartOn($('trendChart'));
      state.rainLoc += (state.rainLocT - state.rainLoc) * 0.15 + (Math.random() - 0.5) * 1.0;
      state.rainLoc = Math.max(0, state.rainLoc);
      ui.renderSourceCard();
      ui.renderForecast();
      if (state.currentUser) ui.renderDecisionSupport();
      if ($('view-historical').classList.contains('active')) {
        ui.drawChartOn($('historyChart'));
        ui.renderHistoryTable();
      }

      if (st.key !== state.lastStatusKey) {
        logic.resetChannels();
        if (st.key !== 'normal') {
          logic.fireChannel('chanDash', 'chanDashState', 'notified', 600);
          logic.sendAutomaticSms(st, state.level);
          if (st.key === 'critical') {
            $('sirenRing').classList.add('on');
            $('chanSirenState').textContent = 'sounding';
          }
        }
        logic.logAlert(st, state.level);
        logic.setCriticalAlarm(st.key === 'critical');
        state.lastStatusKey = st.key;
      }
    }

    ui.drawTube();
    ui.drawChartOn($('trendChart'));
    updateClock();
    setInterval(updateClock, 1000);
    autoConnectSensor();
    setInterval(tick, 1400);
    fetchWeather();
    setInterval(fetchWeather, 5 * 60000);
    stateApi.seedHistory();
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
