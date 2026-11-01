import React from 'react';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/utils';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  fallback?: React.ReactNode;
}

const sizes: Record<string, string> = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
};

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, name, size = 'md', fallback, ...props }, ref) => {
    const initials = name ? getInitials(name) : '?';
    return (
      <div
        ref={ref}
        className={cn(
          'avatar flex-shrink-0',
          sizes[size],
          className
        )}
        {...props}
      >
        {src ? (
          <img src={src} alt={alt || name || 'avatar'} />
        ) : fallback || initials}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';