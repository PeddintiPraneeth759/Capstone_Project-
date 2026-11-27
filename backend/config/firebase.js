const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const projectId = process.env.FIREBASE_PROJECT_ID
  || process.env.GOOGLE_CLOUD_PROJECT
  || process.env.GCLOUD_PROJECT;

if (!projectId) {
  console.warn(
    'Firebase Admin project ID is missing. Set FIREBASE_PROJECT_ID in backend/.env before verifying tokens.'
  );
}

try {
  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
    console.log(`Firebase Admin initialized${projectId ? ` for ${projectId}` : ''}`);
  }
} catch (error) {
  console.warn('Firebase Admin unavailable: configure Application Default Credentials or a service account.', error.message);
}

function isInitialized() {
  return getApps().length > 0;
}

function verifyIdToken(token) {
  const app = getApps()[0];
  if (!app) throw new Error('Firebase Admin is not initialized.');
  return getAuth(app).verifyIdToken(token);
}

module.exports = { isInitialized, verifyIdToken };
