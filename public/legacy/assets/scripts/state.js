/**
 * ============================================================
 * APP-STATE.JS
 * State management module
 * Manages application state, history, users, and data persistence
 * ============================================================
 */

window.FloodGuardState = (() => {
  const config = window.FloodGuardConfig || { THRESHOLDS: [], TUBE_MAX_CM: 200, formatMeters: (v) => `${v} m` };
  const $ = (id) => document.getElementById(id);

  const state = {
    level: 32,
    target: 32,
    wavePhase: 0,
    history: [],
    currentCause: null,
    rainLoc: 2,
    rainLocT: 2,
    alertsToday: 0,
    lastStatusKey: 'normal',
    currentUser: null,
    alertIdCounter: 0,
    alertLog: [],
    lastSeasonInfo: null,
    selectedRole: 'mdrrmo',
    liveTelemetryActive: false,
    telemetrySyncing: false,
    lastTelemetryAt: 0,
    sensorDevice: {
      connected: false,
      port: null,
      reader: null,
      writer: null,
      lastConnectionAt: null,
      battery: '—',
      signal: '—'
    },
    alarmInterval: null,
    audioCtx: null,
    visibleHistoryRows: 10,
    users: [
      { name: 'Nick Pempeña I', role: 'MDRRMO Personnel', area: 'MDRRMO Lagonoy', status: 'Active' },
      { name: 'John Kendric Pahoyo', role: 'MDRRMO Personnel', area: 'MDRRMO Lagonoy', status: 'Active' },
      { name: 'Rica Rose Vipinoso', role: 'Barangay Official', area: 'Barangay Cabotonan', status: 'Active' },
      { name: 'Maria Santos', role: 'Barangay Official', area: 'Barangay Cabotonan', status: 'Active' }
    ]
  };

  function seedHistory() {
    const now = Date.now();
    state.history = [];
    for (let i = 19; i >= 0; i--) {
      state.history.push({ t: now - i * 180000, v: 30 + Math.sin(i / 4) * 4 + Math.random() * 3 });
    }
  }

  function randRange(a, b) { return a + Math.random() * (b - a); }

  function statusForLevel(v) {
    let status = config.THRESHOLDS[0];
    for (const t of config.THRESHOLDS) {
      if (v >= t.min) status = t;
    }
    return status;
  }

  function formatMeters(value, decimals = 2) {
    return config.formatMeters(value, decimals);
  }

  function pickCause() {
    const localCauses = config.CAUSES;
    state.currentCause = localCauses[Math.floor(Math.random() * localCauses.length)];
    state.rainLocT = randRange(state.currentCause.loc[0], state.currentCause.loc[1]);
  }

  function clearCause() {
    state.currentCause = null;
    state.rainLocT = 2 + Math.random() * 4;
  }

  function initials(name) {
    return name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');
  }

  function isBlockedUser(name) {
    return state.users.some((user) => user.name.trim().toLowerCase() === name.trim().toLowerCase() && user.status === 'Blocked');
  }

  function buildBackupPayload() {
    return {
      app: 'FloodGuard',
      version: 1,
      exportedAt: new Date().toISOString(),
      state: {
        level: state.level,
        target: state.target,
        lastStatusKey: state.lastStatusKey,
        alertsToday: state.alertsToday,
        alertIdCounter: state.alertIdCounter,
        history: state.history,
        alertLog: state.alertLog,
        thresholds: config.THRESHOLDS.map((t) => ({ key: t.key, min: t.min })),
        rainLoc: state.rainLoc,
        currentCauseKey: state.currentCause ? state.currentCause.key : null,
        users: state.users
      }
    };
  }

  function computeForecast() {
    const N = Math.min(10, state.history.length);
    if (N < 4) return null;
    const pts = state.history.slice(-N);
    const t0 = pts[0].t;
    const xs = pts.map((p) => (p.t - t0) / 60000);
    const ys = pts.map((p) => p.v);
    const n = xs.length;
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const sumXX = xs.reduce((a, x) => a + x * x, 0);
    const denom = (n * sumXX - sumX * sumX);
    const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    return { slopeCmPerMin: slope, windowSize: n };
  }

  seedHistory();

  return {
    state,
    $,
    randRange,
    statusForLevel,
    formatMeters,
    pickCause,
    clearCause,
    initials,
    isBlockedUser,
    buildBackupPayload,
    computeForecast,
    seedHistory
  };
})();
