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
  primary: 'bg-primary text-on-primary shadow-sm hover:bg-primary-hover hover:shadow-md active:bg-primary-hover',
  secondary: 'bg-secondary text-on-secondary shadow-sm hover:bg-secondary-hover hover:shadow-md active:bg-secondary-hover',
  accent: 'bg-accent text-on-accent shadow-sm hover:bg-accent-hover hover:shadow-md active:bg-accent-hover',
  outline: 'border border-border bg-transparent text-foreground shadow-sm hover:bg-primary/5 hover:border-primary active:bg-primary/10',
  ghost: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/50',
  destructive: 'bg-destructive text-on-destructive shadow-sm hover:bg-destructive-hover active:bg-destructive-hover',
};

const sizes: Record<string, string> = {
  sm: 'px-3 py-1.5 text-sm font-medium',
  md: 'px-4 py-2 text-sm font-medium',
  lg: 'px-6 py-3 text-base font-medium',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', fullWidth, loading, leftIcon, rightIcon, asChild, children, ...props }, ref) => {
    const classes = cn(
      'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-200',
      'disabled:opacity-50 disabled:pointer-events-none cursor-not-allowed',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      variants[variant],
      sizes[size],
      fullWidth && 'w-full',
      className
    );

    if (asChild) {
      const child = React.Children.only(children);
      return React.cloneElement(child, {
        ...props,
        ref,
        className: cn(classes, child.props.className),
      });
    }

    return (
      <button
        ref={ref}
        className={classes}
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
        {children}
        {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
