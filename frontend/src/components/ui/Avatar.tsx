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
  sm: 'w-6 h-6 text-[10px]',
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
          'avatar flex-shrink-0 rounded-full',
          sizes[size],
          className
        )}
        {...props}
      >
        {src ? (
          <img src={src} alt={alt || name || 'avatar'} className="w-full h-full object-cover rounded-full" />
        ) : fallback || (
          <span className="flex items-center justify-center font-semibold text-foreground">
            {initials}
          </span>
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';
