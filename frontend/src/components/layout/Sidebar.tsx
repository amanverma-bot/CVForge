import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import {
  Briefcase,
  ChartBar,
  Mail,
  Settings,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logoutSession } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'My CVs', href: '/dashboard#my-cvs', icon: Briefcase },
  { name: 'CV Analyzer', href: '/analyzer', icon: ChartBar },
  { name: 'Job Matcher', href: '/match', icon: Briefcase },
  { name: 'Application Tracker', href: '/tracker', icon: Mail },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export const Sidebar = ({ className }: { className?: string }) => {
  const { user, logout, theme, setTheme } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Persist collapsed state
  useEffect(() => {
    const stored = localStorage.getItem('cvforge-sidebar-collapsed');
    if (stored !== null) setIsCollapsed(stored === 'true');
  }, []);

  useEffect(() => {
    localStorage.setItem('cvforge-sidebar-collapsed', String(isCollapsed));
  }, [isCollapsed]);

  const handleLogout = () => {
    logoutSession();
    logout();
    navigate('/login');
  };

  const handleNavigate = (href) => {
    const [path, hash] = href.split('#');
    navigate(path);
    if (hash) {
      window.setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  };

  return (
    <aside
      className={cn(
        'hidden shrink-0 border-r border-border bg-card lg:sticky lg:top-16 lg:block lg:h-[calc(100dvh-4rem)] transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      <div className="flex flex-col h-full">
        {/* Logo / Collapse toggle */}
        <div className="flex items-center justify-between px-3 py-4">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-on-primary font-bold text-xs">
                CV
              </div>
              <span className="text-sm font-bold text-foreground tracking-tight">CVForge</span>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const [itemPath, hash] = item.href.split('#');
            const isActive =
              !hash &&
              (location.pathname === itemPath || location.pathname.startsWith(itemPath + '/'));
            return (
              <button
                key={item.name}
                onClick={() => handleNavigate(item.href)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  isActive
                    ? 'bg-primary/10 text-primary border-l-2 border-primary shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <item.icon className="w-4 h-4" />
                </div>
                {!isCollapsed && <span>{item.name}</span>}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-3 mb-4 px-2">
            {!isCollapsed && (
              <>
                <Avatar src={user?.avatar} name={user?.name || 'User'} size="sm" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{user?.name}</div>
                  <div className="truncate text-xs capitalize text-muted-foreground">
                    {user?.role}
                  </div>
                </div>
              </>
            )}
            {!isCollapsed && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                {user?.role}
              </span>
            )}
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
            {!isCollapsed && 'Sign out'}
          </Button>
          <div className="mt-4">
            <Button variant="ghost" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} className="w-full justify-start">
              {theme === 'dark' ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 3c-3.356 0-6.42 2.018-7.676 4.955a9 9 0 00-1.273 7.635l.003.001l.001.003a9 9 0 007.635 1.273A8.997 8.997 0 0021 12c0-3.355-2.018-6.42-4.955-7.676l-.003-.001l-.001-.003a9 9 0 00-1.273-7.635z" /></svg>
              )}
              {!isCollapsed && 'Switch Theme'}
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
};