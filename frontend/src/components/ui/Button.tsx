import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  asChild?: boolean;
}

const variants: Record<string, string> = {
  primary: 'bg-primary text-on-primary shadow-md hover:bg-primary-hover hover:shadow-lg active:translate-y-0 active:shadow-sm',
  secondary: 'bg-secondary text-on-secondary shadow-sm hover:bg-secondary-hover hover:shadow-md active:translate-y-0 active:shadow-sm',
  accent: 'bg-accent text-on-accent shadow-md hover:bg-accent-hover hover:shadow-lg active:translate-y-0 active:shadow-sm',
  outline: 'bg-transparent text-foreground border border-border shadow-sm hover:bg-muted hover:border-muted-foreground active:translate-y-0',
  ghost: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground active:translate-y-0',
  destructive: 'bg-destructive text-on-destructive shadow-sm hover:bg-destructive-hover active:translate-y-0 active:shadow-sm',
};

const sizes: Record<string, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm font-semibold',
  lg: 'px-6 py-3 text-base font-semibold',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', fullWidth, loading, leftIcon, rightIcon, asChild, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'btn inline-flex items-center justify-center gap-2 rounded-md transition-all duration-200',
          'disabled:opacity-50 disabled:pointer-events-none',
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          className
        )}
        disabled={loading || props.disabled}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        )}
        {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
        {props.children}
        {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';