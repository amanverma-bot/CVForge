import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, apiBlob, ApiError, errorMessage, logoutSession } from './api';
import { signOutFirebase } from '@/lib/firebase';
import { useStore } from '@/store/useStore';

vi.mock('@/lib/firebase', () => ({ signOutFirebase: vi.fn() }));

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('api client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOutFirebase.mockReset().mockResolvedValue(undefined);
    useStore.getState().logout();
    useStore.getState().login('tok_123', { id: 'u1', name: 'Tester', role: 'free', createdAt: '2026-01-01' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches bearer token and content-type and parses json', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await api('/api/cvs', { method: 'POST', body: JSON.stringify({ name: 'X' }) });

    expect(data).toEqual({ ok: true });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/cvs');
    expect(init.headers.get('Authorization')).toBe('Bearer tok_123');
    expect(init.headers.get('Content-Type')).toBe('application/json');
  });

  it('omits auth for skipAuth requests', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { token: 'abc' }));
    vi.stubGlobal('fetch', fetchMock);

    await api('/api/captcha', { skipAuth: true });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.has('Authorization')).toBe(false);
  });

  it('logs out and surfaces the server error on 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: 'Invalid credentials' })));

    await expect(api('/api/auth/me')).rejects.toBeInstanceOf(ApiError);
    await expect(api('/api/auth/me')).rejects.toThrow('Invalid credentials');
    expect(useStore.getState().isAuthenticated).toBe(false);
    expect(useStore.getState().token).toBeNull();
    expect(signOutFirebase).toHaveBeenCalled();
  });

  it('returns an empty value for 204 responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204, json: async () => null, text: async () => '' })));

    await expect(api('/api/applications/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('asks the backend to revoke the session on logout', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204, json: async () => null, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    logoutSession();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/auth/logout');
    expect(init.method).toBe('POST');
    expect(init.headers.get('Authorization')).toBe('Bearer tok_123');
    expect(signOutFirebase).toHaveBeenCalled();
  });

  it('returns blobs without parsing them', async () => {
    const blob = { size: 3, type: 'application/pdf' };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, blob: async () => blob })));

    await expect(apiBlob('/api/pdf', { method: 'POST', body: JSON.stringify({ text: 'x' }) })).resolves.toBe(blob);
  });

  it('formats unknown errors safely', () => {
    expect(errorMessage(new ApiError('nope', 400))).toBe('nope');
    expect(errorMessage('bad')).toBe('Something went wrong');
  });
});
