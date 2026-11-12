import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import {
  Briefcase,
  ChartBar,
  Home,
  LogOut,
  Mail,
  Menu,
  Moon,
  Plus,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logoutSession } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Create CV', href: '/create', icon: Plus },
  { name: 'Analyzer', href: '/analyzer', icon: ChartBar },
  { name: 'Match Jobs', href: '/match', icon: Briefcase },
  { name: 'Tracker', href: '/tracker', icon: Mail },
];

export const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { resolvedTheme, setTheme, user, logout, isAuthenticated } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);

  const isDark = resolvedTheme === 'dark';
  const mobileLinks = isAuthenticated
    ? [...navItems, { name: 'Settings', href: '/settings', icon: Settings }]
    : navItems;

  const closeMenu = () => setMobileMenuOpen(false);

  const handleLogout = () => {
    closeMenu();
    logoutSession();
    logout();
    navigate('/login');
  };

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  useEffect(() => {
    closeMenu();
  }, [location.pathname]);

  useEffect(() => {
    if (mobilePanelRef.current) {
      mobilePanelRef.current.inert = !mobileMenuOpen;
    }
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
        menuButtonRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1024px)');
    const handleDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) closeMenu();
    };

    desktopQuery.addEventListener('change', handleDesktop);
    return () => desktopQuery.removeEventListener('change', handleDesktop);
  }, []);

  const themeLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md transition-colors duration-200"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link
            to={isAuthenticated ? '/dashboard' : '/'}
            onClick={closeMenu}
            className="flex shrink-0 items-center gap-2 text-xl font-bold tracking-tight text-foreground"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-xs font-bold text-on-primary">
              CV
            </div>
            <span>CVForge</span>
          </Link>

          <div className="hidden items-center gap-0.5 xl:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </NavLink>
            ))}
          </div>

          <div className="hidden items-center gap-3 xl:flex">
            {isAuthenticated && user ? (
              <>
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={themeLabel}
                  title={themeLabel}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <div className="max-w-40 text-right">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {user.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {user.email || 'No email'}
                  </div>
                </div>
                <Avatar src={user.avatar} name={user.name} size="sm" />
                <Button variant="outline" size="sm" onClick={handleLogout} className="px-3">
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={themeLabel}
                  title={themeLabel}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <Link
                  to="/login"
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Sign in
                </Link>
                <Button variant="primary" size="sm" asChild>
                  <Link to="/create">Build CV</Link>
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 xl:hidden">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={themeLabel}
              title={themeLabel}
              className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              className="flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
            >
              <span className="relative block h-5 w-5" aria-hidden="true">
                <Menu
                  className={cn(
                    'absolute inset-0 h-5 w-5 transition-all duration-200',
                    mobileMenuOpen ? 'scale-75 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100'
                  )}
                />
                <X
                  className={cn(
                    'absolute inset-0 h-5 w-5 transition-all duration-200',
                    mobileMenuOpen ? 'scale-100 rotate-0 opacity-100' : 'scale-75 -rotate-90 opacity-0'
                  )}
                />
              </span>
            </button>
          </div>
        </div>
      </div>

      <div
        ref={mobilePanelRef}
        id="mobile-navigation"
        aria-hidden={!mobileMenuOpen}
        className={cn(
          'overflow-hidden border-t border-border bg-card shadow-xl transition-[max-height,opacity] duration-300 ease-out xl:hidden',
          mobileMenuOpen ? 'max-h-[calc(100dvh-4rem)] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {isAuthenticated && user && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3">
              <Avatar src={user.avatar} name={user.name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{user.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {user.email || 'No email'}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                {user.role}
              </span>
            </div>
          )}

          <div className="space-y-1">
            {mobileLinks.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={closeMenu}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors',
                        isActive
                          ? 'border-primary/20 bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground group-hover:text-foreground'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1">{item.name}</span>
                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </>
                )}
              </NavLink>
            ))}
          </div>

          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            </button>

            {isAuthenticated ? (
              <Button variant="destructive" onClick={handleLogout} className="w-full">
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" asChild>
                  <Link to="/login" onClick={closeMenu}>Sign in</Link>
                </Button>
                <Button variant="primary" asChild>
                  <Link to="/create" onClick={closeMenu}>Build CV</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
