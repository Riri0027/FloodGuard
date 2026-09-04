/**
 * ============================================================
 * APP-STATE.JS
 * State Management Module
 *
 * RELATED / CONNECTED TO:
 * - FloodGuard Dashboard
 * - Water-Level Monitoring
 * - Flood Alert System
 * - Sensor/IoT Telemetry
 * - User Session Management
 * - Alert History
 * - Data Backup and Forecasting
 * ============================================================
 */

window.FloodGuardState = (() => {

  /**
   * ------------------------------------------------------------
   * RELATED TO: SYSTEM CONFIGURATION
   * Connected to: config.js
   *
   * Retrieves system thresholds, causes, tube maximum,
   * and meter-formatting configuration.
   * ------------------------------------------------------------
   */
  const config = window.FloodGuardConfig || {
    THRESHOLDS: [],
    TUBE_MAX_CM: 200,
    formatMeters: (v) => `${v} m`
  };


  /**
   * ------------------------------------------------------------
   * RELATED TO: DOM / USER INTERFACE
   *
   * Used to locate HTML elements by their ID.
   * Connected to:
   * - Dashboard UI
   * - Monitoring page
   * - Alert interface
   * ------------------------------------------------------------
   */
  const $ = (id) => document.getElementById(id);


  /**
   * ============================================================
   * RELATED TO: GLOBAL APPLICATION STATE
   *
   * Stores the current operating condition of FloodGuard.
   *
   * Connected to:
   * - Water-level monitoring
   * - Flood status
   * - Alert monitoring
   * - User login/session
   * - IoT sensor connection
   * - Telemetry
   * - Alarm system
   * - History records
   * ============================================================
   */
  const state = {

    /**
     * RELATED TO: WATER-LEVEL MONITORING
     */
    level: 32,
    target: 32,
    wavePhase: 0,

    /**
     * RELATED TO: WATER-LEVEL HISTORY
     * Stores previous water-level readings.
     */
    history: [],

    /**
     * RELATED TO: FLOOD CAUSE / WEATHER CONDITION
     */
    currentCause: null,

    /**
     * RELATED TO: RAINFALL / LOCATION MONITORING
     */
    rainLoc: 2,
    rainLocT: 2,

    /**
     * RELATED TO: FLOOD ALERT SYSTEM
     */
    alertsToday: 0,
    lastStatusKey: 'normal',

    /**
     * RELATED TO: USER LOGIN / ROLE-BASED ACCESS
     *
     * Used to identify the currently logged-in user.
     */
    currentUser: null,
    selectedRole: 'mdrrmo',

    /**
     * RELATED TO: ALERT RECORD MANAGEMENT
     */
    alertIdCounter: 0,
    alertLog: [],

    /**
     * RELATED TO: SEASONAL / WEATHER INFORMATION
     */
    lastSeasonInfo: null,

    /**
     * RELATED TO: LIVE SENSOR TELEMETRY
     */
    liveTelemetryActive: false,
    realtimeTelemetryActive: false,
    demoMode: false,
    hasVerifiedLiveReading: false,
    lastRealtimeLevel: null,
    telemetrySyncing: false,
    lastTelemetryAt: 0,
    lastTelemetryPublishAt: 0,

    /**
     * ========================================================
     * RELATED TO: IoT FLOOD SENSOR DEVICE
     *
     * Connected to:
     * - ESP32 / Arduino sensor
     * - Water-level sensor
     * - Serial communication
     * - Battery monitoring
     * - Signal monitoring
     * ========================================================
     */
    sensorDevice: {
      connected: false,
      port: null,
      reader: null,
      writer: null,
      lastConnectionAt: null,
      battery: '—',
      signal: '—'
    },

    /**
     * RELATED TO: FLOOD ALARM / SIREN SYSTEM
     *
     * Stores the alarm interval used by the application.
     */
    alarmInterval: null,

    /**
     * RELATED TO: AUDIO ALERT
     *
     * Used for warning/alarm sounds.
     */
    audioCtx: null,

    /**
     * RELATED TO: HISTORY DISPLAY
     *
     * Determines how many historical readings are
     * initially displayed in the dashboard.
     */
    visibleHistoryRows: 10
  };


  /**
   * ============================================================
   * RELATED TO: WATER-LEVEL HISTORY / GRAPH
   *
   * Creates initial sample water-level records.
   *
   * Connected to:
   * - Water-level chart
   * - Historical monitoring
   * - Dashboard graph
   * - Forecasting
   * ============================================================
   */
  function seedHistory() {

    const now = Date.now();

    state.history = [];

    for (let i = 19; i >= 0; i--) {

      state.history.push({
        t: now - i * 180000,
        v: 30 + Math.sin(i / 4) * 4 + Math.random() * 3
      });

    }
  }


  /**
   * ============================================================
   * RELATED TO: SENSOR DATA SIMULATION
   *
   * Generates a random value between two numbers.
   *
   * Connected to:
   * - Simulated sensor readings
   * - Rainfall simulation
   * - Testing FloodGuard without physical hardware
   * ============================================================
   */
  function randRange(a, b) {
    return a + Math.random() * (b - a);
  }


  /**
   * ============================================================
   * RELATED TO: FLOOD RISK / WATER-LEVEL CLASSIFICATION
   *
   * Determines the current flood status based on
   * configured water-level thresholds.
   *
   * Connected to:
   * - Normal status
   * - Warning status
   * - Critical status
   * - Flood alerts
   * - Dashboard indicators
   * ============================================================
   */
  function statusForLevel(v) {

    let status = config.THRESHOLDS[0];

    for (const t of config.THRESHOLDS) {

      if (v >= t.min) {
        status = t;
      }

    }

    return status;
  }


  /**
   * ============================================================
   * RELATED TO: WATER-LEVEL DISPLAY
   *
   * Converts the water-level value into the configured
   * meter format.
   *
   * Connected to:
   * - Dashboard water-level indicator
   * - Monitoring display
   * - Reports
   * ============================================================
   */
  function formatMeters(value, decimals = 2) {
    return config.formatMeters(value, decimals);
  }


  /**
   * ============================================================
   * RELATED TO: FLOOD CAUSE / WEATHER EVENT MONITORING
   *
   * Selects a possible local cause of increasing water level.
   *
   * Connected to:
   * - Heavy rainfall
   * - Weather conditions
   * - Flood cause indicator
   * - Monitoring dashboard
   * ============================================================
   */
  function pickCause() {

    const localCauses = config.CAUSES;

    state.currentCause =
      localCauses[Math.floor(Math.random() * localCauses.length)];

    state.rainLocT = randRange(
      state.currentCause.loc[0],
      state.currentCause.loc[1]
    );
  }


  /**
   * ============================================================
   * RELATED TO: FLOOD CAUSE RESET
   *
   * Clears the currently detected flood/weather cause.
   *
   * Connected to:
   * - Monitoring reset
   * - Normal system condition
   * ============================================================
   */
  function clearCause() {

    state.currentCause = null;

    state.rainLocT = 2 + Math.random() * 4;
  }


  /**
   * ============================================================
   * RELATED TO: USER PROFILE / ROLE DISPLAY
   *
   * Generates initials from the user's name.
   *
   * Connected to:
   * - User profile
   * - MDRRMO account
   * - Barangay official account
   * - Dashboard header
   * ============================================================
   */
  function initials(name) {

    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0].toUpperCase())
      .join('');
  }


  /**
   * ============================================================
   * RELATED TO: DATA BACKUP / DATA EXPORT
   *
   * Collects important FloodGuard data into one object
   * for backup or export.
   *
   * Connected to:
   * - Water-level records
   * - Alert records
   * - Flood thresholds
   * - Rainfall/location information
   * - System backup
   * ============================================================
   */
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

        thresholds: config.THRESHOLDS.map((t) => ({
          key: t.key,
          min: t.min
        })),

        rainLoc: state.rainLoc,

        currentCauseKey:
          state.currentCause
            ? state.currentCause.key
            : null
      }
    };
  }


  /**
   * ============================================================
   * RELATED TO: FLOOD LEVEL FORECASTING / TREND ANALYSIS
   *
   * Calculates the trend of water-level changes using
   * historical sensor readings.
   *
   * Connected to:
   * - Water-level history
   * - Flood trend analysis
   * - Early warning
   * - Predictive monitoring
   * ============================================================
   */
  function computeForecast() {

    const N = Math.min(10, state.history.length);

    /**
     * Not enough historical data for forecasting.
     */
    if (N < 4) return null;

    const pts = state.history.slice(-N);

    const t0 = pts[0].t;

    /**
     * Converts timestamps to minutes.
     */
    const xs = pts.map(
      (p) => (p.t - t0) / 60000
    );

    /**
     * Gets water-level values.
     */
    const ys = pts.map(
      (p) => p.v
    );

    const n = xs.length;

    /**
     * Calculate values required for linear regression.
     */
    const sumX = xs.reduce(
      (a, b) => a + b,
      0
    );

    const sumY = ys.reduce(
      (a, b) => a + b,
      0
    );

    const sumXY = xs.reduce(
      (a, x, i) => a + x * ys[i],
      0
    );

    const sumXX = xs.reduce(
      (a, x) => a + x * x,
      0
    );

    const denom =
      (n * sumXX - sumX * sumX);

    const slope =
      denom !== 0
        ? (n * sumXY - sumX * sumY) / denom
        : 0;

    return {
      slopeCmPerMin: slope,
      windowSize: n
    };
  }


  /**
   * ============================================================
   * RELATED TO: INITIAL SYSTEM DATA
   *
   * Creates the initial water-level history when
   * FloodGuard starts.
   * ============================================================
   */
  /**
   * ============================================================
   * RELATED TO: MODULE EXPORT / OTHER JAVASCRIPT FILES
   *
   * Makes the state and functions available to other
   * FloodGuard JavaScript modules.
   *
   * Connected to:
   * - Dashboard.js
   * - Sensor/Telemetry.js
   * - Alert.js
   * - Charts.js
   * - Login/User modules
   * ============================================================
   */
  return {

    state,
    $,
    randRange,
    statusForLevel,
    formatMeters,
    pickCause,
    clearCause,
    initials,
    buildBackupPayload,
    computeForecast,
    seedHistory

  };

})();
