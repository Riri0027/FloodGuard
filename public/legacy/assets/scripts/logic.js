/**
 * ============================================================
 * APP-LOGIC.JS
 * Application Logic and Event Handling Module
 *
 * PURPOSE:
 * Processes water-level changes, alerts, communication channels,
 * alarms, user login behavior, dashboard rendering, and sensor
 * connection status.
 * ============================================================
 */

window.FloodGuardLogic = (() => {

  // ============================================================
  // 1. CONNECT TO FLOODGUARD SYSTEM MODULES
  // ============================================================
  // Connects this logic file to:
  // - FloodGuardConfig: system configuration and thresholds
  // - FloodGuardState: current system data/state
  // - FloodGuardUI: dashboard/interface functions
  // ============================================================

  const config = window.FloodGuardConfig;
  const stateApi = window.FloodGuardState;
  const uiApi = window.FloodGuardUI;

  const {
    state,
    $,
    statusForLevel,
    formatMeters,
    pickCause,
    clearCause,
    initials,
    isBlockedUser,
    buildBackupPayload
  } = stateApi;


  // ============================================================
  // 2. UPDATE ALERT STATUS BADGE
  // ============================================================
  // Updates the status badge displayed on the dashboard.
  // Example:
  // NORMAL, WARNING, or CRITICAL
  // ============================================================

  function updateBadge(st) {
    const badge = $('statusBadge');

    badge.textContent = st.name.toUpperCase();
    badge.style.color = st.color;
    badge.style.background = st.color + '18';
  }


  // ============================================================
  // 3. UPDATE WATER LEVEL MONITORING INFORMATION
  // ============================================================
  // Calculates:
  // - Distance to the next critical threshold
  // - Water-level trend
  // - Last update status
  // - Current alert badge
  // ============================================================

  function updateMeta(prevLevel) {
    if (!state.hasVerifiedLiveReading && !state.demoMode) {
      $('distToCrit').textContent = 'Waiting for verified sensor data';
      $('trendVal').textContent = '—';
      $('lastUpdate').textContent = 'waiting for ESP32 telemetry';
      const badge = $('statusBadge');
      badge.textContent = 'WAITING';
      badge.style.color = '#9aa7c7';
      badge.style.background = 'rgba(154,167,199,0.12)';
      return;
    }
    const st = statusForLevel(state.level);

    const nextT = config.THRESHOLDS.find(
      (t) => t.min > state.level
    );

    $('distToCrit').textContent = nextT
      ? formatMeters(nextT.min - state.level) + ' to ' + nextT.name
      : '—';

    const diff = state.level - prevLevel;

    $('trendVal').textContent =
      diff > 0.4
        ? 'rising ↑'
        : diff < -0.4
          ? 'falling ↓'
          : 'steady';

    const ageMs = Math.max(0, Date.now() - Number(state.lastTelemetryAt || 0));
    const ageLabel = ageMs < 60 * 1000
      ? 'updated just now'
      : ageMs < 60 * 60 * 1000
        ? `last reading ${Math.floor(ageMs / 60000)} min ago`
        : `last reading ${Math.floor(ageMs / 3600000)} hr ago`;
    $('lastUpdate').textContent = state.demoMode ? 'test reading' : ageLabel;

    updateBadge(st);
  }


  // ============================================================
  // 4. ACTIVATE COMMUNICATION CHANNEL
  // ============================================================
  // Activates a communication channel and updates its status.
  //
  // Used for:
  // - Dashboard
  // - Automatic SMS
  // - Siren/Alarm
  // ============================================================

  function fireChannel(id, stateId, label, delay) {
    const el = $(id);
    const stateEl = $(stateId);

    el.classList.add('active');
    stateEl.textContent = 'sending…';

    setTimeout(() => {
      stateEl.textContent = label;
    }, delay);
  }


  // ============================================================
  // 5. RESET COMMUNICATION CHANNELS
  // ============================================================
  // Returns all alert channels to their idle state.
  // Also turns off the siren animation.
  // ============================================================

  function resetChannels() {
    ['chanDash', 'chanSMS', 'chanSiren']
      .forEach((id) => $(id).classList.remove('active'));

    $('chanDashState').textContent = 'idle';
    $('chanSMSState').textContent = 'idle';
    $('chanSirenState').textContent = 'idle';

    $('sirenRing').classList.remove('on');
  }


  // ============================================================
  // 6. SEND AUTOMATIC SMS WARNING
  // ============================================================
  // Generates an automatic warning message based on the
  // current water-level status.
  //
  // CRITICAL:
  // Sends an evacuation warning.
  //
  // WARNING:
  // Sends a monitoring and safety warning.
  // ============================================================

  function sendAutomaticSms(st, v) {
    const levelText = formatMeters(v);

    const message = st.key === 'critical'
      ? `FLOODGUARD EVACUATE: Bilog Falls water level is ${levelText}. Evacuate the falls area and follow MDRRMO instructions.`
      : `FLOODGUARD WARNING: Bilog Falls water level is ${levelText}. Avoid the water's edge and monitor official updates.`;

    fireChannel(
      'chanSMS',
      'chanSMSState',
      'sent · 184 recipients',
      1400
    );

    uiApi.toast(
      'Automatic SMS response sent: ' + message
    );
  }


  // ============================================================
  // 7. RECORD FLOOD ALERT IN ALERT LOG
  // ============================================================
  // Records the detected alert and displays it in:
  // - Main Alert Log
  // - Mini Alert Log
  //
  // Also records:
  // - Time
  // - Water level
  // - Alert status
  // - Possible cause
  // - Communication channels
  // - Delivery time
  // ============================================================

  function logAlert(st, v) {
    const time = new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date());

    const chanHTML = `
      <span class="chan sent">🖥️ Dashboard</span>
      ${st.key !== 'normal'
        ? '<span class="chan sent">✉️ Auto SMS</span>'
        : ''}
      ${st.key === 'critical'
        ? '<span class="chan sent">🔊 Siren</span>'
        : ''}
    `;

    const chip = `
      <span
        class="lvl-chip"
        style="
          background:${st.color}22;
          color:${st.color};
          border:1px solid ${st.color}66
        "
      >
        ${st.name}
      </span>
    `;

    const body = $('alertLogBody');

    const empty1 = body.querySelector('.empty-row');

    if (empty1) {
      empty1.remove();
    }

    const causeHTML = state.currentCause
      ? `<span class="cause-chip">${state.currentCause.icon} ${state.currentCause.label}</span>`
      : '<span class="cause-chip" style="opacity:0.6">— baseline —</span>';

    state.alertIdCounter++;

    const deliveryLabel =
      'Delivered · ' +
      (2 + Math.random() * 2).toFixed(1) +
      's';

    const tr = document.createElement('tr');

    tr.className = 'fade-in';

    tr.innerHTML = `
      <td style="font-family:'Roboto Mono',monospace">
        ${time}
      </td>
      <td style="font-family:'Roboto Mono',monospace">
        ${formatMeters(v)}
      </td>
      <td>${chip}</td>
      <td>${causeHTML}</td>
      <td>${chanHTML}</td>
      <td style="color:#31c48d">
        ${deliveryLabel}
      </td>
    `;

    body.prepend(tr);

    while (body.children.length > 60) {
      body.removeChild(body.lastChild);
    }

    state.alertLog.unshift({
      id: state.alertIdCounter,
      time,
      levelCm: Number(v.toFixed(1)),
      statusKey: st.key,
      statusName: st.name,
      cause: state.currentCause
        ? state.currentCause.label
        : null,
      delivery: deliveryLabel
    });

    if (state.alertLog.length > 200) {
      state.alertLog.length = 200;
    }

    const mini = $('miniAlertBody');

    const empty2 = mini.querySelector('.empty-row');

    if (empty2) {
      empty2.remove();
    }

    const tr2 = document.createElement('tr');

    tr2.className = 'fade-in';

    tr2.innerHTML = `
      <td style="font-family:'Roboto Mono',monospace">
        ${time}
      </td>
      <td style="font-family:'Roboto Mono',monospace">
        ${formatMeters(v)}
      </td>
      <td>${chip}</td>
    `;

    mini.prepend(tr2);

    while (mini.children.length > 4) {
      mini.removeChild(mini.lastChild);
    }

    state.alertsToday++;

    $('alertCountStat').textContent =
      state.alertsToday;

    $('latencyStat').textContent =
      (2 + Math.random() * 2).toFixed(1) + 's';

    if (state.currentUser) {
      uiApi.renderDecisionSupport();
    }
  }


  // ============================================================
  // 8. CONTROL CRITICAL FLOOD ALARM
  // ============================================================
  // Activates or deactivates the critical flood alarm.
  //
  // When activated:
  // - Shows the critical overlay
  // - Starts the alarm sound
  // - Repeats the alarm every 1.2 seconds
  // ============================================================

  function setCriticalAlarm(active) {
    $('criticalOverlay').classList.toggle('on', active);

    if (active && !state.alarmInterval) {
      ensureAudioCtx();
      playAlarmBeep();

      state.alarmInterval =
        setInterval(playAlarmBeep, 1200);

    } else if (!active && state.alarmInterval) {
      clearInterval(state.alarmInterval);
      state.alarmInterval = null;
    }
  }


  // ============================================================
  // 9. INITIALIZE AUDIO SYSTEM
  // ============================================================
  // Creates the browser AudioContext needed to play the
  // emergency alarm.
  // ============================================================

  function ensureAudioCtx() {
    if (!state.audioCtx) {
      try {
        state.audioCtx =
          new (
            window.AudioContext ||
            window.webkitAudioContext
          )();
      } catch (e) {
        state.audioCtx = null;
      }
    }

    if (
      state.audioCtx &&
      state.audioCtx.state === 'suspended'
    ) {
      state.audioCtx
        .resume()
        .catch(() => {});
    }

    return state.audioCtx;
  }


  // ============================================================
  // 10. PLAY EMERGENCY ALARM SOUND
  // ============================================================
  // Generates the audible emergency siren using the Web Audio API.
  // Uses two different frequencies to create the warning sound.
  // ============================================================

  function playAlarmBeep() {
    const ctx = ensureAudioCtx();

    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;

    [0, 0.28].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';

      osc.frequency.setValueAtTime(
        i === 0 ? 880 : 660,
        now + offset
      );

      gain.gain.setValueAtTime(
        0.0001,
        now + offset
      );

      gain.gain.exponentialRampToValueAtTime(
        0.22,
        now + offset + 0.02
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + offset + 0.24
      );

      osc
        .connect(gain)
        .connect(ctx.destination);

      osc.start(now + offset);
      osc.stop(now + offset + 0.26);
    });
  }


  // ============================================================
  // 11. REBUILD ALERT LOG TABLE
  // ============================================================
  // Recreates the alert history tables from stored alert data.
  //
  // Used when:
  // - The dashboard is refreshed
  // - Alert history needs to be displayed again
  // - Stored alert data changes
  // ============================================================

  function rebuildAlertLogTable() {
    const body = $('alertLogBody');
    const mini = $('miniAlertBody');

    body.innerHTML = '';
    mini.innerHTML = '';

    if (state.alertLog.length === 0) {
      body.innerHTML =
        '<tr class="empty-row"><td colspan="6">No alerts logged yet — water level is within normal range.</td></tr>';

      mini.innerHTML =
        '<tr class="empty-row"><td colspan="3">No alerts yet — water level normal.</td></tr>';

      return;
    }

    state.alertLog.forEach((a) => {
      const st =
        config.THRESHOLDS.find(
          (t) => t.key === a.statusKey
        ) || config.THRESHOLDS[0];

      const chip = `
        <span
          class="lvl-chip"
          style="
            background:${st.color}22;
            color:${st.color};
            border:1px solid ${st.color}66
          "
        >
          ${a.statusName}
        </span>
      `;

      const causeHTML = a.cause
        ? `<span class="cause-chip">${a.cause}</span>`
        : '<span class="cause-chip" style="opacity:0.6">— baseline —</span>';

      const chanHTML =
        `<span class="chan sent">🖥️ Dashboard</span>` +
        (a.statusKey !== 'normal'
          ? '<span class="chan sent">✉️ Auto SMS</span>'
          : '') +
        (a.statusKey === 'critical'
          ? '<span class="chan sent">🔊 Siren</span>'
          : '');

      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td style="font-family:'Roboto Mono',monospace">
          ${a.time}
        </td>
        <td style="font-family:'Roboto Mono',monospace">
          ${formatMeters(a.levelCm)}
        </td>
        <td>${chip}</td>
        <td>${causeHTML}</td>
        <td>${chanHTML}</td>
        <td style="color:#31c48d">
          ${a.delivery}
        </td>
      `;

      body.appendChild(tr);
    });

    state.alertLog
      .slice(0, 4)
      .forEach((a) => {
        const st =
          config.THRESHOLDS.find(
            (t) => t.key === a.statusKey
          ) || config.THRESHOLDS[0];

        const chip = `
          <span
            class="lvl-chip"
            style="
              background:${st.color}22;
              color:${st.color};
              border:1px solid ${st.color}66
            "
          >
            ${a.statusName}
          </span>
        `;

        const tr2 = document.createElement('tr');

        tr2.innerHTML = `
          <td style="font-family:'Roboto Mono',monospace">
            ${a.time}
          </td>
          <td style="font-family:'Roboto Mono',monospace">
            ${formatMeters(a.levelCm)}
          </td>
          <td>${chip}</td>
        `;

        mini.appendChild(tr2);
      });
  }


  // ============================================================
  // 12. UPDATE BACKUP STATUS
  // ============================================================
  // Updates the status message of the backup/data-saving section.
  // ============================================================

  function setBackupStatus(msg, cls) {
    const el = $('backupStatus');

    el.textContent = msg;

    el.className =
      'backup-status' +
      (cls ? ' ' + cls : '');
  }


  // ============================================================
  // 13. USER LOGIN AND ROLE-BASED DASHBOARD
  // ============================================================
  // Handles the login transition and configures the dashboard
  // according to the logged-in user's role.
  //
  // Roles include:
  // - MDRRMO
  // - Barangay
  // ============================================================

  function doLogin() {
    $('loginScreen').style.display = 'none';

    $('appShell').classList.add('active');

    const barangayUser =
      state.currentUser.roleKey === 'barangay';

    $('sidebarMenu')
      .classList
      .toggle('barangay-user', barangayUser);

    $('view-dashboard')
      .classList
      .toggle('barangay-dashboard', barangayUser);

    document
      .querySelectorAll(
        '.nav-btn[data-view="historical"], .nav-btn[data-view="reports"]'
      )
      .forEach((button) => {
        button.hidden = barangayUser;
      });

    $('userAvatar').textContent =
      initials(state.currentUser.name);

    $('userName').textContent =
      state.currentUser.name;

    $('userRole').textContent =
      state.currentUser.role;

    uiApi.renderForecast();
    uiApi.renderDecisionSupport();
    uiApi.showView('dashboard');

    renderHero();

    uiApi.toast(
      'Welcome, ' +
      state.currentUser.name.split(' ')[0] +
      '.'
    );
  }


  // ============================================================
  // 14. RENDER ROLE-BASED DASHBOARD HERO
  // ============================================================
  // Displays different dashboard content depending on the
  // logged-in user's role.
  //
  // MDRRMO:
  // Displays municipal-wide flood monitoring information.
  //
  // Barangay:
  // Loads the Barangay dashboard module.
  // ============================================================

  function renderHero() {
    const box = $('roleHero');

    const activeAlerts =
      state.alertsToday > 0 &&
      state.lastStatusKey !== 'normal'
        ? 1
        : 0;

    if (state.currentUser.roleKey === 'mdrrmo') {
      box.innerHTML = `
        <div class="role-hero mdrrmo">

          <div class="eyebrow">
            Municipal Disaster Risk Reduction &amp; Management Office
          </div>

          <h1>Lagonoy Operations Console</h1>

          <p>
            Municipal-wide view of flood monitoring stations,
            response coordination, and disaster preparedness
            for Lagonoy, Camarines Sur.
          </p>

          <div class="hero-stats">

            <div class="hstat">
              <div class="k">Stations monitored</div>
              <div class="v">1 / 1</div>
            </div>

            <div class="hstat">
              <div class="k">Barangays covered</div>
              <div class="v">Cabotonan</div>
            </div>

            <div class="hstat">
              <div class="k">Active alerts</div>
              <div
                class="v"
                style="color:${
                  activeAlerts
                    ? '#e8563f'
                    : '#31c48d'
                }"
              >
                ${activeAlerts}
              </div>
            </div>

          </div>

          <div class="hero-actions">

            <button
              class="primary btn-with-icon"
              id="btnAlertLogs"
            >
              <svg
                class="icon-svg"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M6 16h12"/>
                <path d="M8 16V9a4 4 0 0 1 8 0v7"/>
                <path d="M10 18a2 2 0 0 0 4 0"/>
              </svg>
              Review alert logs
            </button>

            <button
              class="btn-with-icon"
              id="btnReadingHistory"
            >
              <svg
                class="icon-svg"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="8"
                />
                <path d="M12 7v5l3 2"/>
              </svg>
              View reading history
            </button>

            <button
              class="gold btn-with-icon"
              id="btnHeroReport"
            >
              <svg
                class="icon-svg"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M7 3h7l4 4v14H7z"/>
                <path d="M14 3v5h5"/>
                <path d="M9 13h6"/>
                <path d="M9 17h4"/>
              </svg>
              Generate data report
            </button>

          </div>
        </div>
      `;

      $('btnAlertLogs')
        .addEventListener(
          'click',
          () => uiApi.showView('alerts')
        );

      $('btnReadingHistory')
        .addEventListener(
          'click',
          () => uiApi.showView('historical')
        );

      $('btnHeroReport')
        .addEventListener(
          'click',
          () => uiApi.showView('reports')
        );

    } else if (window.FloodGuardBarangay) {

      window.FloodGuardBarangay.render({
        box,
        currentUser: state.currentUser,
        lastSeasonInfo: state.lastSeasonInfo,
        toast: uiApi.toast
      });

    } else {

      box.innerHTML = `
        <div class="role-hero barangay">
          <div class="eyebrow">
            Barangay Cabotonan
          </div>

          <h1>
            Barangay dashboard unavailable
          </h1>

          <p>
            barangay.js did not load — check that it is
            included in index.html before script.js.
          </p>
        </div>
      `;

      console.error(
        'FloodGuard: window.FloodGuardBarangay is missing. Is barangay.js included before script.js in index.html?'
      );
    }
  }


  // ============================================================
  // 15. CHECK SENSOR CONNECTION STATUS
  // ============================================================
  // Checks whether the water-level sensor is connected.
  //
  // ONLINE:
  // The sensor is connected and available.
  //
  // OFFLINE:
  // The sensor is disconnected or unavailable.
  // ============================================================

  function updateSensorStatus() {
    const connPill = $('connPill');
    const connText = $('connText');

    if (!connPill || !connText) {
      return;
    }

    const isConnected = state.sensorDevice.connected;
    const delayed = state.realtimeTelemetryActive && state.lastTelemetryAt
      && Date.now() - state.lastTelemetryAt > 2 * 60 * 1000
      && Date.now() - state.lastTelemetryAt <= 5 * 60 * 1000;

    if (delayed) {
      connPill.classList.remove('offline');
      connText.textContent = 'SENSOR DELAYED';
    } else if (isConnected) {
      connPill.classList.remove('offline');
      connText.textContent = 'SENSOR ONLINE';

    } else {
      connPill.classList.add('offline');
      connText.textContent = 'SENSOR OFFLINE';
    }
  }


  // ============================================================
  // 16. EXPORT FUNCTIONS TO THE FLOODGUARD SYSTEM
  // ============================================================
  // Makes selected functions available to other FloodGuard
  // JavaScript modules.
  // ============================================================

  return {
    renderHero,
    doLogin,
    fireChannel,
    resetChannels,
    sendAutomaticSms,
    logAlert,
    setCriticalAlarm,
    setBackupStatus,
    rebuildAlertLogTable,
    updateMeta,
    updateBadge,
    updateSensorStatus
  };

})();
