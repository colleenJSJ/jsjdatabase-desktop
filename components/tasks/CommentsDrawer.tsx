'use client';

import { useEffect, useRef, useState } from 'react';
import { X, MessageSquare, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { usePreferences } from '@/contexts/preferences-context';
import { toInstantFromNaive, formatInstantInTimeZone } from '@/lib/utils/date-utils';
import { addCSRFToHeaders } from '@/lib/security/csrf-client';

type ThreadPreview = {
  thread_id: string;
  task_id: string;
  task_title: string;
  task_status: string;
  first_comment: string;
  total_replies: number;
  last_comment_at: string;
  unread_count?: number;
};

type Comment = {
  id: string;
  task_id: string;
  user_id: string;
  comment: string;
  created_at: string;
  parent_comment_id?: string | null;
  users?: { id: string; name?: string; email?: string };
};

export function CommentsDrawer({ open, onClose, onOpenTask }: { open: boolean; onClose: () => void; onOpenTask?: (taskId: string) => void }) {
  const [threads, setThreads] = useState<ThreadPreview[]>([]);
  type TaskPreview = { task_id: string; task_title: string; last_comment_at: string; unread_count?: number; total_comments: number };
  const [selectedTask, setSelectedTask] = useState<TaskPreview | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'threads' | 'stream'>('threads');
  const [stream, setStream] = useState<Array<{ id: string; thread_id: string; task_id: string; task_title: string; user_name?: string; user_email?: string; comment: string; created_at: string }>>([]);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [mentionsFilter, setMentionsFilter] = useState<'all' | 'me'>('all');
  const [replyText, setReplyText] = useState('');
  const [postingReply, setPostingReply] = useState(false);
  const { preferences } = usePreferences();

  // Simple in-memory caches to make reopening faster
  const threadsCacheRef = useRef<ThreadPreview[] | null>(null);
  const streamCacheRef = useRef<typeof stream | null>(null);

  // Realtime updates: refresh current view when comments change
  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    const channel = supabase
      .channel('comments-drawer')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_comments' },
        () => {
          // Re-fetch based on current view and filters
          if (mode === 'threads') {
            const params = new URLSearchParams();
            params.set('limit', '30');
            if (includeCompleted) params.set('include_completed', 'true');
            if (mentionsFilter === 'me') params.set('mentions', 'me');
            fetch(`/api/tasks/comments?${params.toString()}`)
              .then(r => r.ok ? r.json() : Promise.resolve({ threads: [] }))
              .then(d => setThreads(d.threads || []))
              .catch(() => {});
          } else if (mode === 'stream') {
            const params = new URLSearchParams();
            params.set('limit', '60');
            if (includeCompleted) params.set('include_completed', 'true');
            if (mentionsFilter === 'me') params.set('mentions', 'me');
            fetch(`/api/tasks/comments/stream?${params.toString()}`)
              .then(r => r.ok ? r.json() : Promise.resolve({ comments: [] }))
              .then(d => setStream(d.comments || []))
              .catch(() => {});
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, mode, includeCompleted, mentionsFilter]);

  useEffect(() => {
    if (!open) return;
    // Seed from cache immediately for snappier open
    if (threadsCacheRef.current && mode === 'threads') {
      setThreads(threadsCacheRef.current);
    }
    const params = new URLSearchParams();
    params.set('limit', '30');
    if (includeCompleted) params.set('include_completed', 'true');
    if (mentionsFilter === 'me') params.set('mentions', 'me');
    (async () => {
      try {
        const res = await fetch(`/api/tasks/comments?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setThreads(data.threads || []);
          threadsCacheRef.current = data.threads || [];
        }
      } catch {}
    })();
  }, [open, includeCompleted, mentionsFilter]);

  useEffect(() => {
    if (!open || mode !== 'stream') return;
    // Seed from cache
    if (streamCacheRef.current) {
      setStream(streamCacheRef.current);
    }
    const params = new URLSearchParams();
    params.set('limit', '60');
    if (includeCompleted) params.set('include_completed', 'true');
    if (mentionsFilter === 'me') params.set('mentions', 'me');
    (async () => {
      try {
        const res = await fetch(`/api/tasks/comments/stream?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setStream(data.comments || []);
          streamCacheRef.current = data.comments || [];
        }
      } catch {}
    })();
  }, [open, mode, includeCompleted, mentionsFilter]);

  // New: load all comments for a task (newest → oldest) and mark all threads in that task as read
  const loadTask = async (task: { task_id: string; task_title: string; last_comment_at?: string }) => {
    setSelectedTask({ task_id: task.task_id, task_title: task.task_title, last_comment_at: task.last_comment_at || new Date().toISOString(), total_comments: 0 });
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${task.task_id}/comments`);
      if (res.ok) {
        const data = await res.json();
        const list = (data.comments || []) as Comment[];
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setComments(list);
        const threadIds = Array.from(
          new Set(
            list
              .map((c) => c.parent_comment_id ?? c.id)
              .filter((id): id is string => Boolean(id))
          )
        );
        await Promise.all(threadIds.map((id) => fetch('/api/tasks/comments/read', {
          method: 'POST',
          headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ thread_id: id })
        })));
      }
    } catch {}
    setLoading(false);
  };

  const loadTaskById = (taskId: string, taskTitle?: string, last?: string) => loadTask({ task_id: taskId, task_title: taskTitle || 'Task', last_comment_at: last });

  return (
    <div className={`fixed top-0 right-0 h-full bg-background-secondary border-l border-gray-600/30 shadow-xl transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`} style={{ width: 520, zIndex: 60 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-600/30">
        <div className="flex items-center gap-2 text-text-primary font-semibold">
          <MessageSquare className="h-4 w-4" />
          Comments
        </div>
        <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Tabs + Filters */}
      <div className="px-3 py-2 border-b border-gray-600/30 flex items-center gap-2" role="tablist" aria-label="Comments view mode">
        <button
          onClick={() => setMode('threads')}
          role="tab"
          aria-selected={mode === 'threads'}
          tabIndex={mode === 'threads' ? 0 : -1}
          type="button"
          className={`px-3 py-1.5 rounded-md text-sm border ${mode === 'threads' ? 'bg-gray-700 text-white font-semibold border-gray-500' : 'bg-background-primary text-text-muted hover:bg-gray-700/20 border-transparent'}`}
        >
          Threads
        </button>
        <button
          onClick={() => setMode('stream')}
          role="tab"
          aria-selected={mode === 'stream'}
          tabIndex={mode === 'stream' ? 0 : -1}
          type="button"
          className={`px-3 py-1.5 rounded-md text-sm border ${mode === 'stream' ? 'bg-gray-700 text-white font-semibold border-gray-500' : 'bg-background-primary text-text-muted hover:bg-gray-700/20 border-transparent'}`}
        >
          Stream
        </button>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(e) => setIncludeCompleted(e.target.checked)}
            />
            Include Completed
          </label>
          <label className="flex items-center gap-1 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={mentionsFilter === 'me'}
              onChange={(e) => setMentionsFilter(e.target.checked ? 'me' : 'all')}
            />
            My Mentions
          </label>
        </div>
      </div>

      {/* Content */}
      <div className="grid" style={{ gridTemplateColumns: mode === 'threads' ? '48% 52%' : '100%' }}>
        {/* Thread list */}
        <div className="border-r border-gray-600/30 h-[calc(100vh-48px)] overflow-y-auto bg-background-primary">
          {mode === 'threads' ? (
            threads.length === 0 ? (
              <div className="p-4 text-sm text-text-muted">No recent comments</div>
            ) : (
              (() => {
                // Group thread previews by task to show exactly one row per task
                const map = new Map<string, TaskPreview & { _latestPreview?: ThreadPreview }>();
                for (const th of threads) {
                  const prev = map.get(th.task_id);
                  const totalForThread = th.total_replies + 1;
                  if (!prev) {
                    map.set(th.task_id, {
                      task_id: th.task_id,
                      task_title: th.task_title,
                      last_comment_at: th.last_comment_at,
                      unread_count: th.unread_count || 0,
                      total_comments: totalForThread,
                      _latestPreview: th,
                    });
                  } else {
                    // Update latest timestamp and preview
                    const newer = new Date(th.last_comment_at).getTime() > new Date(prev.last_comment_at).getTime();
                    prev.last_comment_at = newer ? th.last_comment_at : prev.last_comment_at;
                    prev._latestPreview = newer && th ? th : prev._latestPreview;
                    prev.unread_count = (prev.unread_count || 0) + (th.unread_count || 0);
                    prev.total_comments += totalForThread;
                    map.set(th.task_id, prev);
                  }
                }
                // Sort by last_comment_at desc
                const groups = Array.from(map.values()).sort((a, b) => new Date(b.last_comment_at).getTime() - new Date(a.last_comment_at).getTime());
                return groups.map((g) => {
                  const isActive = selectedTask?.task_id === g.task_id;
                  const preview = g._latestPreview?.first_comment || '';
                  return (
                    <button key={g.task_id} onClick={() => loadTask(g)} className="w-full text-left px-3 py-1">
                      <div className={`bg-background-secondary border border-gray-600/30 hover:border-gray-500 rounded-lg p-3 transition-colors ${isActive ? 'border-gray-500 outline outline-1 outline-gray-400' : ''}`}>
                        <div className="font-medium text-text-primary truncate">{g.task_title}</div>
                        {preview && <div className="text-xs text-text-muted truncate mt-0.5">{preview}</div>}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[11px] text-text-muted">{(() => { const inst = toInstantFromNaive(g.last_comment_at, preferences.timezone); return formatInstantInTimeZone(inst, preferences.timezone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); })()}</span>
                          <div className="flex items-center gap-2">
                            {typeof g.unread_count === 'number' && g.unread_count > 0 && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-700/60 text-white">{g.unread_count}</span>
                            )}
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-700/40 text-text-primary">{g.total_comments} comments</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                });
              })()
            )
          ) : (
            stream.length === 0 ? (
              <div className="p-4 text-sm text-text-muted">No recent messages</div>
            ) : (
              stream.map((it, idx) => {
                const prev = idx > 0 ? stream[idx - 1] : null;
                const newTask = !prev || prev.task_id !== it.task_id;
                return (
                  <div key={it.id} className="w-full px-3 py-1">
                    {newTask && (
                      <div className="flex items-center gap-2 my-2">
                        <div className="h-px flex-1 bg-gray-500/70" />
                        <button
                          className="text-xs text-text-muted hover:text-text-primary truncate max-w-[60%]"
                          title={it.task_title}
                          onClick={() => {
                            setMode('threads');
                            loadTaskById(it.task_id, it.task_title, it.created_at);
                          }}
                        >
                          {it.task_title}
                        </button>
                        <div className="h-px flex-1 bg-gray-500/70" />
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <div className="text-xs text-text-muted truncate">{it.user_name || it.user_email || 'User'}</div>
                        <div className="text-[11px] text-text-muted mt-0.5">{
                          (() => { const inst = toInstantFromNaive(it.created_at, preferences.timezone); return formatInstantInTimeZone(inst, preferences.timezone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); })()
                        }</div>
                        <button
                          onClick={() => {
                            setMode('threads');
                            loadTaskById(it.task_id, it.task_title, it.created_at);
                          }}
                          className="text-left w-full text-sm text-text-primary mt-1 hover:text-text-primary/90"
                        >
                          {it.comment}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>

        {/* Thread viewer (only when in Threads mode) */}
        {mode === 'threads' && (
          <div className="h-[calc(100vh-48px)] overflow-y-auto bg-background-secondary">
            {!selectedTask ? (
              <div className="p-4 text-sm text-text-muted">Select a thread to view</div>
            ) : loading ? (
              <div className="p-4 text-sm text-text-muted">Loading…</div>
            ) : (
              <div>
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-600/30">
                  <div className="text-text-primary font-medium truncate">{selectedTask.task_title}</div>
                  {onOpenTask && (
                    <button
                      onClick={() => onOpenTask(selectedTask.task_id)}
                      className="px-2 py-1 bg-button-create hover:bg-button-create/90 text-white text-[11px] rounded-md"
                    >
                      Open Task
                    </button>
                  )}
                </div>
                {/* Reply box */}
                <div className="p-3 border-b border-gray-600/30 bg-background-primary">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={async (e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        if (!replyText.trim() || postingReply) return;
                        if (!selectedTask) return;
                        setPostingReply(true);
                        try {
                          const res = await fetch(`/api/tasks/${selectedTask.task_id}/comments`, {
                            method: 'POST',
                            headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
                            body: JSON.stringify({ comment: replyText.trim() })
                          });
                          if (res.ok) {
                            setReplyText('');
                            await loadTask(selectedTask);
                            const params = new URLSearchParams();
                            params.set('limit', '30');
                            if (includeCompleted) params.set('include_completed', 'true');
                            if (mentionsFilter === 'me') params.set('mentions', 'me');
                            fetch(`/api/tasks/comments?${params.toString()}`)
                              .then(r2 => r2.ok ? r2.json() : Promise.resolve({ threads: [] }))
                              .then(d2 => setThreads(d2.threads || []))
                              .catch(() => {});
                          }
                        } finally {
                          setPostingReply(false);
                        }
                      }
                    }}
                    placeholder="Add a comment to this task…"
                    rows={2}
                    className="w-full px-3 py-2 bg-background-secondary border border-gray-600/30 rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-gray-600"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-text-muted">Press ⌘ Enter to send</span>
                    <div className="flex items-center gap-3">
                      {replyText && (
                        <button
                          onClick={() => setReplyText('')}
                          className="text-xs text-text-muted hover:text-text-primary"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        disabled={!replyText.trim() || postingReply}
                        onClick={async () => {
                          if (!selectedTask || !replyText.trim()) return;
                          setPostingReply(true);
                          try {
                            const res = await fetch(`/api/tasks/${selectedTask.task_id}/comments`, {
                              method: 'POST',
                              headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
                              body: JSON.stringify({ comment: replyText.trim() })
                            });
                            if (res.ok) {
                              setReplyText('');
                              await loadTask(selectedTask);
                              // Refresh list previews to update unread counts and ordering
                              const params = new URLSearchParams();
                              params.set('limit', '30');
                              if (includeCompleted) params.set('include_completed', 'true');
                              if (mentionsFilter === 'me') params.set('mentions', 'me');
                              fetch(`/api/tasks/comments?${params.toString()}`)
                                .then(r2 => r2.ok ? r2.json() : Promise.resolve({ threads: [] }))
                                .then(d2 => setThreads(d2.threads || []))
                                .catch(() => {});
                            }
                          } finally {
                            setPostingReply(false);
                          }
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-gray-600/40 text-text-primary hover:bg-gray-700/30 disabled:opacity-50`}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {postingReply ? 'Posting…' : 'Send'}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="text-sm">
                      <div className="text-text-primary">{c.users?.name || c.users?.email || 'User'}</div>
                      <div className="text-text-muted text-xs">{
                        (() => { const inst = toInstantFromNaive(c.created_at, preferences.timezone); return formatInstantInTimeZone(inst, preferences.timezone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); })()
                      }</div>
                      <div className="mt-1 text-text-primary whitespace-pre-wrap">{c.comment}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
