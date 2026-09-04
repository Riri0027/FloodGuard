import { NextRequest, NextResponse } from 'next/server';
import { firebaseAdminDatabase } from '../../lib/firebase-admin';

export const runtime = 'nodejs';

const OFFLINE_AFTER_MS = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized cron request.' }, { status: 401 });
  }

  try {
    const db = firebaseAdminDatabase();
    const snapshot = await db.ref('devices').get();
    const devices = snapshot.val() as Record<string, Record<string, unknown>> | null;
    const now = Date.now();
    const offline: string[] = [];

    for (const [deviceId, device] of Object.entries(devices ?? {})) {
      if (device.source !== 'floodguard-telemetry-api') continue;
      const updatedAt = Number(device.updatedAt);
      const stale = !Number.isFinite(updatedAt) || now - updatedAt > OFFLINE_AFTER_MS;
      if (!stale || device.isOnline === false) continue;

      await db.ref(`devices/${deviceId}`).update({
        isOnline: false,
        health: { status: 'offline', checkedAt: now, lastSeenAt: updatedAt || null },
      });
      await db.ref('alerts').push({ type: 'device-offline', deviceId, createdAt: now, lastSeenAt: updatedAt || null });
      offline.push(deviceId);
    }

    return NextResponse.json({ checkedAt: now, offline });
  } catch (error) {
    console.error('Device health check failed:', error);
    return NextResponse.json({ error: 'Device health service unavailable.' }, { status: 503 });
  }
}
