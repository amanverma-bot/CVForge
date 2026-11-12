import React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';

interface AuthCardProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

export function AuthCard({ children, title, subtitle }: AuthCardProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-3 sm:px-4">
      <div className="max-w-md w-full">
        <Card className="shadow-xl border-border">
          <div className="p-4 sm:p-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-lg bg-primary text-on-primary px-3 py-1 text-xs font-semibold mb-4">
                CV
                <span className="ml-1">Forge</span>
              </div>
              <h1 className="text-2xl font-bold text-foreground">{title}</h1>
              <p className="text-muted-foreground mt-2">{subtitle}</p>
            </div>
            {children}
            <div className="text-center mt-6">
              <p className="text-xs text-muted-foreground">
                Secure login • bcrypt/OAuth • 7-day JWT sessions
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}