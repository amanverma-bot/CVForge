import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/lib/api', () => ({
  api: vi.fn(),
  errorMessage: (err) => (err instanceof Error ? err.message : 'Something went wrong'),
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/lib/firebase', () => ({
  completeGoogleRedirect: vi.fn(),
  isFirebaseConfigured: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutFirebase: vi.fn(),
}));

import Login from './Login.jsx';
import { api } from '@/lib/api';
import {
  completeGoogleRedirect,
  isFirebaseConfigured,
  signInWithGoogle,
  signOutFirebase,
} from '@/lib/firebase';
import { useStore } from '@/store/useStore';

function renderLogin(entry = '/login') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<div>OAuth Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.mockReset();
  isFirebaseConfigured.mockReset().mockReturnValue(false);
  completeGoogleRedirect.mockReset().mockResolvedValue(null);
  signInWithGoogle.mockReset();
  signOutFirebase.mockReset().mockResolvedValue(undefined);
  useStore.getState().logout();
});

describe('Login OAuth', () => {
  it('shows the Google button when Firebase is configured', () => {
    isFirebaseConfigured.mockReturnValue(true);
    renderLogin();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Continue with GitHub' })).toBeNull();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it('exchanges a successful callback session and stores the login', async () => {
    api.mockResolvedValue({
      token: 'oauth-session-token',
      user: {
        id: 'oauth-user-1',
        name: 'OAuth Tester',
        email: 'oauth@example.com',
        avatar: 'https://images.example.com/avatar.png',
        role: 'free',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });

    renderLogin('/login?oauth=success');

    expect(screen.getByText('Completing sign-in...')).toBeInTheDocument();
    expect(await screen.findByText('OAuth Dashboard')).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/api/auth/oauth/session', {
      method: 'POST',
      skipAuth: true,
    });
    expect(useStore.getState().token).toBe('oauth-session-token');
    expect(useStore.getState().user?.avatar).toBe('https://images.example.com/avatar.png');
  });

  it('maps callback error codes to a readable message without calling the API', async () => {
    renderLogin('/login?oauth_error=invalid_state');
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired or was invalid/i);
    expect(api).not.toHaveBeenCalledWith('/api/auth/oauth/session', expect.anything());
  });

  it('hides the Google button when Firebase is not configured', () => {
    renderLogin();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
  });

  it('reports an expired exchange session and leaves the user signed out', async () => {
    api.mockRejectedValue(new Error('Sign-in session expired. Please try again.'));
    renderLogin('/login?oauth=success');
    expect(await screen.findByRole('alert')).toHaveTextContent(/session expired/i);
    expect(useStore.getState().token).toBeNull();
  });

  it('exchanges a Firebase popup token and stores the CVForge session', async () => {
    isFirebaseConfigured.mockReturnValue(true);
    signInWithGoogle.mockResolvedValue({ redirecting: false, idToken: 'firebase-id-token' });
    api.mockImplementation((path) => {
      if (path === '/api/auth/providers') {
        return Promise.resolve({
          providers: {
            firebase: { label: 'Google', configured: true },
            github: { label: 'GitHub', configured: true },
          },
        });
      }
      if (path === '/api/auth/firebase') {
        return Promise.resolve({
          token: 'cvforge-token',
          user: {
            id: 'firebase-user-1',
            name: 'Firebase Tester',
            email: 'firebase@example.com',
            avatar: 'https://images.example.com/firebase.png',
            role: 'free',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        });
      }
      return Promise.resolve({});
    });

    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(await screen.findByText('OAuth Dashboard')).toBeInTheDocument();
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/api/auth/firebase', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'firebase-id-token' }),
      skipAuth: true,
    });
    expect(useStore.getState().token).toBe('cvforge-token');
    expect(useStore.getState().user?.name).toBe('Firebase Tester');
  });

  it('completes a Firebase redirect result on mount', async () => {
    isFirebaseConfigured.mockReturnValue(true);
    completeGoogleRedirect.mockResolvedValue('redirect-id-token');
    api.mockImplementation((path) => {
      if (path === '/api/auth/providers') return Promise.resolve({ providers: {} });
      if (path === '/api/auth/firebase') {
        return Promise.resolve({
          token: 'redirect-cvforge-token',
          user: { id: 'redirect-user', name: 'Redirect Tester', role: 'free' },
        });
      }
      return Promise.resolve({});
    });

    renderLogin();

    expect(await screen.findByText('OAuth Dashboard')).toBeInTheDocument();
    expect(completeGoogleRedirect).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/api/auth/firebase', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'redirect-id-token' }),
      skipAuth: true,
    });
    expect(useStore.getState().token).toBe('redirect-cvforge-token');
  });

  it('clears the Firebase session when the backend rejects the token', async () => {
    isFirebaseConfigured.mockReturnValue(true);
    signInWithGoogle.mockResolvedValue({ redirecting: false, idToken: 'rejected-token' });
    api.mockImplementation((path) => {
      if (path === '/api/auth/providers') {
        return Promise.resolve({ providers: { firebase: { label: 'Google', configured: true } } });
      }
      if (path === '/api/auth/firebase') {
        return Promise.reject(new Error('Firebase sign-in is not configured yet.'));
      }
      return Promise.resolve({});
    });

    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not configured yet/i);
    expect(useStore.getState().token).toBeNull();
    expect(signOutFirebase).toHaveBeenCalled();
  });

  it('maps a cancelled Firebase redirect to a readable error', async () => {
    isFirebaseConfigured.mockReturnValue(true);
    completeGoogleRedirect.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    api.mockResolvedValue({ providers: {} });

    renderLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent(/cancelled/i);
    expect(signOutFirebase).toHaveBeenCalled();
  });
});
