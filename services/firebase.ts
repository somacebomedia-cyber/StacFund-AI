
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// In browser environments inside iframes, using window.location.host as authDomain
// combined with the /__/auth server proxy eliminates cross-origin iframe storage blocks
// that cause FirebaseError: auth/network-request-failed
const effectiveAuthDomain =
  typeof window !== 'undefined' && window.location?.host
    ? window.location.host
    : firebaseConfig.authDomain;

const clientConfig = {
  ...firebaseConfig,
  authDomain: effectiveAuthDomain,
};

// Initialize Firebase using a singleton pattern
const app = getApps().length > 0 ? getApp() : initializeApp(clientConfig);

const auth = getAuth(app);

// In browser / iframe environments, enabling auto-detect long polling prevents the
// 10-second duplex WebChannel streaming timeout and offline fallback warnings
const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    }, firebaseConfig.firestoreDatabaseId);
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
})();

// Validate connection to Firestore on initial boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration or network connection.");
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Helper to check if config is technically present (allows UI to render)
export const isConfigured = () => {
  return true; 
};

// Helper to check if the keys are actually valid (prevents network calls that would hang)
export const hasValidFirebaseConfig = () => {
  return firebaseConfig.apiKey && firebaseConfig.apiKey !== "AIzaSyD-YOUR-REAL-API-KEY-HERE";
}

export { app, auth, db };
export default app;