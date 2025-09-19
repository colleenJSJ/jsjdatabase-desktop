/**
 * Skeleton Loading Components
 * Provides visual feedback while content is loading
 */

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-gray-700/50',
        className
      )}
    />
  );
}

// Text skeleton with multiple lines
export function SkeletonText({ 
  lines = 3, 
  className 
}: { 
  lines?: number; 
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            i === lines - 1 && 'w-4/5' // Last line shorter
          )}
        />
      ))}
    </div>
  );
}

// Card skeleton
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn(
      'bg-background-secondary border border-gray-600/30 rounded-lg p-4',
      className
    )}>
      <div className="space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <SkeletonText lines={2} />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  );
}

// List item skeleton
export function SkeletonListItem({ className }: SkeletonProps) {
  return (
    <div className={cn(
      'flex items-center gap-4 p-4 bg-background-secondary rounded-lg',
      className
    )}>
      <Skeleton className="h-12 w-12 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-full" />
      </div>
      <Skeleton className="h-8 w-20" />
    </div>
  );
}

// Table skeleton
export function SkeletonTable({ 
  rows = 5, 
  columns = 4,
  className 
}: { 
  rows?: number; 
  columns?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {/* Header */}
      <div className="flex gap-4 p-4 border-b border-gray-700">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 p-4 border-b border-gray-700/50">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton 
              key={colIndex} 
              className={cn(
                'h-4 flex-1',
                colIndex === 0 && 'w-1/4'
              )} 
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Dashboard widget skeleton
export function SkeletonWidget({ 
  title = true,
  className 
}: { 
  title?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(
      'bg-background-secondary border border-gray-600/30 rounded-lg p-6',
      className
    )}>
      {title && (
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>
      )}
      <div className="space-y-3">
        <SkeletonListItem className="bg-background-primary" />
        <SkeletonListItem className="bg-background-primary" />
        <SkeletonListItem className="bg-background-primary" />
      </div>
    </div>
  );
}

// Form skeleton
export function SkeletonForm({ 
  fields = 4,
  className 
}: { 
  fields?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <div className="flex gap-3 pt-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 flex-1" />
      </div>
    </div>
  );
}

// Calendar skeleton
export function SkeletonCalendar({ className }: SkeletonProps) {
  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-8 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
      {/* Days of week */}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// Avatar skeleton
export function SkeletonAvatar({ 
  size = 'md',
  className 
}: { 
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16'
  };

  return (
    <Skeleton className={cn(
      'rounded-full',
      sizes[size],
      className
    )} />
  );
}