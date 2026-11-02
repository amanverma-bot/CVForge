// Smoke tests for the API-wired pages: each renders without crashing and
// replaces demo data with live (mocked) API responses.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/api', () => ({
  api: vi.fn(async (path) => {
    if (path === '/api/cvs') return { items: [] };
    if (path === '/api/history') return { items: [] };
    if (path === '/api/applications') return { items: [] };
    return {};
  }),
  apiBlob: vi.fn(async () => new Blob()),
  downloadBlob: vi.fn(),
  errorMessage: (err) => (err instanceof Error ? err.message : 'Something went wrong'),
  ApiError: class ApiError extends Error {},
}));

import Dashboard from './Dashboard.jsx';
import Analyzer from './Analyzer.jsx';
import Matcher from './Matcher.jsx';
import Tracker from './Tracker.jsx';
import Settings from './Settings.jsx';
import Create from './Create.jsx';
import { useStore } from '@/store/useStore';

const renderPage = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  useStore.getState().logout();
  useStore.getState().login('test-token', {
    id: 'u1',
    name: 'Smoke Tester',
    email: 'smoke@test.local',
    role: 'free',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
});

describe('API-wired pages', () => {
  it('renders the dashboard with empty live data', async () => {
    renderPage(<Dashboard />);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText(/Run your first analysis/)).toBeInTheDocument();
  });

  it('renders the analyzer form', () => {
    renderPage(<Analyzer />);
    expect(screen.getByRole('heading', { name: 'CV Analyzer' })).toBeInTheDocument();
    expect(screen.getByText('Analyze Resume')).toBeInTheDocument();
  });

  it('renders the matcher with job rows', () => {
    renderPage(<Matcher />);
    expect(screen.getByRole('heading', { name: 'Job Matcher' })).toBeInTheDocument();
    expect(screen.getByText('Find Best Matches')).toBeInTheDocument();
  });

  it('renders the tracker with empty state', async () => {
    renderPage(<Tracker />);
    expect(screen.getByRole('heading', { name: 'Application Tracker' })).toBeInTheDocument();
    expect(await screen.findByText(/No applications yet/)).toBeInTheDocument();
  });

  it('renders settings for the logged-in user', () => {
    renderPage(<Settings />);
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Smoke Tester')).toBeInTheDocument();
  });

  it('renders the CV builder', () => {
    renderPage(<Create />);
    expect(screen.getByText('Personal Info')).toBeInTheDocument();
    expect(screen.getByText('Save CV')).toBeInTheDocument();
  });
});
