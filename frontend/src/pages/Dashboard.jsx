import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Briefcase,
  FileText,
  ChartPie,
  Clock,
  Users,
  ArrowRight,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { formatDate, formatRelativeTime } from '@/lib/utils';

const statCards = [
  {
    title: 'CV Score (Best)',
    value: '87/100',
    change: '+12 vs last month',
    changeType: 'positive',
    icon: BarChart3,
    color: 'text-primary',
  },
  {
    title: 'ATS Compatibility',
    value: '92%',
    change: '+5 vs last month',
    changeType: 'positive',
    icon: CheckCircle,
    color: 'text-success',
  },
  {
    title: 'Applications',
    value: '14',
    change: '3 this week',
    changeType: 'neutral',
    icon: Briefcase,
    color: 'text-info',
  },
  {
    title: 'Interviews',
    value: '3',
    change: '1 upcoming',
    changeType: 'positive',
    icon: Users,
    color: 'text-accent',
  },
];

const recentCVs = [
  {
    id: '1',
    name: 'Software Engineer Resume',
    role: 'Software Engineer',
    template: 'Modern',
    score: 87,
    date: '2026-10-28',
    status: 'active',
  },
  {
    id: '2',
    name: 'Product Manager CV',
    role: 'Product Manager',
    template: 'Professional',
    score: 76,
    date: '2026-10-25',
    status: 'draft',
  },
  {
    id: '3',
    name: 'Data Analyst Resume',
    role: 'Data Analyst',
    template: 'Tech',
    score: 91,
    date: '2026-10-22',
    status: 'active',
  },
];

const applications = [
  {
    id: '1',
    title: 'Senior Frontend Engineer',
    company: 'TechCorp',
    status: 'interview',
    date: '2026-10-25',
    remindAt: '2026-11-02',
  },
  {
    id: '2',
    title: 'Full Stack Developer',
    company: 'StartupX',
    status: 'applied',
    date: '2026-10-23',
    remindAt: '2026-11-01',
  },
  {
    id: '3',
    title: 'React Developer',
    company: 'WebFlow',
    status: 'rejected',
    date: '2026-10-20',
    remindAt: null,
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back. Here's your career overview.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/create')}>
            <FileText className="w-4 h-4 mr-2" /> New CV
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/analyzer')}>
            <BarChart3 className="w-4 h-4 mr-2" /> Analyze CV
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} padding="md" className="hover:shadow-md transition-shadow border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs mt-1 flex items-center gap-1">
                  {stat.changeType === 'positive' ? (
                    <>
                      <TrendingUp className="w-3 h-3 text-success" /> {stat.change}
                    </>
                  ) : stat.changeType === 'negative' ? (
                    <>
                      <span className="text-destructive">▼</span> {stat.change}
                    </>
                  ) : (
                    <span className="text-muted-foreground">{stat.change}</span>
                  )}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500">
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            title: 'Create Your First CV',
            desc: 'Guided builder with live preview and PDF export',
            icon: FileText,
            color: 'text-primary',
            href: '/create',
          },
          {
            title: 'Analyze Against JD',
            desc: 'Get ATS score and keyword match report',
            icon: BarChart3,
            color: 'text-info',
            href: '/analyzer',
          },
          {
            title: 'Match Jobs',
            desc: 'Compare CV against multiple job descriptions',
            icon: ChartPie,
            color: 'text-accent',
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

      {/* Recent CVs & Applications Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent CVs */}
        <Card padding="none">
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Your CVs</h2>
              <Link to="/dashboard" className="text-xs text-primary font-semibold hover:underline">
                View all
              </Link>
            </div>
          </div>
          <div className="divide-y divide-border">
            {recentCVs.map((cv) => (
              <div key={cv.id} className="p-6 flex items-center justify-between group hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                    {cv.template.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{cv.name}</h3>
                    <p className="text-xs text-muted-foreground">{cv.role} • {cv.template}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant="success" className="text-xs">
                    {cv.score}% ATS
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

        {/* Recent Applications */}
        <Card padding="none">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Recent Applications</h2>
          </div>
          <div className="divide-y divide-border">
            {applications.map((app) => (
              <div key={app.id} className="p-6 flex items-center justify-between group hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground font-bold text-sm">
                    {app.company.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{app.title}</h3>
                    <p className="text-xs text-muted-foreground">{app.company}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={app.status === 'interview' ? 'accent' : app.status === 'applied' ? 'info' : 'destructive'}
                    className="text-xs"
                  >
                    {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
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