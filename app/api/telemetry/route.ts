import { NextRequest, NextResponse } from 'next/server';
import { firebaseAdminDatabase } from '../../lib/firebase-admin';

export const runtime = 'nodejs';

const DEVICE_ID = 'FG-001';
const WARNING_CM = 75;
const EVACUATE_CM = 150;
const SIREN_DURATION_MS = 120_000;

type AlertStatus = 'normal' | 'warning' | 'evacuate';

function statusFor(levelCm: number): AlertStatus {
  if (levelCm >= EVACUATE_CM) return 'evacuate';
  if (levelCm >= WARNING_CM) return 'warning';
  return 'normal';
}

function textFor(status: AlertStatus, levelCm: number) {
  const level = (levelCm / 100).toFixed(2);
  return status === 'evacuate'
    ? `FLOODGUARD EVACUATE: Bilog Falls water level is ${level} m. Evacuate the falls area and follow MDRRMO instructions.`
    : `FLOODGUARD WARNING: Bilog Falls water level is ${level} m. Avoid the water's edge and monitor official updates.`;
}

async function sendSms(message: string) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, ALERT_RECIPIENTS } = process.env;
  const recipients = (ALERT_RECIPIENTS ?? '').split(',').map((number) => number.trim()).filter(Boolean);

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || recipients.length === 0) {
    return { configured: false, delivered: 0 };
  }

  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const results = await Promise.allSettled(recipients.map(async (to) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER, Body: message }),
    });
    if (!response.ok) throw new Error(`Twilio returned ${response.status}`);
  }));

  return { configured: true, delivered: results.filter((result) => result.status === 'fulfilled').length };
}

export async function POST(request: NextRequest) {
  if (!process.env.DEVICE_INGEST_KEY || request.headers.get('x-device-key') !== process.env.DEVICE_INGEST_KEY) {
    return NextResponse.json({ error: 'Unauthorized device.' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be valid JSON.' }, { status: 400 });
  }

  const deviceId = String(payload.deviceId ?? '');
  const levelCm = Number(payload.levelCm);
  if (deviceId !== DEVICE_ID || !Number.isFinite(levelCm) || levelCm < 0 || levelCm > 200) {
    return NextResponse.json({ error: 'Invalid telemetry payload.' }, { status: 400 });
  }

  try {
    const now = Date.now();
    const db = firebaseAdminDatabase();
    const deviceRef = db.ref(`devices/${DEVICE_ID}`);
    const previous = (await deviceRef.get()).val() as { alert?: { status?: AlertStatus; changedAt?: number } } | null;
    const currentStatus = statusFor(levelCm);
    const previousStatus = previous?.alert?.status ?? 'normal';
    const statusChanged = previousStatus !== currentStatus;
    const shouldNotify = (previousStatus === 'normal' && currentStatus !== 'normal')
      || (previousStatus === 'warning' && currentStatus === 'evacuate');
    const sirenActive = currentStatus === 'evacuate';
    const sirenExpiresAt = sirenActive ? now + SIREN_DURATION_MS : now;

    const telemetry = {
      // Lets dashboards distinguish server-validated ESP32 telemetry from
      // sample or manually entered database values.
      source: 'floodguard-telemetry-api',
      levelCm: Number(levelCm.toFixed(1)),
      batteryV: Number.isFinite(Number(payload.batteryV)) ? Number(payload.batteryV) : null,
      signal: typeof payload.signal === 'string' ? payload.signal.slice(0, 40) : 'Unknown',
      isOnline: true,
      updatedAt: now,
      health: { status: 'online', checkedAt: now, lastSeenAt: now },
      alert: { status: currentStatus, changedAt: statusChanged ? now : previous?.alert?.changedAt ?? now },
      siren: { active: sirenActive, expiresAt: sirenExpiresAt },
    };

    await deviceRef.update(telemetry);

    let sms = { configured: Boolean(process.env.TWILIO_ACCOUNT_SID), delivered: 0 };
    if (shouldNotify) {
      sms = await sendSms(textFor(currentStatus, levelCm));
      await db.ref('alerts').push({
        deviceId: DEVICE_ID,
        levelCm: telemetry.levelCm,
        status: currentStatus,
        createdAt: now,
        sms,
        siren: sirenActive,
      });
    }

    // The ESP32 must use this reply to drive an opto-isolated relay, and stop
    // the physical siren itself when expiresAt is reached if it loses the link.
    return NextResponse.json({
      accepted: true,
      status: currentStatus,
      sms,
      siren: { active: sirenActive, expiresAt: sirenExpiresAt },
    });
  } catch (error) {
    console.error('Telemetry ingestion failed:', error);
    return NextResponse.json({ error: 'Telemetry service unavailable.' }, { status: 503 });
  }
}
