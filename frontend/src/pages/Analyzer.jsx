import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  ClipboardList,
  Upload,
  Search,
  Sparkles,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

export default function Analyzer() {
  const navigate = useNavigate();
  const [cvText, setCvText] = useState('');
  const [jdText, setJdText] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fresherMode, setFresherMode] = useState(false);

  const handleAnalyze = async () => {
    if (!cvText.trim() || !jdText.trim()) {
      alert('Please enter both CV text and job description');
      return;
    }
    setBusy(true);
    try {
      // Simulate API call
      await new Promise((r) => setTimeout(r, 1500));
      setResults({
        overall: 82,
        verdict: 'Strong Match',
        keyword_match: 78,
        semantic_similarity: 85,
        skill_coverage: 88,
        ats_compatibility: 90,
        matched: ['Python', 'React', 'SQL', 'Git', 'AWS'],
        missing: ['Docker', 'Kubernetes', 'TypeScript'],
        suggestions: [
          'Add more quantifiable metrics to your experience bullets',
          'Include Docker and Kubernetes skills if you have them',
          'Consider adding a projects section with links',
        ],
      });
    } catch (err) {
      alert('Analysis failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!results) {
    return (
      <div className="space-y-6">
        {/* Header */}
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

        <Card padding="md" className="border-border">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Your CV / Resume</h3>
              </div>
              <Input
                label=""
                placeholder="Paste your CV text here..."
                value={cvText}
                onChange={(e) => setCvText(e.target.value)}
                className="h-64"
              />
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Job Description</h3>
              </div>
              <Input
                label=""
                placeholder="Paste the job description here..."
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                className="h-64"
              />
              <div className="flex gap-2">
                <Input
                  label=""
                  placeholder="Or paste JD URL..."
                  value=""
                  disabled
                  className="flex-1"
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

  const scoreColor = results.overall >= 80 ? 'text-success' : results.overall >= 65 ? 'text-primary' : 'text-destructive';

  return (
    <div className="space-y-6">
      {/* Results Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analysis Results</h1>
          <p className="text-muted-foreground">
            Your CV scored <span className="font-semibold">{results.overall}/100</span> against the job description.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/create')}>
            <ArrowRight className="w-4 h-4 mr-1" />
            Apply to CV Builder
          </Button>
          <Button variant="primary">
            Download Report
          </Button>
        </div>
      </div>

      {/* Score Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card padding="md" className="border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Overall Score</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-bold {scoreColor}">{results.overall}</span>
                <span className="text-sm text-muted-foreground">/100</span>
              </div>
              <Badge variant={results.overall >= 80 ? 'success' : results.overall >= 65 ? 'primary' : 'destructive'}>
                {results.verdict}
              </Badge>
            </div>
            <div className="w-16 h-16 rounded-full flex items-center justify-center border-4 border-gray-100">
              <svg className="w-full h-full transform -rotate-90" stroke="currentColor" strokeWidth="4">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeDasharray="56.5" strokeDashoffset={56.5 - (results.overall / 100) * 56.5} className="text-primary transition-all duration-1000" />
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1" opacity="0.2" />
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
              <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${results.keyword_match}%` }} />
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
              <div className="h-full bg-success rounded-full transition-all duration-1000" style={{ width: `${results.skill_coverage}%` }} />
            </div>
          </div>
        </Card>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Matched Skills */}
        <Card padding="md" className="border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              <h3 className="text-sm font-semibold text-foreground">Matched Skills</h3>
            </div>
            <span className="text-xs text-muted-foreground">{results.matched.length} skills</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {results.matched.map((skill) => (
              <Badge key={skill} variant="success" className="text-xs">
                {skill}
              </Badge>
            ))}
          </div>
        </Card>

        {/* Missing Skills */}
        <Card padding="md" className="border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <h3 className="text-sm font-semibold text-foreground">Missing Skills</h3>
            </div>
            <span className="text-xs text-muted-foreground">{results.missing.length} skills</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {results.missing.map((skill) => (
              <Badge key={skill} variant="destructive" className="text-xs">
                {skill}
              </Badge>
            ))}
          </div>
        </Card>

        {/* Suggestions */}
        <Card padding="md" className="border-border">
          <h3 className="text-sm font-semibold text-foreground mb-4">Improvement Suggestions</h3>
          <ul className="space-y-3">
            {results.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">{s}</p>
              </li>
            ))}
          </ul>
        </Card>

        {/* Score Breakdown */}
        <Card padding="md" className="border-border">
          <h3 className="text-sm font-semibold text-foreground mb-4">Score Breakdown</h3>
          <div className="space-y-4">
            {[
              { label: 'Keyword Match', value: results.keyword_match, color: 'text-primary' },
              { label: 'Semantic Similarity', value: results.semantic_similarity, color: 'text-info' },
              { label: 'Skill Coverage', value: results.skill_coverage, color: 'text-accent' },
              { label: 'ATS Compatibility', value: results.ats_compatibility, color: 'text-destructive' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div className="h-full {item.color.replace('text-', 'bg-')} rounded-full transition-all duration-1000" style={{ width: `${item.value}%` }} />
                  </div>
                  <span className="text-sm font-semibold {item.color}">{item.value}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}