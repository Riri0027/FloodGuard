import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

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
