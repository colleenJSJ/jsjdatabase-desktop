/**
 * Loading Components
 * Various loading indicators for different scenarios
 */

import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12'
  };

  return (
    <Loader2 className={cn(
      'animate-spin text-text-muted',
      sizes[size],
      className
    )} />
  );
}

// Centered loading spinner
export function LoadingSpinner({ 
  message,
  className 
}: { 
  message?: string;
  className?: string;
}) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-12',
      className
    )}>
      <Spinner size="lg" />
      {message && (
        <p className="mt-4 text-sm text-text-muted">{message}</p>
      )}
    </div>
  );
}

// Full page loader
export function PageLoader({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 bg-background-primary/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-6 shadow-xl">
        <LoadingSpinner message={message} />
      </div>
    </div>
  );
}

// Inline loader for buttons
export function ButtonLoader({ 
  loading,
  children,
  className 
}: { 
  loading: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      {loading && <Spinner size="sm" className={cn('mr-2', className)} />}
      {children}
    </>
  );
}

// Progress bar
export function ProgressBar({ 
  value,
  max = 100,
  showLabel = false,
  className 
}: {
  value: number;
  max?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn('w-full', className)}>
      <div className="relative w-full h-2 bg-gray-700 rounded-full overflow-hidden">
        <div 
          className="absolute left-0 top-0 h-full bg-blue-500 transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-text-muted mt-1 text-right">
          {Math.round(percentage)}%
        </p>
      )}
    </div>
  );
}

// Upload progress
export function UploadProgress({ 
  fileName,
  progress,
  total,
  onCancel 
}: {
  fileName: string;
  progress: number;
  total: number;
  onCancel?: () => void;
}) {
  const percentage = Math.round((progress / total) * 100);

  return (
    <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-text-primary truncate flex-1 mr-2">
          {fileName}
        </p>
        <span className="text-xs text-text-muted">{percentage}%</span>
      </div>
      <ProgressBar value={progress} max={total} />
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-text-muted">
          {formatBytes(progress)} / {formatBytes(total)}
        </p>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// Loading dots animation
export function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex gap-1', className)}>
      <span className="animate-bounce animation-delay-0 h-1.5 w-1.5 bg-current rounded-full" />
      <span className="animate-bounce animation-delay-200 h-1.5 w-1.5 bg-current rounded-full" />
      <span className="animate-bounce animation-delay-400 h-1.5 w-1.5 bg-current rounded-full" />
    </span>
  );
}

// Loading overlay for sections
export function LoadingOverlay({ 
  visible,
  message 
}: { 
  visible: boolean;
  message?: string;
}) {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 bg-background-primary/50 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
      <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-4 shadow-lg">
        <LoadingSpinner message={message} />
      </div>
    </div>
  );
}

// Pulsing placeholder
export function PulsingText({ 
  text,
  className 
}: { 
  text: string;
  className?: string;
}) {
  return (
    <span className={cn('animate-pulse', className)}>
      {text}
    </span>
  );
}

// Loading state for cards
export function CardLoader({ 
  title,
  description 
}: { 
  title?: string;
  description?: string;
}) {
  return (
    <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        {title ? (
          <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        ) : (
          <div className="h-5 w-32 bg-gray-700/50 rounded animate-pulse" />
        )}
        <Spinner size="sm" />
      </div>
      {description ? (
        <p className="text-xs text-text-muted">{description}</p>
      ) : (
        <div className="space-y-2">
          <div className="h-3 bg-gray-700/50 rounded animate-pulse" />
          <div className="h-3 w-4/5 bg-gray-700/50 rounded animate-pulse" />
        </div>
      )}
    </div>
  );
}

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Add CSS for animation delays (add to globals.css)
const animationStyles = `
@keyframes bounce {
  0%, 100% {
    transform: translateY(-25%);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  50% {
    transform: translateY(0);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
}

.animation-delay-0 {
  animation-delay: 0ms;
}

.animation-delay-200 {
  animation-delay: 200ms;
}

.animation-delay-400 {
  animation-delay: 400ms;
}
`;