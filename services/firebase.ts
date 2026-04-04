
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// ------------------------------------------------------------------
// ⚠️ IMPORTANT: REPLACE THESE VALUES WITH YOUR FIREBASE PROJECT CONFIG
// 1. Go to console.firebase.google.com
// 2. Create a project
// 3. Add a Web App
// 4. Copy the config object below
// ------------------------------------------------------------------

const firebaseConfig = {
  // If you are in a preview environment, these might not work until you add real keys
  apiKey: "AIzaSyD-YOUR-REAL-API-KEY-HERE", 
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

// Initialize Firebase using a singleton pattern
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

// Helper to check if config is technically present (allows UI to render)
export const isConfigured = () => {
  return true; 
};

// Helper to check if the keys are actually valid (prevents network calls that would hang)
export const hasValidFirebaseConfig = () => {
  return firebaseConfig.apiKey !== "AIzaSyD-YOUR-REAL-API-KEY-HERE";
}

export { app, auth, db };
export default app;