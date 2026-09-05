function positiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** All safety-relevant values are server configuration, never browser controls. */
export const runtimeConfig = {
  deviceId: process.env.DEVICE_ID ?? 'FG-001',
  warningCm: nonNegativeNumber('WARNING_CM', 75),
  evacuateCm: nonNegativeNumber('EVACUATE_CM', 150),
  maxLevelCm: positiveInteger('MAX_LEVEL_CM', 200),
  hysteresisCm: nonNegativeNumber('ALERT_HYSTERESIS_CM', 5),
  confirmationReadings: positiveInteger('ALERT_CONFIRMATION_READINGS', 3),
  sirenDurationMs: positiveInteger('SIREN_DURATION_SECONDS', 120) * 1_000,
  offlineAfterMs: positiveInteger('DEVICE_OFFLINE_AFTER_SECONDS', 300) * 1_000,
  requestLimitPerMinute: positiveInteger('DEVICE_REQUESTS_PER_MINUTE', 30),
};

if (runtimeConfig.warningCm >= runtimeConfig.evacuateCm) {
  throw new Error('WARNING_CM must be lower than EVACUATE_CM.');
}
