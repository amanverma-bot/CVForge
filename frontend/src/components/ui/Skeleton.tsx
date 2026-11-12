import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'avatar' | 'circle' | 'line' | 'button';
  height?: number | string;
  width?: number | string;
}

const VARIANT_STYLES: Record<string, string> = {
  text: 'h-4 w-48',
  avatar: 'h-10 w-10 rounded-full',
  circle: 'h-4 w-4 rounded-full',
  line: 'h-1 w-full',
  button: 'h-10 w-32 rounded-md',
};

export const Skeleton = ({
  className,
  variant = 'text',
  height,
  width,
}: SkeletonProps) => {
  return (
    <div
      className={cn(
        'animate-pulse bg-muted rounded-md',
        VARIANT_STYLES[variant],
        height && `h-${typeof height === 'number' ? height : height}`,
        width && `w-${typeof width === 'number' ? width : width}`,
        className
      )}
    />
  );
};

Skeleton.displayName = 'Skeleton';
