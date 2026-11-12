// Smoke tests for the API-wired pages: each renders without crashing and
// replaces demo data with live (mocked) API responses.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/api', () => ({
  api: vi.fn(async (path) => {
    if (path === '/api/cvs') return { items: [] };
    if (path === '/api/history') return { items: [] };
    if (path === '/api/applications') return { items: [] };
    if (path === '/api/jd-import') return { text: 'Senior Python engineer with Flask, SQL, and Docker experience.' };
    if (path === '/api/analyze') return { scores: { overall: 72, verdict: 'Good', keyword_match: 60, semantic_similarity: 55, skill_coverage: 50 }, skills: { matched: [], missing: [] }, detailed: { suggestions: [] } };
    if (path === '/api/health') {
      return {
        ok: true,
        llm: false,
        ai: { active: 'offline', providers: { openai: { label: 'OpenAI', configured: false, available: false }, local: { label: 'Local LLM', configured: true, available: false } } },
      };
    }
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
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';

const renderPage = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(await screen.findByLabelText('Active AI provider: Offline fallback')).toBeInTheDocument();
  });

  it('renders the analyzer form', () => {
    renderPage(<Analyzer />);
    expect(screen.getByRole('heading', { name: 'CV Analyzer' })).toBeInTheDocument();
    expect(screen.getByText('Analyze Resume')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload CV file')).toBeInTheDocument();
    expect(screen.getByLabelText('Job description URL')).toBeInTheDocument();
  });

  it('imports a JD URL and uploads a CV file for analysis', async () => {
    const user = userEvent.setup();
    renderPage(<Analyzer />);

    await user.type(
      screen.getByLabelText('Job description URL'),
      'https://jobs.example.com/python-engineer'
    );
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(
      await screen.findByDisplayValue(/Senior Python engineer/)
    ).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/api/jd-import', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://jobs.example.com/python-engineer' }),
    });

    const file = new File(['Jane Doe\nPython developer with SQL experience.'], 'jane-cv.txt', {
      type: 'text/plain',
    });
    await user.upload(screen.getByLabelText('Upload CV file'), file);
    expect(screen.getByText('jane-cv.txt')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Analyze Resume' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/api/analyze',
        expect.objectContaining({ method: 'POST', body: expect.any(FormData) })
      )
    );
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
    expect(screen.getByText('Save Draft')).toBeInTheDocument();
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
    expect(screen.getByText('YOUR NAME')).toBeInTheDocument();
  });

  it('updates the live preview as the user types', async () => {
    const user = userEvent.setup();
    renderPage(<Create />);
    await user.type(screen.getByLabelText('Full Name'), 'Ada Lovelace');
    expect(
      screen.getByRole('heading', { level: 2, name: /ada lovelace/i })
    ).toBeInTheDocument();
  });
});
