import { useStore } from '@/store/useStore';
import { signOutFirebase } from '@/lib/firebase';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type ApiOptions = RequestInit & { skipAuth?: boolean };

async function request(path: string, options: ApiOptions = {}): Promise<Response> {
  const { skipAuth, ...init } = options;
  const token = useStore.getState().token;
  const headers = new Headers(init.headers || {});
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !skipAuth) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401 && token && !skipAuth) {
    useStore.getState().logout();
    signOutFirebase();
  }
  return res;
}

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const res = await request(path, options);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    const data = await res.json().catch(() => null);
    if (data && typeof data.error === 'string') message = data.error;
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export async function apiBlob(path: string, options: ApiOptions = {}): Promise<Blob> {
  const res = await request(path, options);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    const data = await res.json().catch(() => null);
    if (data && typeof data.error === 'string') message = data.error;
    throw new ApiError(message, res.status);
  }
  return res.blob();
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError || err instanceof Error) return err.message;
  return 'Something went wrong';
}

// Best-effort server-side sign-out: revokes the current JWT on the backend.
// Local state is cleared regardless of the network result.
export function logoutSession() {
  signOutFirebase();
  api('/api/auth/logout', { method: 'POST' }).catch(() => {});
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
