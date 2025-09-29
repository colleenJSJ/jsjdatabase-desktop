'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type NotificationToast = {
  id?: string;
  title: string;
  body?: string;
  href?: string;
  icon?: React.ReactNode;
  timeoutMs?: number; // default 6000
  type?: 'info' | 'success' | 'warning' | 'error';
};

type ActiveToast = NotificationToast & { id: string; createdAt: number };

type Ctx = {
  toasts: ActiveToast[];
  notify: (toast: NotificationToast) => string; // returns id
  dismiss: (id: string) => void;
  clearAll: () => void;
};

const NotificationsContext = createContext<Ctx | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) window.clearTimeout(tm);
    timers.current.delete(id);
  }, []);

  const notify = useCallback((toast: NotificationToast) => {
    const id = toast.id || Math.random().toString(36).slice(2);
    const created = Date.now();
    const active: ActiveToast = { ...toast, id, createdAt: created };
    setToasts(prev => [active, ...prev].slice(0, 5));
    const timeout = toast.timeoutMs ?? 6000;
    if (timeout > 0) {
      const tm = window.setTimeout(() => dismiss(id), timeout);
      timers.current.set(id, tm);
    }
    return id;
  }, [dismiss]);

  const clearAll = useCallback(() => {
    setToasts([]);
    timers.current.forEach((tm) => window.clearTimeout(tm));
    timers.current.clear();
  }, []);

  const value = useMemo(() => ({ toasts, notify, dismiss, clearAll }), [toasts, notify, dismiss, clearAll]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}

