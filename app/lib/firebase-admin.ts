import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
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
