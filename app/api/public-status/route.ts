import { NextResponse } from 'next/server';
import { firebaseAdminDatabase } from '../../lib/firebase-admin';
import { runtimeConfig } from '../../lib/runtime-config';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const snapshot = await firebaseAdminDatabase().ref(`publicStatus/${runtimeConfig.deviceId}`).get();
    return NextResponse.json(snapshot.val() ?? null, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Public status lookup failed:', error);
    return NextResponse.json({ error: 'Live status is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
