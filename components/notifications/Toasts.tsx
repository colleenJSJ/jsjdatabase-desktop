'use client';

import { X } from 'lucide-react';
import { useNotifications } from '@/contexts/notifications-context';
import { memo } from 'react';
import Link from 'next/link';

export const NotificationsToasts = memo(function NotificationsToasts() {
  const { toasts, dismiss, clearAll } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 lg:left-72 z-[70] flex flex-col items-end gap-2">
      <button
        onClick={clearAll}
        className="text-xs text-text-muted hover:text-text-primary mb-1"
        aria-label="Clear all notifications"
      >
        Clear all
      </button>
      {toasts.map((t) => {
        const Card = (
          <div
            key={t.id}
            className="w-[320px] max-w-[92vw] bg-background-secondary/95 backdrop-blur border border-gray-600/30 shadow-xl rounded-lg p-3 animate-slide-up"
          >
            <div className="flex items-start gap-2">
              {t.icon && <div className="mt-0.5">{t.icon}</div>}
              <div className="flex-1">
                <div className="text-sm text-text-primary font-medium leading-5">{t.title}</div>
                {t.body && <div className="text-xs text-text-muted mt-0.5 leading-5">{t.body}</div>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-gray-700/30"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );

        return t.href ? (
          <Link key={t.id} href={t.href} onClick={() => dismiss(t.id)}>
            {Card}
          </Link>
        ) : Card;
      })}
      <style jsx global>{`
        @keyframes slide-up {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 160ms ease-out; }
      `}</style>
    </div>
  );
});
