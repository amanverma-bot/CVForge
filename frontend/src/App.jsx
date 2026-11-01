import React, { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Sidebar } from '@/components/layout/Sidebar';
import { useStore } from '@/store/useStore';
import { initializeTheme } from '@/store/useStore';
import { Toaster } from 'sonner';
import { cn } from '@/lib/utils';

// Pages
const Landing = React.lazy(() => import('./pages/Landing'));
const Login = React.lazy(() => import('./pages/Login'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Create = React.lazy(() => import('./pages/Create'));
const Analyzer = React.lazy(() => import('./pages/Analyzer'));
const Matcher = React.lazy(() => import('./pages/Matcher'));
const Tracker = React.lazy(() => import('./pages/Tracker'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Templates = React.lazy(() => import('./pages/Templates'));
const Privacy = React.lazy(() => import('./pages/Privacy'));
const Terms = React.lazy(() => import('./pages/Terms'));

function RequireAuth({ children }) {
  const { isAuthenticated } = useStore();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

function App() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, isAuthenticated } = useStore();

  useEffect(() => {
    initializeTheme();
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <BrowserRouter>
      <div className={cn('min-h-screen bg-background text-foreground transition-colors duration-300', theme === 'dark' && 'text-slate-100')}>
        <Toaster
          position="top-right"
          richColors
          closeButton
          cancelButton
          className="cn"
        />
        <Navbar />
        {isAuthenticated ? (
          <div className="flex">
            <Sidebar />
            <main className="flex-1 md:pl-64 pt-16 pb-24">
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/create" element={<Create />} />
                <Route path="/analyzer" element={<Analyzer />} />
                <Route path="/match" element={<Matcher />} />
                <Route path="/tracker" element={<Tracker />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/templates" element={<Templates />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </main>
          </div>
        ) : (
          <main className="pt-16 pb-24">
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/create" element={<Navigate to="/login" replace />} />
              <Route path="/analyzer" element={<Navigate to="/login" replace />} />
              <Route path="/match" element={<Navigate to="/login" replace />} />
              <Route path="/tracker" element={<Navigate to="/login" replace />} />
              <Route path="/settings" element={<Navigate to="/login" replace />} />
              <Route path="/templates" element={<Navigate to="/login" replace />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        )}
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;