import React, { useState, useCallback } from 'react';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api, errorMessage } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { GoogleButton, OrDivider } from './GoogleButton';

interface LoginFormProps {
  onSwitchToRegister: () => void;
  isGoogleConfigured: boolean;
  googleBusy: boolean;
  githubBusy: boolean;
  onGoogleSignIn: () => Promise<void>;
}

export function LoginForm({
  onSwitchToRegister,
  isGoogleConfigured,
  googleBusy,
  githubBusy,
  onGoogleSignIn,
}: LoginFormProps) {
  const [form, setForm] = useState({ name: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login: storeLogin } = useStore();

  const setField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const data = await api(`/api/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ name: form.name.trim(), password: form.password }),
        skipAuth: true,
      });
      const user = data.user || {};
      storeLogin(data.token, {
        id: user.id || '',
        name: user.name || data.name || form.name.trim(),
        email: user.email || form.email || undefined,
        avatar: user.avatar || undefined,
        role: user.role || 'free',
        createdAt: user.createdAt || new Date().toISOString(),
      });
    } catch (err) {
      setErrors({ submit: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={busy}>
      <div className="space-y-3">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={form.name}
          onChange={(e) => setField('name', e.target.value)}
          error={errors.name}
          leftIcon={<Mail className="w-4 h-4" />}
        />
        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="••••••••"
          value={form.password}
          onChange={(e) => setField('password', e.target.value)}
          error={errors.password}
          leftIcon={<Lock className="w-4 h-4" />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="p-1"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />
      </div>

      {busy && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-primary text-sm"
        >
          <svg className="animate-spin h-4 w-4 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Completing sign-in...
        </div>
      )}

      {errors.submit && (
        <div role="alert" className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {errors.submit}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        className="w-full py-4"
        disabled={busy}
      >
        {busy ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Please wait...
          </>
        ) : 'Sign In'}
      </Button>

      {isGoogleConfigured && (
        <>
          <OrDivider />
          <GoogleButton
            label="Continue with Google"
            busy={googleBusy}
            disabled={busy}
            onClick={onGoogleSignIn}
          />
        </>
      )}

      <div className="text-center mt-4">
        <p className="text-sm text-muted-foreground">
          Don't have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="text-primary font-medium hover:underline"
          >
            Create account
          </button>
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          By continuing you agree to our{' '}
          <a href="/terms" className="underline">Terms</a> and{' '}
          <a href="/privacy" className="underline">Privacy Policy</a>.
        </p>
      </div>
    </form>
  );
}