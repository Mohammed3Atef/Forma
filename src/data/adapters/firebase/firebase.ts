import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  indexedDBLocalPersistence,
  initializeAuth,
  browserLocalPersistence,
  type Auth,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { firebaseConfig, isFirebaseConfigured } from './config';

/**
 * Lazy Firebase initialisation. Nothing here runs unless the app is configured
 * AND the user opts into cloud sync, keeping the local-only path free of any
 * Firebase side effects. Firestore is created with IndexedDB persistence so
 * reads work offline.
 */
let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

export function ensureFirebase(): { app: FirebaseApp; db: Firestore; auth: Auth } {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured. Add VITE_FIREBASE_* env vars.');
  }
  if (!app) {
    app = initializeApp({
      apiKey: firebaseConfig.apiKey,
      authDomain: firebaseConfig.authDomain,
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
      messagingSenderId: firebaseConfig.messagingSenderId,
      appId: firebaseConfig.appId,
    });
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      // Optional fields (e.g. a photo's note/weight) can be `undefined`; Firestore
      // rejects undefined values unless we tell it to ignore them.
      ignoreUndefinedProperties: true,
    });
    // Persist the session (IndexedDB, falling back to localStorage) so the user
    // stays signed in after closing/reopening the app — no re-login each time.
    auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
    console.info(`[firebase] initialized · project "${firebaseConfig.projectId}"`);
  }
  return { app: app!, db: db!, auth: auth! };
}
