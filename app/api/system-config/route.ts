import { NextRequest, NextResponse } from 'next/server';
import { requireFirebaseUser } from '../../lib/firebase-admin';
import { runtimeConfig } from '../../lib/runtime-config';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await requireFirebaseUser(request.headers.get('authorization'));
    return NextResponse.json({ deviceId: runtimeConfig.deviceId, warningCm: runtimeConfig.warningCm, evacuateCm: runtimeConfig.evacuateCm, maxLevelCm: runtimeConfig.maxLevelCm, confirmationReadings: runtimeConfig.confirmationReadings }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
}
