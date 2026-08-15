/**
 * ============================================================
 * APP-CONFIG.JS
 * Configuration and constants module
 * Defines thresholds, causes, decision matrix, and UI labels
 * ============================================================
 */

window.FloodGuardConfig = {
  THRESHOLDS: [
    { key: 'normal', name: 'Normal', min: 0, color: '#31c48d', desc: 'No action needed' },
    { key: 'alert', name: 'Warning', min: 75, color: '#f5a623', desc: 'Use caution, restrict water-edge access, notify MDRRMO' },
    { key: 'critical', name: 'Evacuate', min: 150, color: '#e8563f', desc: 'Evacuate the falls area — sound siren and send automatic SMS' }
  ],
  TUBE_MAX_CM: 200,
  formatMeters(centimeters, decimals = 2) {
    return `${(centimeters / 100).toFixed(decimals)} m`;
  },
  CAUSES: [
    {
      key: 'local',
      label: 'Intense Surface Runoff',
      icon: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 15c0-2.2 1.8-4 4-4 1.4 0 2.6.7 3.3 1.8"/><path d="M6 18c1.2-1.6 2.5-2.3 4.3-2.3"/><path d="M13 17c1.1-1.1 1.9-1.7 3.4-2"/></svg>',
      origin: 'Immediate watershed area',
      desc: 'The water level is rising quickly in the immediate watershed, suggesting surface runoff is entering the falls channel faster than normal. This should be checked against field conditions and drainage obstructions.',
      up: [5, 20],
      loc: [65, 100]
    },
    {
      key: 'blockage',
      label: 'Possible Debris / Channel Blockage',
      icon: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14"/><path d="M8 8V6h8v2"/><path d="M9 8v8a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V8"/><path d="M7 18h10"/></svg>',
      origin: 'Downstream channel near the falls',
      desc: 'The rate of rise is outpacing what current rainfall readings alone would predict. This pattern is consistent with a partial blockage — fallen debris, siltation, or vegetation restricting outflow near the falls — and should be visually verified on-site.',
      up: [15, 35],
      loc: [10, 30]
    }
  ],
  VIEW_LABELS: {
    dashboard: 'Dashboard',
    historical: 'Historical Records',
    alerts: 'Alert Logs',
    users: 'Manage Users',
    sensors: 'Sensor Management',
    reports: 'Generate Reports'
  },
  DECISION_MATRIX: {
    normal: {
      mdrrmo: ['Continue routine monitoring of the Bilog Falls sensor feed.', 'No dispatch or municipal advisory action required at this time.'],
      barangay: ['Continue routine advisory to residents and visitors.', 'No evacuation or site-closure action required at this time.']
    },
    alert: {
      mdrrmo: ['Notify Barangay Cabotonan officials that water level has reached Warning.', 'Place the response team on standby.', 'Monitor the local rain gauge and water-level trend for confirmation.'],
      barangay: ['Alert on-duty barangay tanods stationed near the falls.', 'Advise hikers and swimmers to stay clear of the water’s edge.', 'Relay updates to MDRRMO if the level continues to rise.']
    },
    critical: {
      mdrrmo: ['Dispatch the response team to Bilog Falls immediately.', 'Send the automatic evacuation SMS to all registered residents.', 'Close the access trail and post personnel to prevent entry.', 'Confirm with barangay officials that all visitors have evacuated the site.'],
      barangay: ['Confirm the on-site siren has sounded and is audible at the falls.', 'Direct all hikers and swimmers to evacuate the water area immediately.', 'Move residents and visitors to higher ground.', 'Report evacuation status back to MDRRMO Lagonoy.']
    }
  },
  WMO: {
    0: ['☀️', 'Clear sky'],
    1: ['🌤️', 'Mainly clear'],
    2: ['⛅', 'Partly cloudy'],
    3: ['☁️', 'Overcast'],
    45: ['🌫️', 'Fog'],
    48: ['🌫️', 'Depositing rime fog'],
    51: ['🌦️', 'Light drizzle'],
    53: ['🌦️', 'Drizzle'],
    55: ['🌧️', 'Dense drizzle'],
    61: ['🌦️', 'Light rain'],
    63: ['🌧️', 'Rain'],
    65: ['🌧️', 'Heavy rain'],
    66: ['🌧️', 'Freezing rain'],
    67: ['🌧️', 'Heavy freezing rain'],
    71: ['🌨️', 'Light snow'],
    73: ['🌨️', 'Snow'],
    75: ['❄️', 'Heavy snow'],
    80: ['🌦️', 'Light showers'],
    81: ['🌧️', 'Showers'],
    82: ['⛈️', 'Violent showers'],
    95: ['⛈️', 'Thunderstorm'],
    96: ['⛈️', 'Thunderstorm, hail'],
    99: ['⛈️', 'Severe thunderstorm, hail']
  }
};
