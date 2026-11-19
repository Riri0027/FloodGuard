import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';

function serviceAccount() {
  const value = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!value) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured.');
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON.');
  }
}

export function firebaseAdminDatabase() {
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  if (!databaseURL) throw new Error('FIREBASE_DATABASE_URL is not configured.');

  const app: App = getApps()[0] ?? initializeApp({
    credential: cert(serviceAccount()),
    databaseURL,
  });

  return getDatabase(app);
}

/** Verifies browser-issued Firebase ID tokens in server routes. */
export async function requireFirebaseUser(authorization: string | null) {
  if (!authorization?.startsWith('Bearer ')) {
    throw new Error('Missing bearer token.');
  }

  // Ensure the Admin app has been initialized before retrieving Auth.
  firebaseAdminDatabase();
  return getAuth().verifyIdToken(authorization.slice('Bearer '.length));
}

/** Requires an active FloodGuard operator profile for physical siren controls. */
export async function requireActiveFloodGuardOperator(authorization: string | null) {
  const token = await requireFirebaseUser(authorization);
  const profileSnapshot = await getFirestore().collection('users').doc(token.uid).get();
  const profile = profileSnapshot.data();
  const roleKey = profile?.roleKey === 'barangay' || profile?.role === 'Barangay Official'
    ? 'barangay'
    : profile?.roleKey === 'mdrrmo' || profile?.role === 'MDRRMO Personnel'
      ? 'mdrrmo'
      : null;

  if (!profileSnapshot.exists || profile?.status !== 'Active' || !roleKey) {
    throw new Error('An active FloodGuard operator profile is required.');
  }

  return { uid: token.uid, roleKey };
}
