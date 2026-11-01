import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'muted' | 'destructive' | 'success';
}

const variants: Record<string, string> = {
  primary: 'bg-primary text-on-primary',
  secondary: 'bg-secondary text-on-secondary',
  accent: 'bg-accent text-on-accent',
  muted: 'bg-muted text-muted-foreground',
  destructive: 'bg-destructive text-on-destructive',
  success: 'bg-success text-on-accent',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'muted', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'badge inline-flex items-center rounded-sm px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider',
        variants[variant],
        className
      )}
      {...props}
    />
  )
);

Badge.displayName = 'Badge';