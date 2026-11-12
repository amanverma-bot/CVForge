import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ name: 'cvforge-web' })),
  getAuth: vi.fn(),
  getRedirectResult: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  getApps: mocks.getApps,
  initializeApp: mocks.initializeApp,
}));

vi.mock('firebase/auth', () => {
  class GoogleAuthProvider {
    constructor() {
      this.setCustomParameters = vi.fn();
    }
  }
  return {
    GoogleAuthProvider,
    getAuth: mocks.getAuth,
    getRedirectResult: mocks.getRedirectResult,
    signInWithPopup: mocks.signInWithPopup,
    signInWithRedirect: mocks.signInWithRedirect,
    signOut: mocks.signOut,
  };
});

const ENV = {
  VITE_FIREBASE_API_KEY: 'api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'cvforge-ca97c.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'cvforge-ca97c',
  VITE_FIREBASE_STORAGE_BUCKET: 'cvforge-ca97c.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
  VITE_FIREBASE_APP_ID: '1:123456789:web:abcdef',
};

function setEnv(overrides = {}) {
  const values = { ...ENV, ...overrides };
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

async function loadModule() {
  vi.resetModules();
  return import('./firebase');
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(ENV)) vi.stubEnv(key, '');
  mocks.getApps.mockReturnValue([]);
  mocks.initializeApp.mockReturnValue({ name: 'cvforge-web' });
  mocks.getAuth.mockReturnValue({ currentUser: null });
  mocks.getRedirectResult.mockResolvedValue(null);
  mocks.signOut.mockResolvedValue(undefined);
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Firebase web client', () => {
  it('reports configuration only when every required value is present', async () => {
    const { isFirebaseConfigured } = await loadModule();
    expect(isFirebaseConfigured()).toBe(false);

    setEnv({ VITE_FIREBASE_APP_ID: '' });
    expect(isFirebaseConfigured()).toBe(false);

    setEnv();
    expect(isFirebaseConfigured()).toBe(true);
  });

  it('exchanges a popup credential for an ID token', async () => {
    setEnv();
    const getIdToken = vi.fn().mockResolvedValue('firebase-id-token');
    mocks.signInWithPopup.mockResolvedValue({ user: { getIdToken } });
    const { signInWithGoogle } = await loadModule();

    await expect(signInWithGoogle()).resolves.toEqual({
      redirecting: false,
      idToken: 'firebase-id-token',
    });
    expect(mocks.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(mocks.signInWithRedirect).not.toHaveBeenCalled();
    expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
  });

  it('uses redirect on iOS Safari', async () => {
    setEnv();
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
    });
    const { signInWithGoogle } = await loadModule();

    await expect(signInWithGoogle()).resolves.toEqual({ redirecting: true });
    expect(mocks.signInWithRedirect).toHaveBeenCalledTimes(1);
    expect(mocks.signInWithPopup).not.toHaveBeenCalled();
  });

  it('uses popup on Android Chrome', async () => {
    setEnv();
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
    });
    const getIdToken = vi.fn().mockResolvedValue('android-token');
    mocks.signInWithPopup.mockResolvedValue({ user: { getIdToken } });
    const { signInWithGoogle } = await loadModule();

    await expect(signInWithGoogle()).resolves.toEqual({
      redirecting: false,
      idToken: 'android-token',
    });
    expect(mocks.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(mocks.signInWithRedirect).not.toHaveBeenCalled();
  });

  it('falls back to redirect when the popup is blocked', async () => {
    setEnv();
    mocks.signInWithPopup.mockRejectedValue({ code: 'auth/popup-blocked' });
    const { signInWithGoogle } = await loadModule();

    await expect(signInWithGoogle()).resolves.toEqual({ redirecting: true });
    expect(mocks.signInWithRedirect).toHaveBeenCalledTimes(1);
  });

  it('does not redirect when the user cancels the popup', async () => {
    setEnv();
    const error = Object.assign(new Error('cancelled'), { code: 'auth/popup-closed-by-user' });
    mocks.signInWithPopup.mockRejectedValue(error);
    const { signInWithGoogle } = await loadModule();

    await expect(signInWithGoogle()).rejects.toBe(error);
    expect(mocks.signInWithRedirect).not.toHaveBeenCalled();
  });

  it('returns a redirected credential and null when there is no redirect', async () => {
    setEnv();
    const getIdToken = vi.fn().mockResolvedValue('redirect-token');
    mocks.getRedirectResult.mockResolvedValue({ user: { getIdToken } });
    const { completeGoogleRedirect } = await loadModule();

    await expect(completeGoogleRedirect()).resolves.toBe('redirect-token');
    expect(mocks.getRedirectResult).toHaveBeenCalledTimes(1);
  });

  it('uses the persisted Firebase user when the redirect credential is empty', async () => {
    setEnv();
    const getIdToken = vi.fn().mockResolvedValue('persisted-token');
    mocks.getAuth.mockReturnValue({ currentUser: { getIdToken } });
    mocks.getRedirectResult.mockResolvedValue(null);
    const { completeGoogleRedirect } = await loadModule();

    await expect(completeGoogleRedirect()).resolves.toBe('persisted-token');
    expect(mocks.getRedirectResult).toHaveBeenCalledTimes(1);
  });

  it('skips redirect completion when configuration is absent', async () => {
    const { completeGoogleRedirect } = await loadModule();

    await expect(completeGoogleRedirect()).resolves.toBeNull();
    expect(mocks.getRedirectResult).not.toHaveBeenCalled();
  });

  it('signs out Firebase only when it is configured', async () => {
    const unconfigured = await loadModule();
    await unconfigured.signOutFirebase();
    expect(mocks.signOut).not.toHaveBeenCalled();

    setEnv();
    const configured = await loadModule();
    await configured.signOutFirebase();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });
});
