import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import {
  Home,
  Briefcase,
  ChartBar,
  Mail,
  Settings,
  User,
  ShieldCheck,
  CreditCard,
  Star,
  LayoutDashboard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'My CVs', href: '/dashboard', icon: Briefcase },
  { name: 'CV Analyzer', href: '/analyzer', icon: ChartBar },
  { name: 'Job Matcher', href: '/match', icon: Star },
  { name: 'Application Tracker', href: '/tracker', icon: Mail },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export const Sidebar = ({ className }: { className?: string }) => {
  const { user, logout, theme, setTheme, sidebarOpen, setSidebarOpen } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full w-64 bg-card border-r border-border z-40 transform transition-transform duration-300',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        'md:static md:translate-x-0',
        className
      )}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-on-primary font-black text-xs">
              CV
            </div>
            <span className="font-bold text-lg text-foreground tracking-tight">CVForge</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors md:hidden"
            aria-label="Close sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
            return (
              <button
                key={item.name}
                onClick={() => navigate(item.href)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-4">
            <Avatar src={user?.avatar} name={user?.name || 'User'} size="md" />
            <div>
              <div className="text-sm font-semibold text-foreground">{user?.name}</div>
              <div className="text-xs text-muted-foreground">{user?.role}</div>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="w-full"
            size="sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </Button>
          <div className="mt-4">
            <Button variant="ghost" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} className="w-full justify-start">
              {theme === 'dark' ? <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 3c-3.356 0-6.42 2.018-7.676 4.955a9 9 0 00-1.273 7.635l.003.001l.001.003a9 9 0 007.635 1.273A8.997 8.997 0 0021 12c0-3.355-2.018-6.42-4.955-7.676l-.003-.001l-.001-.003a9 9 0 00-1.273-7.635z" /></svg>}
              Switch Theme
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
};