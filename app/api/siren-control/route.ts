import { NextRequest, NextResponse } from 'next/server';
import { firebaseAdminDatabase, requireActiveFloodGuardOperator } from '../../lib/firebase-admin';
import { runtimeConfig } from '../../lib/runtime-config';

export const runtime = 'nodejs';

type SirenAction = 'off' | 'restart';

export async function POST(request: NextRequest) {
  let operator: Awaited<ReturnType<typeof requireActiveFloodGuardOperator>>;
  try {
    operator = await requireActiveFloodGuardOperator(request.headers.get('authorization'));
  } catch {
    return NextResponse.json({ error: 'An active FloodGuard operator account is required.' }, { status: 403 });
  }

  let action: SirenAction;
  try {
    const body = await request.json() as { action?: unknown };
    if (body.action !== 'off' && body.action !== 'restart') {
      return NextResponse.json({ error: 'Action must be "off" or "restart".' }, { status: 400 });
    }
    action = body.action;
  } catch {
    return NextResponse.json({ error: 'Body must be valid JSON.' }, { status: 400 });
  }

  try {
    const now = Date.now();
    const commandId = crypto.randomUUID();
    const deviceRef = firebaseAdminDatabase().ref(`devices/${runtimeConfig.deviceId}`);
    const result = await deviceRef.transaction((existing: Record<string, any> | null) => {
      if (!existing || existing.source !== 'floodguard-telemetry-api' || existing.alert?.status !== 'evacuate') return;
      const updatedAt = Number(existing.updatedAt);
      const ageMs = now - updatedAt;
      if (existing.isOnline !== true || !Number.isFinite(updatedAt) || ageMs < 0 || ageMs > runtimeConfig.offlineAfterMs) return;

      const previousControl = existing.sirenControl ?? {};
      return {
        ...existing,
        sirenControl: {
          ...previousControl,
          mode: action === 'off' ? 'off' : 'auto',
          commandId,
          requestedAt: now,
          requestedBy: operator.uid,
          deliveredCommandId: previousControl.deliveredCommandId ?? null,
        },
      };
    });

    if (!result.committed) {
      return NextResponse.json({ error: 'The device is not currently online with a confirmed evacuation alert.' }, { status: 409 });
    }

    return NextResponse.json({
      accepted: true,
      commandId,
      action,
      message: 'Command queued. The ESP32 will apply it when its next valid telemetry reading reaches the server.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Siren control failed:', error);
    return NextResponse.json({ error: 'Unable to queue the siren command.' }, { status: 503 });
  }
}
