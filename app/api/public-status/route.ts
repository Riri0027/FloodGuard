import { NextResponse } from 'next/server';
import { firebaseAdminDatabase } from '../../lib/firebase-admin';
import { runtimeConfig } from '../../lib/runtime-config';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const snapshot = await firebaseAdminDatabase().ref(`publicStatus/${runtimeConfig.deviceId}`).get();
    const saved = snapshot.val() as Record<string, unknown> | null;
    const updatedAt = Number(saved?.updatedAt);
    const levelCm = Number(saved?.levelCm);
    const status = saved?.status;
    const ageMs = Date.now() - updatedAt;
    const isFresh = Number.isFinite(updatedAt)
      && updatedAt > 0
      && ageMs >= 0
      && ageMs <= runtimeConfig.offlineAfterMs;
    const hasLiveReading = saved?.isOnline === true
      && isFresh
      && saved.levelCm !== null
      && saved.levelCm !== undefined
      && Number.isFinite(levelCm)
      && levelCm >= 0
      && levelCm <= runtimeConfig.maxLevelCm
      && ['normal', 'warning', 'evacuate'].includes(String(status));

    return NextResponse.json(hasLiveReading
      ? { levelCm, status, isOnline: true, updatedAt, offlineAfterMs: runtimeConfig.offlineAfterMs }
      : { levelCm: null, status: 'offline', isOnline: false, updatedAt: null, offlineAfterMs: runtimeConfig.offlineAfterMs }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Public status lookup failed:', error);
    return NextResponse.json({ error: 'Live status is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
