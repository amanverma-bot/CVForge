import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  Sun,
  Moon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    captchaToken: '',
    captchaAnswer: '',
  });
  const [captcha, setCaptcha] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const { login: storeLogin, theme, setTheme } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (mode === 'register') {
      fetchCaptcha();
    }
  }, [mode]);

  const fetchCaptcha = async () => {
    try {
      const res = await fetch('/api/captcha');
      const data = await res.json();
      setCaptcha(data);
      setForm((prev) => ({ ...prev, captchaToken: data.token, captchaAnswer: '' }));
    } catch {
      setCaptcha(null);
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = 'Name is required';
    if (mode === 'register' && !/^\S+@\S+\.\S+$/.test(form.email)) {
      newErrors.email = 'Invalid email';
    }
    if (form.password.length < 8) newErrors.password = 'Min 8 characters';
    if (mode === 'register' && !captcha) newErrors.captcha = 'Captcha not loaded';
    if (mode === 'register' && isNaN(Number(form.captchaAnswer))) {
      newErrors.captchaAnswer = 'Enter the answer';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      const body = mode === 'register'
        ? { name: form.name.trim(), email: form.email.trim(), password: form.password, captcha_token: form.captchaToken, captcha_answer: Number(form.captchaAnswer) }
        : { name: form.name.trim(), password: form.password };
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      storeLogin(data.token, { id: data.id || '', name: data.name || data.username, email: form.email, role: 'free', createdAt: new Date().toISOString() });
      navigate('/dashboard');
    } catch (err) {
      setErrors({ submit: err.message || 'Something went wrong' });
      if (mode === 'register') fetchCaptcha();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="max-w-md w-full">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary font-bold text-lg mb-4">
            CV
            <span className="ml-1">Forge</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h1>
          <p className="text-muted-foreground mt-2">
            {mode === 'login' ? 'Sign in to access your CVs and applications.' : 'Join CVForge to build professional resumes.'}
          </p>
        </div>

        <Card padding="md" className="shadow-lg border-border">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setMode('login')}
                className={cn(
                  'flex-1 py-2.5 rounded-lg text-sm font-medium transition-all',
                  mode === 'login'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted-hover'
                )}
              >
                Login
              </button>
              <button
                onClick={() => setMode('register')}
                className={cn(
                  'flex-1 py-2.5 rounded-lg text-sm font-medium transition-all',
                  mode === 'register'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted-hover'
                )}
              >
                Sign Up
              </button>
            </div>

            <div className="space-y-3">
              <Input
                label="Full Name (Login ID)"
                placeholder="Enter your name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                error={errors.name}
                leftIcon={<User className="w-4 h-4" />}
              />
              {mode === 'register' && (
                <Input
                  label="Email (Optional)"
                  placeholder="you@example.com"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  error={errors.email}
                  leftIcon={<Mail className="w-4 h-4" />}
                />
              )}
              <Input
                label="Password"
                type="password"
                placeholder="•••••••• (min 8 chars)"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                error={errors.password}
                leftIcon={<Lock className="w-4 h-4" />}
              />
              {mode === 'register' && captcha && (
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-semibold text-foreground">Human Check</label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{captcha.question}</span>
                    <button
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
                    onChange={(e) => setForm({ ...form, captchaAnswer: e.target.value })}
                    error={errors.captchaAnswer || errors.captcha}
                    leftIcon={<ArrowRight className="w-4 h-4" />}
                  />
                </div>
              )}
            </div>

            {errors.submit && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {errors.submit}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full py-3"
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
              ) : mode === 'login'
                ? 'Sign In'
                : 'Create Account'}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground text-center mb-4">
              {mode === 'login'
                ? "Don't have an account?"
                : 'Already have an account?'
              }
              <button
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                className="text-primary font-semibold hover:text-primary-hover ml-1"
              >
                {mode === 'login' ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border"></span>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button variant="outline" size="sm" className="w-full" disabled>
                GitHub (coming soon)
              </Button>
              <Button variant="outline" size="sm" className="w-full" disabled>
                Google (coming soon)
              </Button>
            </div>
          </div>
        </Card>

        <div className="text-center mt-6">
          <p className="text-xs text-muted-foreground">
            Secure login • bcrypt-hashed passwords • 7-day JWT sessions
          </p>
        </div>
      </div>
    </div>
  );
}