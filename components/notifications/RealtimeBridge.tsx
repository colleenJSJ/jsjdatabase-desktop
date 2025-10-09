'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import { useNotifications } from '@/contexts/notifications-context';

export default function RealtimeBridge() {
  const { notify } = useNotifications();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('notifications-bridge')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_comments' },
        async (payload: RealtimePostgresInsertPayload<{ id: string }>) => {
          try {
            const res = await fetch('/api/tasks/comments/stream?limit=10');
            if (!res.ok) return;
            const data = await res.json();
            const found = Array.isArray(data.comments)
              ? data.comments.find(
                  (c: { id?: string; task_title?: string; comment?: string }) => c?.id === payload.new.id
                )
              : undefined;
            if (!found) return;
            notify({
              title: `New comment on ${found.task_title}`,
              body: String(found.comment || '').slice(0, 120),
              href: '/tasks',
              timeoutMs: 7000,
            });
          } catch {}
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [notify]);

  return null;
}
