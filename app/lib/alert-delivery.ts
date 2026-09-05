import type { Database } from 'firebase-admin/database';

type AlertStatus = 'warning' | 'evacuate';
type PendingNotification = { id: string; status: AlertStatus; levelCm: number; createdAt: number; state: 'queued' | 'sending' | 'sent' | 'failed'; attempts: number; leaseUntil?: number };

function alertText(status: AlertStatus, levelCm: number) {
  const level = (levelCm / 100).toFixed(2);
  return status === 'evacuate' ? `FLOODGUARD EVACUATE: Bilog Falls water level is ${level} m. Evacuate the falls area and follow MDRRMO instructions.` : `FLOODGUARD WARNING: Bilog Falls water level is ${level} m. Avoid the water's edge and monitor official updates.`;
}

async function sendSms(message: string) {
  const { SEMAPHORE_API_KEY, SEMAPHORE_SENDER_NAME, ALERT_RECIPIENTS } = process.env;
  const recipients = (ALERT_RECIPIENTS ?? '').split(',').map((number) => number.trim()).filter(Boolean);
  if (!SEMAPHORE_API_KEY || !recipients.length) return { configured: false, delivered: 0 };
  const body = new URLSearchParams({ apikey: SEMAPHORE_API_KEY, number: recipients.join(','), message });
  if (SEMAPHORE_SENDER_NAME) body.set('sendername', SEMAPHORE_SENDER_NAME);
  const response = await fetch('https://api.semaphore.co/api/v4/messages', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new Error(`Semaphore returned ${response.status}`);
  const result = await response.json() as Array<{ status?: string }>;
  if (!Array.isArray(result)) throw new Error('Semaphore returned an unexpected response.');
  const accepted = new Set(['queued', 'pending', 'sent']);
  return { configured: true, delivered: result.filter((item) => accepted.has(item.status?.toLowerCase() ?? '')).length };
}

/** Claims a retryable alert with a short lease, then records provider outcome. */
export async function deliverPendingAlert(db: Database, deviceId: string) {
  const ref = db.ref(`devices/${deviceId}/alert/pendingNotification`);
  let didClaim = false;
  const now = Date.now();
  const transaction = await ref.transaction((value: PendingNotification | null) => {
    // Firebase may rerun this callback after a concurrent write; only the
    // final callback invocation is allowed to claim the delivery lease.
    didClaim = false;
    if (!value || value.state === 'sent' || (value.state === 'sending' && Number(value.leaseUntil) > now)) return value;
    didClaim = true;
    return { ...value, state: 'sending', attempts: Number(value.attempts ?? 0) + 1, leaseUntil: now + 120_000 };
  });
  if (!didClaim) return null;
  const claimed = transaction.snapshot.val() as PendingNotification;
  try {
    const sms = await sendSms(alertText(claimed.status, claimed.levelCm));
    await ref.update({ state: 'sent', sentAt: Date.now(), leaseUntil: null, sms, error: null });
    await db.ref('alerts').push({ type: 'threshold-alert', deviceId, status: claimed.status, levelCm: claimed.levelCm, createdAt: claimed.createdAt, deliveredAt: Date.now(), sms });
    return sms;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 180) : 'Unknown SMS delivery error.';
    await ref.update({ state: 'failed', failedAt: Date.now(), leaseUntil: null, error: message });
    return { configured: Boolean(process.env.SEMAPHORE_API_KEY), delivered: 0, failed: true };
  }
}
