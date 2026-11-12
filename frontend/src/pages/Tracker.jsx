import React, { useEffect, useState } from 'react';
import { Briefcase, ArrowRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const STATUSES = [
  { value: 'wishlist', label: 'Wishlist', variant: 'muted' },
  { value: 'applied', label: 'Applied', variant: 'secondary' },
  { value: 'screening', label: 'Screening', variant: 'muted' },
  { value: 'interview', label: 'Interview', variant: 'accent' },
  { value: 'offer', label: 'Offer', variant: 'success' },
  { value: 'rejected', label: 'Rejected', variant: 'destructive' },
];

const variantFor = (value) => STATUSES.find((s) => s.value === value)?.variant || 'muted';
const labelFor = (value) => STATUSES.find((s) => s.value === value)?.label || value;

const emptyForm = { title: '', company: '', status: 'wishlist', notes: '', remindAt: '' };

export default function Tracker() {
  const [applications, setApplications] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await api('/api/applications');
      setApplications(data.items || []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError('Job title is required');
      return;
    }
    setBusy(true);
    setError('');
    const payload = {
      title: form.title.trim(),
      company: form.company.trim() || undefined,
      status: form.status,
      notes: form.notes.trim() || undefined,
      remindAt: form.remindAt || null,
    };

    if (editingId) {
      // Optimistic edit
      const previous = applications.find((a) => String(a.id || a._id) === String(editingId));
      const optimisticUpdated = { ...payload, id: editingId, _id: editingId };
      setApplications((prev) =>
        prev.map((a) =>
          String(a.id || a._id) === String(editingId) ? optimisticUpdated : a
        )
      );
      setEditingId(null);
      setForm(emptyForm);
      try {
        const updated = await api(`/api/applications/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setApplications((prev) =>
          prev.map((a) =>
            String(a.id || a._id) === String(editingId) ? { ...a, ...updated } : a
          )
        );
      } catch (err) {
        // Rollback
        setApplications((prev) =>
          prev.map((a) =>
            String(a.id || a._id) === String(editingId) ? previous : a
          )
        );
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    } else {
      // Optimistic create
      const optimisticId = `temp-${Date.now()}`;
      const optimisticApp = {
        ...payload,
        id: optimisticId,
        _id: optimisticId,
        createdAt: new Date().toISOString(),
        _optimistic: true,
      };
      setApplications((prev) => [optimisticApp, ...prev]);
      setForm(emptyForm);
      try {
        const created = await api('/api/applications', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setApplications((prev) =>
          prev.map((a) =>
            a._id === optimisticId ? { ...a, ...created, _optimistic: false } : a
          )
        );
      } catch (err) {
        // Rollback
        setApplications((prev) => prev.filter((a) => a._id !== optimisticId));
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    }
  };

  const handleEdit = (app) => {
    setEditingId(app.id || app._id);
    setForm({
      title: app.title || '',
      company: app.company || '',
      status: app.status || 'wishlist',
      notes: app.notes || '',
      remindAt: (app.remindAt || '').slice(0, 10),
    });
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (app) => {
    if (!confirm(`Delete "${app.title}" from your tracker?`)) return;
    const appId = app.id || app._id;
    const previousIndex = applications.findIndex(
      (a) => String(a.id || a._id) === String(appId)
    );
    const previous = applications[previousIndex];

    // Optimistic delete
    setApplications((prev) =>
      prev.filter((a) => String(a.id || a._id) !== String(appId))
    );
    if (String(editingId) === String(appId)) resetForm();

    try {
      await api(`/api/applications/${appId}`, { method: 'DELETE' });
    } catch (err) {
      // Rollback: insert back at previous position
      setApplications((prev) =>
        [...prev.slice(0, previousIndex), previous, ...prev.slice(previousIndex)]
      );
      setError(errorMessage(err));
    }
  };

  if (loading) {
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
        <div className="p-12">
          <LoadingState message="Loading applications…" />
        </div>
      </div>
    );
  }

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

      {error && (
        <Card padding="md" className="border-destructive/40">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      <Card padding="md" className="border-border space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {editingId ? 'Edit Application' : 'Add New Application'}
          </h3>
          {editingId && (
            <Button variant="outline" size="sm" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Input
            label="Job Title"
            placeholder="e.g. Senior Frontend Engineer"
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
          />
          <Input
            label="Company"
            placeholder="e.g. TechCorp"
            value={form.company}
            onChange={(e) => setField('company', e.target.value)}
          />
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-foreground mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setField('status', e.target.value)}
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
            value={form.remindAt}
            onChange={(e) => setField('remindAt', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block uppercase tracking-wider">
            Notes
          </label>
          <textarea
            placeholder="Interview details, contact person, etc."
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            className="input w-full h-24 resize-y"
          />
        </div>
        <Button variant="primary" onClick={handleSubmit} className="w-full py-2" disabled={busy}>
          <ArrowRight className="w-4 h-4 mr-2" />
          {busy ? 'Saving…' : editingId ? 'Save Changes' : 'Add'}
        </Button>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
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
          {applications.length === 0 && (
            <div className="p-6">
              <EmptyState
                icon={<Briefcase className="w-8 h-8 text-muted-foreground" />}
                title="No applications yet"
                description="Add your first application to start tracking."
                action={
                  <Button variant="outline" size="sm" onClick={() => window.scrollTo({ top: 0 })}>
                    Add Application
                  </Button>
                }
              />
            </div>
          )}
          {applications.map((app) => (
            <div
              key={app.id || app._id}
              className="p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 group hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 shrink-0 rounded-lg bg-muted flex items-center justify-center text-muted-foreground font-bold text-sm">
                  {(app.company || app.title || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground break-words">{app.title}</h3>
                  <p className="text-xs text-muted-foreground break-words">{app.company || '—'}</p>
                  {app.notes && <p className="text-xs text-muted-foreground mt-1 break-words">{app.notes}</p>}
                </div>
              </div>
              <div className="flex w-full items-center gap-3 flex-wrap md:w-auto">
                <Badge variant={variantFor(app.status)} className="text-xs">
                  {labelFor(app.status)}
                </Badge>
                {app.remindAt && (
                  <span className="text-xs text-muted-foreground">Follow up {formatDate(app.remindAt)}</span>
                )}
                <span className="text-xs text-muted-foreground">{formatDate(app.createdAt)}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button variant="outline" size="sm" className="px-3 py-1.5" onClick={() => handleEdit(app)}>
                    Edit
                  </Button>
                  <button
                    onClick={() => handleDelete(app)}
                    className="text-destructive p-1.5 hover:bg-destructive/10 rounded"
                    aria-label={`Delete ${app.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}