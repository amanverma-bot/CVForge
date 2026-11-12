import React from 'react';
import { Skeleton } from './Skeleton';

interface SkeletonListProps {
  count?: number;
  variant?: 'text' | 'avatar' | 'circle' | 'line' | 'button';
}

export const SkeletonList = ({
  count = 5,
  variant = 'text',
}: SkeletonListProps) => {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-start gap-4">
          {variant === 'avatar' && (
            <Skeleton variant="avatar" />
          )}
          <div className="space-y-2 flex-1">
            <Skeleton variant="text" className="w-2/3" />
            <Skeleton variant="text" className="w-1/2" />
            {variant === 'line' && (
              <Skeleton variant="line" className="mt-2 w-full" />
            )}
          </div>
          {variant === 'circle' && <Skeleton variant="circle" />}
        </div>
      ))}
    </div>
  );
};

SkeletonList.displayName = 'SkeletonList';
