import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Briefcase,
  ChartPie,
  ArrowRight,
  TrendingUp,
  CheckCircle,
  Cpu,
  Mail,
  FileText,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';
import { formatDate, formatRelativeTime } from '@/lib/utils';

const AI_PROVIDER = {
  openai: { label: 'OpenAI', variant: 'success' },
  local: { label: 'Local LLM', variant: 'accent' },
  offline: { label: 'Offline fallback', variant: 'muted' },
};

const STATUS_VARIANT = {
  wishlist: 'muted',
  applied: 'secondary',
  screening: 'muted',
  interview: 'accent',
  offer: 'success',
  rejected: 'destructive',
};

function latestAts(history) {
  if (!history.length) return 0;
  try {
    const first = JSON.parse(history[0].resultJson || '{}');
    return first.detailed?.ats_compatibility ?? first.ats_compatibility ?? 0;
  } catch {
    return 0;
  }
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useStore();
  const [cvs, setCvs] = useState([]);
  const [history, setHistory] = useState([]);
  const [applications, setApplications] = useState([]);
  const [aiStatus, setAiStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cvRes, histRes, appRes] = await Promise.all([
          api('/api/cvs'),
          api('/api/history'),
          api('/api/applications'),
        ]);
        if (cancelled) return;
        setCvs(cvRes.items || []);
        setHistory(histRes.items || []);
        setApplications(appRes.items || []);
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'Could not load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/api/health');
        if (!cancelled) setAiStatus(res?.ai || { active: res?.llm ? 'openai' : 'offline', providers: {} });
      } catch {
        if (!cancelled) setAiStatus({ active: 'offline', providers: {}, unavailable: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bestScore = history.reduce((best, item) => Math.max(best, Number(item.overall) || 0), 0);
  const ats = latestAts(history);
  const activeApps = applications.filter((a) => !['rejected'].includes(a.status)).length;
  const interviewCount = applications.filter((a) => ['interview', 'offer'].includes(a.status)).length;
  const upcoming = applications.filter((a) => a.remindAt).length;
  const aiMeta = aiStatus?.unavailable
    ? { label: 'AI status unavailable', variant: 'muted' }
    : aiStatus
      ? AI_PROVIDER[aiStatus.active] || AI_PROVIDER.offline
      : { label: 'Checking AI…', variant: 'muted' };
  const aiTitle = aiStatus?.providers
    ? Object.values(aiStatus.providers)
        .map((p) => `${p.label}: ${p.available ? 'available' : p.configured ? 'unavailable' : 'not configured'}`)
        .join(' · ')
    : 'AI provider status';

  const statCards = [
    {
      title: 'CV Score (Best)',
      value: `${bestScore}/100`,
      change: history.length ? `${history.length} analyses saved` : 'Run your first analysis',
      icon: BarChart3,
    },
    {
      title: 'ATS Compatibility',
      value: `${ats}%`,
      change: history[0]?.verdict || 'No analysis yet',
      icon: CheckCircle,
    },
    {
      title: 'Applications',
      value: String(applications.length),
      change: `${activeApps} active`,
      icon: Briefcase,
    },
    {
      title: 'Interviews',
      value: String(interviewCount),
      change: upcoming ? `${upcoming} reminder(s)` : 'No reminders set',
      icon: Mail,
    },
  ];

  const recentCVs = cvs.slice(0, 3).map((cv) => {
    const match = history.find((h) => String(h.cvId) === String(cv.id || cv._id));
    return {
      id: cv.id || cv._id,
      name: cv.personalInfo?.name || cv.generatedText?.split('\n')[0] || 'Untitled CV',
      role: cv.role || 'My CV',
      template: cv.template || 'modern',
      score: match ? match.overall : null,
      date: cv.updatedAt || cv.createdAt,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back{user?.name ? `, ${user.name}` : ''}. Here&apos;s your career overview.
          </p>
        </div>
        <div className="flex flex-col items-start md:items-end gap-2">
          <Badge
            variant={aiMeta.variant}
            className="gap-2"
            aria-label={`Active AI provider: ${aiMeta.label}`}
            title={aiTitle}
          >
            <Cpu className="w-3 h-3" /> {aiMeta.label}
          </Badge>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/create')}>
              <FileText className="w-4 h-4 mr-2" /> New CV
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/analyzer')}>
              <BarChart3 className="w-4 h-4 mr-2" /> Analyze CV
            </Button>
          </div>
        </div>
      </div>

      {loadError && (
        <Card padding="md" className="border-destructive/40">
          <p className="text-sm text-destructive">{loadError}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} padding="md" className="border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <Skeleton variant="text" className="w-24" />
                    <Skeleton variant="text" className="w-32 h-8 mt-2" />
                    <Skeleton variant="text" className="w-48 h-4 mt-2" />
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                    <Skeleton variant="circle" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          statCards.map((stat) => (
            <Card key={stat.title} padding="md" className="hover:shadow-md transition-shadow border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs mt-1 flex items-center gap-1 text-muted-foreground">
                    <TrendingUp className="w-3 h-3 text-success" /> {stat.change}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500">
                  <stat.icon className="w-5 h-5" />
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            title: 'Create Your First CV',
            desc: 'Guided builder with live preview and PDF export',
            icon: FileText,
            href: '/create',
          },
          {
            title: 'Analyze Against JD',
            desc: 'Get ATS score and keyword match report',
            icon: BarChart3,
            href: '/analyzer',
          },
          {
            title: 'Match Jobs',
            desc: 'Compare CV against multiple job descriptions',
            icon: ChartPie,
            href: '/match',
          },
        ].map((action) => (
          <Card
            key={action.title}
            padding="none"
            className="group cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => navigate(action.href)}
          >
            <div className="p-6">
              <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 mb-4 group-hover:text-primary transition-colors">
                <action.icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">{action.title}</h3>
              <p className="text-sm text-muted-foreground">{action.desc}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="none" className="scroll-mt-24" id="my-cvs">
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Your CVs</h2>
              <Link to="/create" className="text-xs text-primary font-semibold hover:underline">
                New CV
              </Link>
            </div>
          </div>
          <div className="divide-y divide-border">
            {recentCVs.length === 0 && (
              <div className="p-6">
                {loading ? (
                  <LoadingState message="Loading CVs…" />
                ) : (
                  <EmptyState
                    icon={<FileText className="w-8 h-8 text-muted-foreground" />}
                    title="No CVs yet"
                    description="Build your first CV to get started."
                    action={
                      <Button variant="primary" size="sm" onClick={() => navigate('/create')}>
                        Create New CV
                      </Button>
                    }
                  />
                )}
              </div>
            )}
            {recentCVs.map((cv) => (
              <div key={cv.id} className="p-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between group hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                    {cv.template.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground break-words">{cv.name}</h3>
                    <p className="text-xs text-muted-foreground break-words">
                      {cv.role} • {cv.template}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:gap-4">
                  <Badge variant={cv.score == null ? 'muted' : 'success'} className="text-xs">
                    {cv.score == null ? 'Not analyzed' : `${cv.score}% score`}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(cv.date)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-border bg-muted/50">
            <Button variant="outline" size="sm" className="w-full" onClick={() => navigate('/create')}>
              <ArrowRight className="w-4 h-4 mr-2" /> Create New CV
            </Button>
          </div>
        </Card>

        <Card padding="none">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Recent Applications</h2>
          </div>
          <div className="divide-y divide-border">
            {applications.length === 0 && (
              <div className="p-6">
                {loading ? (
                  <LoadingState message="Loading applications…" />
                ) : (
                  <EmptyState
                    icon={<Mail className="w-8 h-8 text-muted-foreground" />}
                    title="No applications tracked yet"
                    description="Start tracking your job applications."
                    action={
                      <Button variant="outline" size="sm" onClick={() => navigate('/tracker')}>
                        Open Tracker
                      </Button>
                    }
                  />
                )}
              </div>
            )}
            {applications.slice(0, 3).map((app) => (
              <div key={app.id || app._id} className="p-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between group hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-muted flex items-center justify-center text-muted-foreground font-bold text-sm">
                    {(app.company || app.title || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground break-words">{app.title}</h3>
                    <p className="text-xs text-muted-foreground break-words">{app.company || '—'}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <Badge variant={STATUS_VARIANT[app.status] || 'muted'} className="text-xs">
                    {String(app.status || 'wishlist').charAt(0).toUpperCase() + String(app.status || 'wishlist').slice(1)}
                  </Badge>
                  {app.remindAt && (
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(app.remindAt)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-border bg-muted/50">
            <Button variant="outline" size="sm" className="w-full" onClick={() => navigate('/tracker')}>
              <Mail className="w-4 h-4 mr-2" /> Open Tracker
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
