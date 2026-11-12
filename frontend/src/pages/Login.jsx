import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { api, errorMessage } from '@/lib/api';
import {
  completeGoogleRedirect,
  isFirebaseConfigured,
  signInWithGoogle,
  signOutFirebase,
} from '@/lib/firebase';
import { AuthCard } from '@/components/auth/AuthCard';
import { LoginForm } from '@/components/auth/LoginForm';
import { RegisterForm } from '@/components/auth/RegisterForm';

const FIREBASE_ERRORS = {
  'auth/popup-closed-by-user': 'Google sign-in was cancelled. You can try again or use your password.',
  'auth/cancelled-popup-request': 'Google sign-in was cancelled. You can try again or use your password.',
  'auth/popup-blocked': 'Your browser blocked the sign-in popup. Please allow popups and try again.',
  'auth/redirect-cancelled-by-user': 'Google sign-in was cancelled. You can try again or use your password.',
  'auth/unauthorized-domain': 'This domain is not authorized for Google sign-in. Please contact support.',
  'auth/operation-not-allowed': 'Google sign-in is not enabled yet. Please use your password.',
  'auth/invalid-api-key': 'Google sign-in is not configured correctly. Please contact support.',
  'auth/configuration-not-found': 'Google sign-in is not configured correctly. Please contact support.',
  'auth/invalid-app-credential': 'Google sign-in is not configured correctly. Please contact support.',
  'auth/account-exists-with-different-credential': 'That email is already linked to a different sign-in method. Use your password or contact support.',
  'auth/network-request-failed': 'A network error interrupted sign-in. Please try again.',
  'auth/too-many-requests': 'Too many sign-in attempts. Please wait a moment and try again.',
  'auth/web-storage-unsupported': 'Your browser does not support secure sign-in storage. Please use your password.',
};

function firebaseErrorMessage(err) {
  const code = err && typeof err === 'object' ? err.code : '';
  if (typeof code === 'string' && code.startsWith('auth/requests-from-referer')) {
    return 'Google sign-in is blocked for this address. Open CVForge at http://127.0.0.1:5001, or add this domain to the Firebase API key allowlist.';
  }
  return FIREBASE_ERRORS[code] || errorMessage(err);
}

export default function Login({ initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.toString();
  const [oauthBusy, setOauthBusy] = useState(() => searchParams.get('oauth') === 'success');
  const [providers, setProviders] = useState(null);
  const [authError, setAuthError] = useState('');
  const { login: storeLogin } = useStore();
  const navigate = useNavigate();
  const firebaseRedirectStarted = useRef(false);

  const finishFirebaseLogin = useCallback(async (idToken) => {
    const data = await api('/api/auth/firebase', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
      skipAuth: true,
    });
    if (!data?.token) throw new Error('Sign-in response was incomplete');
    const user = data.user || {};
    storeLogin(data.token, {
      id: user.id || '',
      name: user.name || 'CVForge user',
      email: user.email || undefined,
      avatar: user.avatar || undefined,
      role: user.role || 'free',
      createdAt: user.createdAt || new Date().toISOString(),
    });
    navigate('/dashboard', { replace: true });
  }, [navigate, storeLogin]);

  useEffect(() => {
    let active = true;
    Promise.resolve(api('/api/auth/providers', { skipAuth: true }))
      .then((data) => {
        if (active && data?.providers) setProviders(data.providers);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (initialMode === 'register') setMode('register');
    if (initialMode === 'login') setMode('login');
    setAuthError('');
  }, [initialMode]);

  useEffect(() => {
    if (mode === 'register') {
      fetchCaptcha();
    }
  }, [mode]);

  useEffect(() => {
    if (!query) return;
    const params = new URLSearchParams(query);
    const oauthStatus = params.get('oauth');
    const oauthError = params.get('oauth_error');
    if (!oauthStatus && !oauthError) return;

    const clearQuery = () => setSearchParams({}, { replace: true });

    if (oauthError) {
      setOauthBusy(false);
      clearQuery();
      setAuthError(
        oauthError === 'invalid_state'
          ? 'Sign-in session expired or was invalid. Please try again.'
          : 'Sign-in could not be completed. Please try again.'
      );
      return;
    }

    if (oauthStatus !== 'success') {
      clearQuery();
      return;
    }

    let active = true;
    setOauthBusy(true);
    api('/api/auth/oauth/session', { method: 'POST', skipAuth: true })
      .then((data) => {
        if (!active) return;
        if (!data?.token) throw new Error('Sign-in response was incomplete');
        const user = data.user || {};
        storeLogin(data.token, {
          id: user.id || '',
          name: user.name || data.name || data.username || 'CVForge user',
          email: user.email || undefined,
          avatar: user.avatar || undefined,
          role: user.role || 'free',
          createdAt: user.createdAt || new Date().toISOString(),
        });
        clearQuery();
        navigate('/dashboard', { replace: true });
      })
      .catch((err) => {
        if (!active) return;
        setOauthBusy(false);
        clearQuery();
        setAuthError(errorMessage(err) || 'Sign-in could not be completed. Please try again.');
      });

    return () => {
      active = false;
    };
  }, [query, setSearchParams, navigate, storeLogin]);

  useEffect(() => {
    if (firebaseRedirectStarted.current) return;
    firebaseRedirectStarted.current = true;
    if (!isFirebaseConfigured()) return;

    completeGoogleRedirect()
      .then(async (idToken) => {
        if (!idToken) return;
        setOauthBusy(true);
        await finishFirebaseLogin(idToken);
      })
      .catch((err) => {
        setOauthBusy(false);
        setAuthError(firebaseErrorMessage(err));
        signOutFirebase();
      });
  }, [finishFirebaseLogin]);

  const fetchCaptcha = async () => {
    try {
      const data = await api('/api/captcha', { skipAuth: true });
      // Captcha is handled inside RegisterForm
    } catch {
      // Ignore
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isFirebaseConfigured()) return;
    if (providers?.firebase?.configured === false) return;
    setAuthError('');
    setGoogleBusy(true);
    try {
      const result = await signInWithGoogle();
      if (result.redirecting) return;
      await finishFirebaseLogin(result.idToken);
    } catch (err) {
      setGoogleBusy(false);
      setAuthError(firebaseErrorMessage(err));
      signOutFirebase();
    }
  };

  return (
    <AuthCard
      title={mode === 'login' ? 'Welcome Back' : 'Create Account'}
      subtitle={mode === 'login' ? 'Sign in to access your CVs and applications.' : 'Join CVForge to build professional resumes.'}
    >
      {authError && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
        >
          {authError}
        </div>
      )}

      {oauthBusy && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-primary text-sm"
        >
          <svg className="animate-spin h-4 w-4 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Completing sign-in...
        </div>
      )}

      {mode === 'login' ? (
        <LoginForm
          onGoogleSignIn={handleGoogleSignIn}
          isGoogleConfigured={isFirebaseConfigured()}
          googleBusy={googleBusy}
          githubBusy={false}
          onSwitchToRegister={() => navigate('/signup')}
        />
      ) : (
        <RegisterForm
          onSwitchToLogin={() => navigate('/login')}
          isGoogleConfigured={isFirebaseConfigured()}
          googleBusy={googleBusy}
          onGoogleSignIn={handleGoogleSignIn}
        />
      )}
    </AuthCard>
  );
}