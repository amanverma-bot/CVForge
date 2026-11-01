import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Mail,
  Calendar,
  ArrowRight,
  CheckCircle,
  X,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

const STATUSES = [
  { value: 'wishlist', label: 'Wishlist', color: 'text-muted' },
  { value: 'applied', label: 'Applied', color: 'text-info' },
  { value: 'screening', label: 'Screening', color: 'text-primary' },
  { value: 'interview', label: 'Interview', color: 'text-accent' },
  { value: 'offer', label: 'Offer', color: 'text-success' },
  { value: 'rejected', label: 'Rejected', color: 'text-destructive' },
];

const applications = [
  {
    id: '1',
    title: 'Senior Frontend Engineer',
    company: 'TechCorp',
    status: 'interview',
    date: '2026-10-25',
    remindAt: '2026-11-02',
    notes: 'Technical interview scheduled',
  },
  {
    id: '2',
    title: 'Full Stack Developer',
    company: 'StartupX',
    status: 'applied',
    date: '2026-10-23',
    remindAt: '2026-11-01',
    notes: 'Applied via company website',
  },
  {
    id: '3',
    title: 'React Developer',
    company: 'WebFlow',
    status: 'rejected',
    date: '2026-10-20',
    remindAt: null,
    notes: 'Not a cultural fit',
  },
];

export default function Tracker() {
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState('wishlist');
  const [notes, setNotes] = useState('');
  const [remindAt, setRemindAt] = useState('');

  const statusConfig = STATUSES.find((s) => s.value === status);

  const addApplication = () => {
    if (!title.trim()) return;
    alert(`Added ${title} at ${company || 'Company'} to tracker`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Application Tracker</h1>
          <p className="text-muted-foreground">
            Track every job application, set reminders, and manage your pipeline.
          </p>
        </div>
      </div>

      <Card padding="md" className="border-border space-y-6">
        <h3 className="text-sm font-semibold text-foreground mb-2">Add New Application</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Input
            label="Job Title"
            placeholder="e.g. Senior Frontend Engineer"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            label="Company"
            placeholder="e.g. TechCorp"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-foreground mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input w-full"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Follow-up Date"
            type="date"
            value={remindAt}
            onChange={(e) => setRemindAt(e.target.value)}
          />
          <Button variant="primary" onClick={addApplication} className="w-full py-2">
            <ArrowRight className="w-4 h-4 mr-2" />
            Add
          </Button>
        </div>
        <Input
          label="Notes"
          placeholder="Interview details, contact person, etc."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-32"
        />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {STATUSES.map((s) => {
          const count = applications.filter((a) => a.status === s.value).length;
          return (
            <Card key={s.value} padding="md" className="border-border text-center">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-3 bg-gray-100 dark:bg-gray-800">
                <Briefcase className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold text-foreground">{count}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
            </Card>
          );
        })}
      </div>

      <Card padding="none" className="border-border">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Your Applications</h2>
        </div>
        <div className="divide-y divide-border">
          {applications.map((app) => (
            <div key={app.id} className="p-6 flex items-center justify-between group hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground font-bold text-sm">
                  {app.company.charAt(0)}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{app.title}</h3>
                  <p className="text-xs text-muted-foreground">{app.company}</p>
                  {app.notes && (
                    <p className="text-xs text-muted-foreground mt-1">{app.notes}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={statusConfig?.color || 'muted'} className="text-xs">
                  {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                </Badge>
                <span className="text-xs text-muted-foreground">{app.date}</span>
                <Button variant="outline" size="sm" className="px-3 py-1.5">
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}