import React, { useState, useCallback } from 'react';
import { Mail, Lock, User, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api, errorMessage } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { GoogleButton, OrDivider } from './GoogleButton';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
  isGoogleConfigured: boolean;
  googleBusy: boolean;
  onGoogleSignIn: () => Promise<void>;
}

export function RegisterForm({
  onSwitchToLogin,
  isGoogleConfigured,
  googleBusy,
  onGoogleSignIn,
}: RegisterFormProps) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', captchaToken: '', captchaAnswer: '' });
  const [captcha, setCaptcha] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const { login: storeLogin } = useStore();

  const setField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const fetchCaptcha = async () => {
    try {
      const data = await api('/api/captcha', { skipAuth: true });
      setCaptcha(data);
      setForm((prev) => ({ ...prev, captchaToken: data.token, captchaAnswer: '' }));
    } catch {
      setCaptcha(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!validate()) return;
    setBusy(true);
    try {
      const data = await api(`/api/auth/register`, {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          confirm_password: form.confirmPassword,
          captcha_token: form.captchaToken,
          captcha_answer: Number(form.captchaAnswer),
        }),
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
      if (busy) fetchCaptcha();
    } finally {
      setBusy(false);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = 'Name is required';
    if (!form.email.trim()) newErrors.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) newErrors.email = 'Invalid email';
    if (form.password.length < 8) newErrors.password = 'Min 8 characters';
    if (!form.confirmPassword) newErrors.confirmPassword = 'Confirm your password';
    else if (form.password !== form.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    if (!captcha) newErrors.captcha = 'Captcha not loaded';
    if (isNaN(Number(form.captchaAnswer))) newErrors.captchaAnswer = 'Enter the answer';
    if (!termsAccepted) newErrors.terms = 'Please accept the Terms and Privacy Policy';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={busy}>
      <div className="space-y-3">
        <Input
          label="Full Name (Login ID)"
          placeholder="Enter your name"
          value={form.name}
          onChange={(e) => setField('name', e.target.value)}
          error={errors.name}
          leftIcon={<User className="w-4 h-4" />}
        />
        <Input
          label="Email Address"
          placeholder="you@example.com"
          type="email"
          value={form.email}
          onChange={(e) => setField('email', e.target.value)}
          error={errors.email}
          leftIcon={<Mail className="w-4 h-4" />}
        />
        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="•••••••• (min 8 chars)"
          value={form.password}
          onChange={(e) => setField('password', e.target.value)}
          error={errors.password}
          leftIcon={<Lock className="w-4 h-4" />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
              className="p-1"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />
        <Input
          label="Confirm Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="••••••••"
          value={form.confirmPassword}
          onChange={(e) => setField('confirmPassword', e.target.value)}
          error={errors.confirmPassword}
          leftIcon={<Lock className="w-4 h-4" />}
        />
        {captcha && (
          <div className="space-y-2 pt-2">
            <label className="text-xs font-semibold text-foreground">Human Check</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{captcha.question}</span>
              <button
                type="button"
                onClick={fetchCaptcha}
                className="text-xs text-primary underline"
              >
                Refresh
              </button>
            </div>
            <Input
              label="Answer"
              placeholder="Number"
              type="tel"
              value={form.captchaAnswer}
              onChange={(e) => setField('captchaAnswer', e.target.value)}
              error={errors.captchaAnswer || errors.captcha}
              leftIcon={<ArrowRight className="w-4 h-4" />}
            />
          </div>
        )}
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

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-1 h-4 w-4 accent-primary"
        />
        <span>
          I agree to the <a href="/terms" className="underline">Terms and Conditions</a> and{' '}
          <a href="/privacy" className="underline">Privacy Policy</a>.
        </span>
      </label>
      {errors.terms && (
        <p className="text-sm text-destructive">{errors.terms}</p>
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
        ) : 'Create Account'}
      </Button>

      {isGoogleConfigured && (
        <>
          <OrDivider />
          <GoogleButton
            label="Sign up with Google"
            busy={googleBusy}
            disabled={busy}
            onClick={onGoogleSignIn}
          />
        </>
      )}

      <div className="text-center mt-4">
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-primary font-medium hover:underline"
          >
            Sign in
          </button>
        </p>
      </div>
    </form>
  );
}