import React, { useEffect, useState } from 'react';
import { Briefcase, ArrowRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
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
    try {
      if (editingId) {
        const updated = await api(`/api/applications/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setApplications((prev) => prev.map((a) => (String(a.id || a._id) === String(editingId) ? updated : a)));
      } else {
        const created = await api('/api/applications', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setApplications((prev) => [created, ...prev]);
      }
      resetForm();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
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
    try {
      await api(`/api/applications/${app.id || app._id}`, { method: 'DELETE' });
      setApplications((prev) => prev.filter((a) => String(a.id || a._id) !== String(app.id || app._id)));
      if (String(editingId) === String(app.id || app._id)) resetForm();
    } catch (err) {
      setError(errorMessage(err));
    }
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
          {loading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          {!loading && applications.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">
              No applications yet — add your first one above.
            </div>
          )}
          {applications.map((app) => (
            <div
              key={app.id || app._id}
              className="p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 group hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground font-bold text-sm">
                  {(app.company || app.title || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{app.title}</h3>
                  <p className="text-xs text-muted-foreground">{app.company || '—'}</p>
                  {app.notes && <p className="text-xs text-muted-foreground mt-1">{app.notes}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant={variantFor(app.status)} className="text-xs">
                  {labelFor(app.status)}
                </Badge>
                {app.remindAt && (
                  <span className="text-xs text-muted-foreground">Follow up {formatDate(app.remindAt)}</span>
                )}
                <span className="text-xs text-muted-foreground">{formatDate(app.createdAt)}</span>
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
          ))}
        </div>
      </Card>
    </div>
  );
}
