import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Lock, FileText, User } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
          <p className="text-muted-foreground">
            Last updated: November 2026
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/terms" className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted">
            Terms of Service
          </Link>
        </div>
      </div>

      <Card padding="none" className="border-border space-y-6 p-5 sm:p-8">
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Your Data, Your Control</h2>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          CVForge is built with privacy as a core principle. We believe your career data belongs to you — not to us.
        </p>

        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
              1
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">What We Collect</h3>
              <p className="text-sm text-muted-foreground">
                We collect only the information you provide: your name, email, CV content, job descriptions, and application data. We never scrape your data or sell it to third parties.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
              2
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">How We Store It</h3>
              <p className="text-sm text-muted-foreground">
                Your data is encrypted in transit and at rest. Uploaded files exist in server memory only during analysis and are never written to disk permanently.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
              3
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Sharing & Links</h3>
              <p className="text-sm text-muted-foreground">
                Share links use random, unguessable tokens. You can revoke any share link at any time from your Dashboard. No trackers, no ads, no data sale — ever.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
              4
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Your Rights</h3>
              <p className="text-sm text-muted-foreground">
                Export all your data as JSON from Settings, or delete your account and all associated data permanently. This action cannot be undone.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-muted rounded-lg p-6 border border-border">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Storage Location</h3>
              <p className="text-sm text-muted-foreground">
                Demo deployments use in-memory storage (wiped on restart). Production uses your configured database with encryption at rest.
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