import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  Mail,
  ShieldCheck,
  Palette,
  Bell,
  CreditCard,
  Trash2,
  LogOut,
  Download,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { useStore } from '@/store/useStore';

export default function Settings() {
  const [theme, setTheme] = useState('light');
  const { user, logout, theme: storeTheme, setTheme: setStoreTheme } = useStore();
  const navigate = useNavigate();

  const handleThemeChange = (val) => {
    setTheme(val);
    setStoreTheme(val);
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to sign out?')) {
      logout();
      navigate('/login');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences.</p>
        </div>
      </div>

      {/* Account Section */}
      <Card padding="md" className="border-border space-y-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <User className="w-4 h-4 text-primary" />
          Account
        </h2>
        <div className="flex items-center gap-4">
          <Avatar src={user?.avatar} name={user?.name || 'User'} size="lg" />
          <div>
            <p className="text-sm font-semibold text-foreground">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
            <Badge variant="primary" className="text-xs mt-2">
              {user?.role?.toUpperCase()} Plan
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputLabel>Display Name</InputLabel>
          <input className="input w-full" defaultValue={user?.name} />
          <InputLabel>Email Address</InputLabel>
          <input className="input w-full" defaultValue={user?.email} type="email" />
        </div>
        <Button variant="outline" size="sm" className="w-full">
          <Download className="w-4 h-4 mr-2" />
          Export My Data (JSON)
        </Button>
        <Button variant="destructive" size="sm" className="w-full" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </Card>

      {/* Preferences Section */}
      <Card padding="md" className="border-border space-y-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          Preferences
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Theme</h3>
              <p className="text-xs text-muted-foreground">Choose light or dark mode</p>
            </div>
            <div className="flex gap-2">
              {[['light', 'Light'], ['dark', 'Dark'], ['system', 'System']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => handleThemeChange(val)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-all border',
                    theme === val
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Email Notifications</h3>
              <p className="text-xs text-muted-foreground">Get notified about application updates</p>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only peer"
                defaultChecked
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Push Notifications</h3>
              <p className="text-xs text-muted-foreground">Desktop notifications for interview reminders</p>
            </div>
            <div className="relative">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </div>
          </div>
        </div>
      </Card>

      {/* Security Section */}
      <Card padding="md" className="border-border space-y-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          Security
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Change Password</h3>
              <p className="text-xs text-muted-foreground">Update your account password</p>
            </div>
            <Button variant="outline" size="sm">Change</Button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Two-Factor Authentication</h3>
              <p className="text-xs text-muted-foreground">Add extra security to your account</p>
            </div>
            <Button variant="outline" size="sm">Enable</Button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Active Sessions</h3>
              <p className="text-xs text-muted-foreground">Manage devices logged into your account</p>
            </div>
            <Button variant="outline" size="sm">Manage</Button>
          </div>
        </div>
      </Card>

      {/* Billing Section */}
      <Card padding="md" className="border-border space-y-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-primary" />
          Billing & Subscription
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Current Plan</h3>
              <p className="text-xs text-muted-foreground">{user?.role?.toUpperCase()} • Free tier</p>
            </div>
            <Badge variant="primary" className="text-xs">Active</Badge>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Button variant="outline" size="sm" className="w-full">
              Upgrade to Pro
            </Button>
            <Button variant="outline" size="sm" className="w-full">
              View Invoices
            </Button>
          </div>
        </div>
      </Card>

      <div className="text-center py-8">
        <p className="text-xs text-muted-foreground">
          CVForge Inc. • Privacy-first career platform
        </p>
      </div>
    </div>
  );
}

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

function InputLabel({ children }) {
  return (
    <label className="text-xs font-semibold text-muted-foreground mb-1 block uppercase tracking-wider">
      {children}
    </label>
  );
}