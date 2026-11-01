import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, User, ShieldCheck, Scale } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 px-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Terms of Service</h1>
          <p className="text-muted-foreground">
            Last updated: November 2026
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/privacy" className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted">
            Privacy Policy
          </Link>
        </div>
      </div>

      <Card padding="lg" className="border-border space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Agreement</h2>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          By using CVForge, you agree to these terms. Please read them carefully before creating an account.
        </p>

        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
              1
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Honest Use</h3>
              <p className="text-sm text-muted-foreground">
                CVForge drafts resumes from information you provide. We mark learning skills as "(Familiar)" to encourage honesty. Only claim what is true — you are responsible for final content.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
              2
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Scores Are Guidance</h3>
              <p className="text-sm text-muted-foreground">
                ATS predictions estimate wording and structure fit, not hiring outcomes. Scores are tools to improve your resume, not guarantees of employment.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
              3
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Fair Use</h3>
              <p className="text-sm text-muted-foreground">
                5 MB upload limit, rate-limited APIs. Don't abuse shared links or scrape the service. Violations may result in account suspension.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
              4
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Availability</h3>
              <p className="text-sm text-muted-foreground">
                Demo hosting may sleep or restart, clearing unsaved demo data. Export anything important. We strive for uptime but don't guarantee it for free tier.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-muted rounded-lg p-6 border border-border">
          <div className="flex items-start gap-3">
            <Scale className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Changes to Terms</h3>
              <p className="text-sm text-muted-foreground">
                We may update these terms periodically. Continued use of CVForge after changes constitutes acceptance of the new terms.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <div className="text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} CVForge Inc. All rights reserved.
        </p>
      </div>
    </div>
  );
}