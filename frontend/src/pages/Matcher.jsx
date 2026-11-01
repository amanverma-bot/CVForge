import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ArrowRight,
  Briefcase,
  Search,
  CheckCircle,
  AlertTriangle,
  Star,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function Matcher() {
  const navigate = useNavigate();
  const [cvText, setCvText] = useState('');
  const [jobs, setJobs] = useState([
    { id: '1', title: 'Software Engineer', text: 'React, Node.js, Python, AWS, Docker' },
    { id: '2', title: 'Frontend Developer', text: 'React, TypeScript, JavaScript, CSS, HTML' },
    { id: '3', title: 'Backend Developer', text: 'Python, Django, PostgreSQL, Redis, AWS' },
  ]);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);

  const addJob = () => {
    setJobs([...jobs, { id: Date.now().toString(), title: '', text: '' }]);
  };

  const removeJob = (id) => {
    setJobs(jobs.filter((j) => j.id !== id));
  };

  const updateJob = (id, field, value) => {
    setJobs(jobs.map((j) => (j.id === id ? { ...j, [field]: value } : j)));
  };

  const handleMatch = async () => {
    if (!cvText.trim()) {
      alert('Please enter your CV text');
      return;
    }
    if (!jobs.some((j) => j.text.trim())) {
      alert('Please add at least one job description');
      return;
    }
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 1500));
      setResults(
        jobs
          .map((j) => {
            const cvWords = cvText.toLowerCase().split(/\s+/);
            const jdWords = j.text.toLowerCase().split(/\s+/);
            const matched = jdWords.filter((w) => cvText.toLowerCase().includes(w));
            const score = Math.round((matched.length / Math.max(jdWords.length, 1)) * 100);
            return {
              id: j.id,
              title: j.title,
              score,
              missing: jdWords.filter((w) => !cvText.toLowerCase().includes(w)).slice(0, 5),
            };
          })
          .sort((a, b) => b.score - a.score)
      );
    } catch {
      alert('Matching failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Job Matcher</h1>
          <p className="text-muted-foreground">
            Compare your CV against multiple job descriptions to find your best fit.
          </p>
        </div>
      </div>

      <Card padding="md" className="border-border space-y-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Your CV</h3>
            <Input
              label=""
              placeholder="Paste your CV text here..."
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
              className="h-48"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Job Descriptions</h3>
              <Button variant="outline" size="sm" onClick={addJob}>
                <Plus className="w-3 h-3 mr-1" /> Add Job
              </Button>
            </div>
            {jobs.map((job) => (
              <div key={job.id} className="flex items-center gap-3 p-3 bg-muted rounded-lg border border-border">
                <Input
                  label=""
                  placeholder="Job title"
                  value={job.title}
                  onChange={(e) => updateJob(job.id, 'title', e.target.value)}
                  className="flex-1 text-sm"
                />
                <Input
                  label=""
                  placeholder="Required skills (comma-separated)"
                  value={job.text}
                  onChange={(e) => updateJob(job.id, 'text', e.target.value)}
                  className="flex-2 text-sm"
                />
                <button
                  onClick={() => removeJob(job.id)}
                  className="text-destructive p-1 hover:bg-destructive/10 rounded"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <Button
            variant="primary"
            onClick={handleMatch}
            className="w-full py-3"
            disabled={busy || !cvText.trim()}
          >
            {busy ? 'Matching...' : 'Find Best Matches'}
          </Button>
        </div>
      </Card>

      {results && (
        <div>
          <h2 className="text-lg font-bold text-foreground mb-4">Matching Results</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {results.map((match, i) => (
              <Card key={match.id} padding="md" className={cn(
                'border-border hover:shadow-md transition-shadow flex flex-col',
                i === 0 ? 'border-primary shadow-sm' : ''
              )}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{match.title}</h3>
                    <span className="text-xs text-muted-foreground">#{i + 1} match</span>
                  </div>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary text-white">
                    <span className="font-bold">{i + 1}</span>
                  </div>
                </div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-bold text-primary">{match.score}</span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                  <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${match.score}%` }} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Missing Skills
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {match.missing.map((skill) => (
                      <Badge key={skill} variant="destructive" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}