import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { getApps, initializeApp } from 'firebase/app';

const APP_NAME = 'cvforge-web';
const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

type FirebaseEnvKey = (typeof REQUIRED_KEYS)[number];
type FirebaseConfig = Record<FirebaseEnvKey, string>;

let cachedAuth: ReturnType<typeof getAuth> | null = null;

function readConfig(): FirebaseConfig {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    VITE_FIREBASE_API_KEY: String(env.VITE_FIREBASE_API_KEY || '').trim(),
    VITE_FIREBASE_AUTH_DOMAIN: String(env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
    VITE_FIREBASE_PROJECT_ID: String(env.VITE_FIREBASE_PROJECT_ID || '').trim(),
    VITE_FIREBASE_STORAGE_BUCKET: String(env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
    VITE_FIREBASE_MESSAGING_SENDER_ID: String(env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
    VITE_FIREBASE_APP_ID: String(env.VITE_FIREBASE_APP_ID || '').trim(),
  };
}

export function isFirebaseConfigured(): boolean {
  const config = readConfig();
  return REQUIRED_KEYS.every((key) => Boolean(config[key]));
}

function firebaseConfig() {
  const config = readConfig();
  return {
    apiKey: config.VITE_FIREBASE_API_KEY,
    authDomain: config.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: config.VITE_FIREBASE_PROJECT_ID,
    storageBucket: config.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: config.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: config.VITE_FIREBASE_APP_ID,
  };
}

function getFirebaseAuth() {
  if (cachedAuth) return cachedAuth;
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase sign-in is not configured.');
  }
  const app = getApps().find((candidate) => candidate.name === APP_NAME) || initializeApp(firebaseConfig(), APP_NAME);
  cachedAuth = getAuth(app);
  return cachedAuth;
}

function shouldRedirect() {
  if (typeof navigator === 'undefined') return false;
  // iOS Safari blocks popups; Android Chrome and desktop handle them.
  // Redirecting on Android loses the result when third-party storage is partitioned.
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
}

function isPopupFallbackError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
  return code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment';
}

export type GoogleSignInResult = { redirecting: true } | { redirecting: false; idToken: string };

/** Starts Google sign-in. A redirect result must be completed by completeGoogleRedirect. */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  if (shouldRedirect()) {
    await signInWithRedirect(auth, provider);
    return { redirecting: true };
  }

  try {
    const credential = await signInWithPopup(auth, provider);
    const idToken = await credential.user.getIdToken();
    if (!idToken) throw new Error('Google returned an empty sign-in token.');
    return { redirecting: false, idToken };
  } catch (error) {
    if (isPopupFallbackError(error)) {
      await signInWithRedirect(auth, provider);
      return { redirecting: true };
    }
    throw error;
  }
}

/** Returns an ID token after a redirect sign-in, or null when there was no redirect. */
export async function completeGoogleRedirect(): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;
  const auth = getFirebaseAuth();
  const credential = await getRedirectResult(auth);
  const user = credential?.user || auth.currentUser;
  if (!user) return null;
  const idToken = await user.getIdToken();
  return idToken || null;
}

/** Best-effort cleanup so a failed exchange never leaves a Firebase session behind. */
export async function signOutFirebase(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    const auth = getFirebaseAuth();
    await signOut(auth);
  } catch {
    // Local CVForge logout must still succeed.
  }
}
