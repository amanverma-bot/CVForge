import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  Upload,
  Search,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { api, apiBlob, downloadBlob, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

const BAR_COLORS = {
  keyword_match: 'bg-primary',
  semantic_similarity: 'bg-secondary',
  skill_coverage: 'bg-success',
  ats_compatibility: 'bg-destructive',
};

export default function Analyzer() {
  const navigate = useNavigate();
  const [cvText, setCvText] = useState('');
  const [jdText, setJdText] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [fresherMode, setFresherMode] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!cvText.trim() || !jdText.trim()) {
      setError('Please enter both CV text and job description');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = { cv_text: cvText, jd_text: jdText, ...(fresherMode ? { mode: 'fresher' } : {}) };
      const analysis = await api('/api/analyze', { method: 'POST', body: JSON.stringify(body) });
      const scores = analysis.scores || {};
      setResults({
        overall: Number(scores.overall) || 0,
        verdict: scores.verdict || 'Analyzed',
        keyword_match: Number(scores.keyword_match) || 0,
        semantic_similarity: Number(scores.semantic_similarity) || 0,
        skill_coverage: Number(scores.skill_coverage) || 0,
        ats_compatibility:
          Number(analysis.ats_compatibility ?? analysis.detailed?.ats_compatibility) || 0,
        matched: analysis.skills?.matched || [],
        missing: analysis.skills?.missing || analysis.detailed?.keywords?.missing || [],
        suggestions: analysis.detailed?.suggestions || [],
      });
      // Persist to history without blocking the result view.
      api('/api/history', { method: 'POST', body: JSON.stringify({ cv_text: cvText, jd_text: jdText }) }).catch(() => {});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    if (!results) return;
    setDownloading(true);
    setError('');
    try {
      const lines = [
        'CV ANALYSIS REPORT',
        '',
        `Overall score: ${results.overall}/100 (${results.verdict})`,
        `Keyword match: ${results.keyword_match}%`,
        `Semantic similarity: ${results.semantic_similarity}%`,
        `Skill coverage: ${results.skill_coverage}%`,
        `ATS compatibility: ${results.ats_compatibility}%`,
        '',
        `Matched skills: ${results.matched.join(', ') || 'None detected'}`,
        `Missing skills: ${results.missing.join(', ') || 'None detected'}`,
        '',
        'Improvement suggestions:',
        ...results.suggestions.map((s, i) => `${i + 1}. ${s}`),
      ];
      const blob = await apiBlob('/api/pdf', {
        method: 'POST',
        body: JSON.stringify({ title: 'CV Analysis Report', text: lines.join('\n') }),
      });
      downloadBlob(blob, 'cv-analysis-report.pdf');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  if (!results) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">CV Analyzer</h1>
            <p className="text-muted-foreground">
              Get an instant ATS score and detailed feedback on your resume against any job description.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setFresherMode(!fresherMode)}>
              <Sparkles className="w-4 h-4 mr-1" />
              {fresherMode ? 'Fresher Mode ON' : 'Fresher Mode'}
            </Button>
          </div>
        </div>

        {error && (
          <Card padding="md" className="border-destructive/40">
            <p className="text-sm text-destructive">{error}</p>
          </Card>
        )}

        <Card padding="md" className="border-border">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Your CV / Resume</h3>
              </div>
              <textarea
                placeholder="Paste your CV text here..."
                value={cvText}
                onChange={(e) => setCvText(e.target.value)}
                className="input w-full h-64 resize-y"
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <Upload className="w-4 h-4" />
                Paste text — file upload is available through the REST API.
              </label>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Job Description</h3>
              </div>
              <textarea
                placeholder="Paste the job description here..."
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                className="input w-full h-64 resize-y"
              />
              <div className="flex gap-2">
                <input
                  className="input w-full flex-1 opacity-60"
                  placeholder="JD URL import is not available in this version"
                  disabled
                />
                <Button variant="outline" size="sm" disabled>
                  Import
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-6">
            <Button
              variant="primary"
              onClick={handleAnalyze}
              className="w-full py-3"
              disabled={busy || !cvText.trim() || !jdText.trim()}
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  Analyzing...
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </span>
              ) : 'Analyze Resume'}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const scoreColor =
    results.overall >= 80 ? 'text-success' : results.overall >= 65 ? 'text-primary' : 'text-destructive';
  const scoreHex = results.overall >= 80 ? '#16A34A' : results.overall >= 65 ? '#1E3A5F' : '#DC2626';

  return (
    <div className="space-y-6">
      {error && (
        <Card padding="md" className="border-destructive/40">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analysis Results</h1>
          <p className="text-muted-foreground">
            Your CV scored <span className="font-semibold">{results.overall}/100</span> against the job description.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setResults(null)}>
            Run Another
          </Button>
          <Button variant="outline" onClick={() => navigate('/create')}>
            <ArrowRight className="w-4 h-4 mr-1" />
            Apply to CV Builder
          </Button>
          <Button variant="primary" onClick={handleDownload} disabled={downloading}>
            {downloading ? 'Preparing…' : 'Download Report'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card padding="md" className="border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Overall Score</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={cn('text-3xl font-bold', scoreColor)}>{results.overall}</span>
                <span className="text-sm text-muted-foreground">/100</span>
              </div>
              <Badge variant={results.overall >= 80 ? 'success' : results.overall >= 65 ? 'primary' : 'destructive'}>
                {results.verdict}
              </Badge>
            </div>
            <div className="w-16 h-16 rounded-full flex items-center justify-center border-4 border-gray-100">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" fill="none" stroke="#E5E7EB" strokeWidth="2" />
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  stroke={scoreHex}
                  strokeWidth="2"
                  strokeDasharray="56.5"
                  strokeDashoffset={56.5 - (results.overall / 100) * 56.5}
                  className="transition-all duration-1000"
                />
              </svg>
            </div>
          </div>
        </Card>

        <Card padding="md" className="border-border">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Keyword Match</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-primary">{results.keyword_match}</span>
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="h-full bg-primary rounded-full transition-all duration-1000"
                style={{ width: `${results.keyword_match}%` }}
              />
            </div>
          </div>
        </Card>

        <Card padding="md" className="border-border">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Skill Coverage</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-primary">{results.skill_coverage}</span>
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="h-full bg-success rounded-full transition-all duration-1000"
                style={{ width: `${results.skill_coverage}%` }}
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="md" className="border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              <h3 className="text-sm font-semibold text-foreground">Matched Skills</h3>
            </div>
            <span className="text-xs text-muted-foreground">{results.matched.length} skills</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {results.matched.length === 0 && (
              <p className="text-sm text-muted-foreground">No matching skills detected.</p>
            )}
            {results.matched.map((skill) => (
              <Badge key={skill} variant="success" className="text-xs">
                {skill}
              </Badge>
            ))}
          </div>
        </Card>

        <Card padding="md" className="border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <h3 className="text-sm font-semibold text-foreground">Missing Skills</h3>
            </div>
            <span className="text-xs text-muted-foreground">{results.missing.length} skills</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {results.missing.length === 0 && (
              <p className="text-sm text-muted-foreground">No missing skills — great coverage.</p>
            )}
            {results.missing.map((skill) => (
              <Badge key={skill} variant="destructive" className="text-xs">
                {skill}
              </Badge>
            ))}
          </div>
        </Card>

        <Card padding="md" className="border-border">
          <h3 className="text-sm font-semibold text-foreground mb-4">Improvement Suggestions</h3>
          <ul className="space-y-3">
            {results.suggestions.length === 0 && (
              <li className="text-sm text-muted-foreground">No suggestions — strong match.</li>
            )}
            {results.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">{s}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card padding="md" className="border-border">
          <h3 className="text-sm font-semibold text-foreground mb-4">Score Breakdown</h3>
          <div className="space-y-4">
            {[
              { key: 'keyword_match', label: 'Keyword Match', value: results.keyword_match },
              { key: 'semantic_similarity', label: 'Semantic Similarity', value: results.semantic_similarity },
              { key: 'skill_coverage', label: 'Skill Coverage', value: results.skill_coverage },
              { key: 'ats_compatibility', label: 'ATS Compatibility', value: results.ats_compatibility },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div
                      className={cn('h-full rounded-full transition-all duration-1000', BAR_COLORS[item.key])}
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold">{item.value}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
