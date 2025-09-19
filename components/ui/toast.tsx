'use client';

import { X } from 'lucide-react';
import { useToast } from '@/contexts/toast-context';

export function Toaster() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 min-w-[300px] max-w-md
            ${toast.variant === 'destructive' 
              ? 'bg-red-900 border border-red-700' 
              : 'bg-background-secondary border border-gray-600/30'
            }
          `}
        >
          <div className="flex-1">
            <p className="font-medium text-text-primary">{toast.title}</p>
            {toast.description && (
              <p className="text-sm text-text-muted mt-1">{toast.description}</p>
            )}
          </div>
          <button
            onClick={() => dismiss(toast.id)}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}