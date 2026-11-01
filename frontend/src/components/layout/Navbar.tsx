import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import {
  User,
  Mail,
  Lock,
  Home,
  Briefcase,
  ChartBar,
  Settings,
  LogOut,
  Moon,
  Sun,
  Menu,
  X,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
  const { theme, setTheme, user, logout, isAuthenticated } = useStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 text-xl font-bold text-foreground tracking-tight"
          >
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-on-primary font-black text-xs">
              CV
            </div>
            <span>CVForge</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-4">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleTheme}
                  aria-label="Toggle theme"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </Button>
                <div className="hidden sm:flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-semibold text-foreground">{user.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {user.email || 'No email'}
                    </div>
                  </div>
                  <Avatar src={user.avatar} name={user.name} size="sm" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                    className="px-3"
                  >
                    <LogOut className="w-3 h-3 mr-1" />
                    Sign out
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign in
                </Link>
                <Button variant="primary" size="sm" asChild>
                  <Link to="/create" className="flex items-center justify-center">
                    Build CV
                  </Link>
                </Button>
              </div>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden inline-flex items-center justify-center p-2 text-foreground hover:bg-muted rounded-md"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Open menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-card border-b border-border">
          <div className="px-4 py-4 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors block"
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            ))}
            <div className="border-t border-border pt-4">
              {isAuthenticated ? (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    onClick={toggleTheme}
                    className="w-full justify-start"
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  </Button>
                  <Button variant="destructive" onClick={handleLogout} className="w-full">
                    Sign out
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button variant="outline" asChild className="w-full">
                    <Link to="/login">Sign in</Link>
                  </Button>
                  <Button variant="primary" asChild className="w-full">
                    <Link to="/create">Build CV</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};