'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useNotifications } from '@/contexts/notifications-context';

export default function RealtimeBridge() {
  const { notify } = useNotifications();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('notifications-bridge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_comments' }, async (payload) => {
        try {
          const res = await fetch('/api/tasks/comments/stream?limit=10');
          if (!res.ok) return;
          const data = await res.json();
          const found = (data.comments || []).find((c: any) => c.id === payload.new.id);
          if (!found) return;
          notify({
            title: `New comment on ${found.task_title}`,
            body: String(found.comment || '').slice(0, 120),
            href: '/tasks',
            timeoutMs: 7000,
          });
        } catch {}
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [notify]);

  return null;
}

