import { initializeApp, getApps } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "mock-api-key-for-build",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "mock-auth-domain-for-build",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "mock-project-id-for-build",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "mock-storage-bucket-for-build",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "mock-messaging-sender-id-for-build",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "mock-app-id-for-build",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

let db: ReturnType<typeof getFirestore>;

try {
  // Check if we are running in a mobile WebView / Capacitor or mobile browser
  const isMobile =
    typeof window !== "undefined" &&
    (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      !!(window as any).Capacitor);

  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      // Only use multi-tab manager on desktop web/Electron.
      // Mobile WebView crashes/fails when sharing tab manager because it's a single app context.
      tabManager: isMobile ? undefined : persistentMultipleTabManager(),
    }),
  });
} catch (err) {
  console.warn("Firestore custom initialization failed, falling back to default:", err);
  db = getFirestore(app);
}

export const auth = getAuth(app);
export const storage = getStorage(app);
export { db };
export default app;
