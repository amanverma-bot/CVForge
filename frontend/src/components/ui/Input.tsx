import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="space-y-1" style={{ display: 'contents' }}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-semibold text-foreground mb-1 block"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'input w-full pl-10',
              leftIcon && 'pl-9',
              error && 'border-destructive focus:border-destructive focus:ring-destructive',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {rightIcon}
            </span>
          )}
        </div>
        {error && (
          <p className="text-sm text-destructive" style={{ display: 'contents' }}>
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="text-sm text-muted-foreground" style={{ display: 'contents' }}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';