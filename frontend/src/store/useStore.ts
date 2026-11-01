import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface User {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  role: 'free' | 'pro' | 'enterprise';
  createdAt: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: Partial<User>) => void;
}

export interface ThemeState {
  theme: 'light' | 'dark' | 'system';
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export interface DraftState {
  cvData: any;
  setCVData: (data: any) => void;
  clearDraft: () => void;
}

export interface AppState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  notifications: Array<{ id: string; type: 'success' | 'error' | 'info' | 'warning'; message: string }>;
  addNotification: (notification: Omit<AppState['notifications'][0], 'id'>) => void;
  removeNotification: (id: string) => void;
}

type StoreState = AuthState & ThemeState & DraftState & AppState;

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // Auth
      token: null,
      user: null,
      isAuthenticated: false,
      login: (token, user) =>
        set({ token, user, isAuthenticated: true }),
      logout: () =>
        set({ token: null, user: null, isAuthenticated: false }),
      setUser: (user) =>
        set((state) => ({ user: state.user ? { ...state.user, ...user } : null })),

      // Theme
      theme: 'system',
      resolvedTheme: 'light',
      setTheme: (theme) => {
        set({ theme });
        if (theme === 'system') {
          const resolved = window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
          set({ resolvedTheme: resolved });
          document.documentElement.classList.toggle('dark', resolved === 'dark');
        } else {
          set({ resolvedTheme: theme });
          document.documentElement.classList.toggle('dark', theme === 'dark');
        }
      },

      // Draft
      cvData: null,
      setCVData: (data) => set({ cvData: data }),
      clearDraft: () => set({ cvData: null }),

      // App
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      notifications: [],
      addNotification: (notification) => {
        const id = Math.random().toString(36).slice(2, 11);
        set((state) => ({
          notifications: [...state.notifications, { ...notification, id }],
        }));
        setTimeout(() => {
          get().removeNotification(id);
        }, 5000);
      },
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
    }),
    {
      name: 'cvforge-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        cvData: state.cvData,
      }),
    }
  )
);

// Initialize theme on mount
export function initializeTheme() {
  const stored = localStorage.getItem('cvforge-storage');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const theme = parsed.state?.theme || 'system';
      const isDark =
        theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);
    } catch {
      // ignore
    }
  }
}