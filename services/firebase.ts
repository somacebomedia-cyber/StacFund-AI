import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Configuration from project fundhubv1-fixed
export const firebaseConfig = {
  apiKey: "AIzaSyB2aiLLGlGX8gVs47L4ViuPLYAX113eSpw",
  authDomain: "fundhubv1-fixed.firebaseapp.com",
  projectId: "fundhubv1-fixed",
  storageBucket: "fundhubv1-fixed.firebasestorage.app",
  messagingSenderId: "568198713264",
  appId: "1:568198713264:web:55079a1b567fcbd27f9075",
  measurementId: "G-JFB8NXQK1R"
};

// Initialize Firebase using the singleton pattern to prevent double-loading
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Export these so App.tsx and other components can use them
export const auth = getAuth(app);
export const db = getFirestore(app);

// This is the helper function your App.tsx uses to decide if it should show the error screen
export const isConfigured = () => {
  return !!firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";
};

export default app;