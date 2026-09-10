import { NextRequest, NextResponse } from 'next/server';
import { deliverPendingAlert } from '../../lib/alert-delivery';
import { firebaseAdminDatabase } from '../../lib/firebase-admin';
import { runtimeConfig } from '../../lib/runtime-config';

export const runtime = 'nodejs';
type AlertStatus = 'normal' | 'watch' | 'warning' | 'evacuate';
const requests = new Map<string, number[]>();

function statusFor(levelCm: number, previous: AlertStatus): AlertStatus {
  const { warningCm, evacuateCm, hysteresisCm } = runtimeConfig;
  if (previous === 'evacuate' && levelCm >= evacuateCm - hysteresisCm) return 'evacuate';
  if (previous === 'warning' && levelCm >= warningCm - hysteresisCm && levelCm < evacuateCm) return 'warning';
  if (levelCm >= evacuateCm) return 'evacuate';
  if (levelCm >= warningCm) return 'warning';
  return 'normal';
}

function isRateLimited(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const now = Date.now();
  const recent = (requests.get(ip) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= runtimeConfig.requestLimitPerMinute) return true;
  recent.push(now); requests.set(ip, recent);
  return false;
}

/** Uses only timestamped upstream measurements; it never invents a trend from a single reading. */
async function upstreamTrend(db: ReturnType<typeof firebaseAdminDatabase>, deviceId: string, levelCm: number, recordedAt: number) {
  const required = runtimeConfig.upstreamTrendReadings;
  const snapshot = await db.ref(`telemetry/${deviceId}`).orderByChild('recordedAt').limitToLast(Math.max(1, required - 1)).get();
  const previous = Object.values(snapshot.val() ?? {}) as Array<{ levelCm?: unknown; recordedAt?: unknown }>;
  const points = [...previous, { levelCm, recordedAt }]
    .map((reading) => ({ levelCm: Number(reading.levelCm), recordedAt: Number(reading.recordedAt) }))
    .filter((reading) => Number.isFinite(reading.levelCm) && Number.isFinite(reading.recordedAt))
    .sort((a, b) => a.recordedAt - b.recordedAt);
  if (points.length < required) return null;

  const firstAt = points[0].recordedAt;
  const xs = points.map((point) => (point.recordedAt - firstAt) / 60_000);
  const ys = points.map((point) => point.levelCm);
  const n = points.length;
  const sumX = xs.reduce((total, value) => total + value, 0);
  const sumY = ys.reduce((total, value) => total + value, 0);
  const sumXY = xs.reduce((total, value, index) => total + value * ys[index], 0);
  const sumXX = xs.reduce((total, value) => total + value * value, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (!denominator) return null;
  return { slopeCmPerMin: (n * sumXY - sumX * sumY) / denominator, samples: n };
}

export async function POST(request: NextRequest) {
  if (!process.env.DEVICE_INGEST_KEY || request.headers.get('x-device-key') !== process.env.DEVICE_INGEST_KEY) return NextResponse.json({ error: 'Unauthorized device.' }, { status: 401 });
  if (isRateLimited(request)) return NextResponse.json({ error: 'Too many telemetry requests.' }, { status: 429 });
  let payload: Record<string, unknown>;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Body must be valid JSON.' }, { status: 400 }); }
  const deviceId = String(payload.deviceId ?? '');
  const levelCm = Number(payload.levelCm);
  const isLocalDevice = deviceId === runtimeConfig.deviceId;
  const isUpstreamDevice = Boolean(runtimeConfig.upstreamDeviceId) && deviceId === runtimeConfig.upstreamDeviceId;
  if ((!isLocalDevice && !isUpstreamDevice) || !Number.isFinite(levelCm) || levelCm < 0 || levelCm > runtimeConfig.maxLevelCm) return NextResponse.json({ error: 'Invalid telemetry payload.' }, { status: 400 });

  try {
    const now = Date.now();
    const requestId = crypto.randomUUID();
    const db = firebaseAdminDatabase();
    const trend = isUpstreamDevice ? await upstreamTrend(db, deviceId, levelCm, now) : null;
    const deviceRef = db.ref(`devices/${deviceId}`);
    const result = await deviceRef.transaction((existing: Record<string, any> | null) => {
      const old = existing ?? {};
      const oldAlert = old.alert ?? {};
      const previous: AlertStatus = ['normal', 'watch', 'warning', 'evacuate'].includes(oldAlert.status) ? oldAlert.status : 'normal';
      const watchQualifies = isUpstreamDevice && trend !== null && levelCm >= runtimeConfig.upstreamWatchCm && trend.slopeCmPerMin >= runtimeConfig.upstreamRiseRateCmPerMin;
      const candidate: AlertStatus = isLocalDevice ? statusFor(levelCm, previous === 'watch' ? 'normal' : previous) : watchQualifies ? 'watch' : 'normal';
      const requiredConfirmations = isUpstreamDevice ? runtimeConfig.upstreamWatchConfirmationReadings : runtimeConfig.confirmationReadings;
      const candidateReadings = oldAlert.candidateStatus === candidate ? Number(oldAlert.candidateReadings ?? 0) + 1 : 1;
      const nextStatus: AlertStatus = candidate === previous || candidateReadings >= requiredConfirmations ? candidate : previous;
      const changed = nextStatus !== previous;
      const alert: Record<string, unknown> = { ...oldAlert, status: nextStatus, changedAt: changed ? now : oldAlert.changedAt ?? now, candidateStatus: candidate, candidateReadings };
      if (changed && nextStatus !== 'normal') alert.pendingNotification = { id: requestId, status: nextStatus, levelCm: Number(levelCm.toFixed(1)), createdAt: now, state: 'queued', attempts: 0, ...(nextStatus === 'watch' && trend ? { riseRateCmPerMin: Number(trend.slopeCmPerMin.toFixed(2)), estimatedLeadTimeMinutes: runtimeConfig.upstreamLeadTimeMinutes } : {}) };
      if (nextStatus === 'normal') delete alert.pendingNotification;
      const sirenActive = nextStatus === 'evacuate';
      return { ...old, source: 'floodguard-telemetry-api', levelCm: Number(levelCm.toFixed(1)), batteryV: Number.isFinite(Number(payload.batteryV)) ? Number(payload.batteryV) : null, signal: typeof payload.signal === 'string' ? payload.signal.slice(0, 40) : 'Unknown', isOnline: true, updatedAt: now, health: { status: 'online', checkedAt: now, lastSeenAt: now }, alert, ...(isUpstreamDevice ? { earlyWarning: { enabled: true, trend: trend ? { slopeCmPerMin: Number(trend.slopeCmPerMin.toFixed(2)), samples: trend.samples, measuredAt: now } : null, watchThresholdCm: runtimeConfig.upstreamWatchCm, minimumRiseRateCmPerMin: runtimeConfig.upstreamRiseRateCmPerMin, estimatedLeadTimeMinutes: runtimeConfig.upstreamLeadTimeMinutes } } : {}), siren: { active: sirenActive, expiresAt: sirenActive ? now + runtimeConfig.sirenDurationMs : now } };
    });
    const current = result.snapshot.val() as Record<string, any>;
    await Promise.all([
      db.ref(`telemetry/${deviceId}`).push({ source: 'floodguard-telemetry-api', levelCm: Number(levelCm.toFixed(1)), batteryV: current.batteryV, signal: current.signal, recordedAt: now }),
      // This intentionally contains only information appropriate for a public
      // status board. Operational data stays under the authenticated paths.
      db.ref(`publicStatus/${deviceId}`).set({ levelCm: current.levelCm, status: current.alert.status, isOnline: true, updatedAt: current.updatedAt }),
    ]);
    const sms = await deliverPendingAlert(db, deviceId);
    return NextResponse.json({ accepted: true, status: current.alert.status, confirmation: { candidate: current.alert.candidateStatus, readings: current.alert.candidateReadings, required: isUpstreamDevice ? runtimeConfig.upstreamWatchConfirmationReadings : runtimeConfig.confirmationReadings }, earlyWarning: isUpstreamDevice ? current.earlyWarning : null, sms: sms ?? { configured: Boolean(process.env.SEMAPHORE_API_KEY), delivered: 0 }, siren: current.siren });
  } catch (error) {
    console.error('Telemetry ingestion failed:', error);
    return NextResponse.json({ error: 'Telemetry service unavailable.' }, { status: 503 });
  }
}
