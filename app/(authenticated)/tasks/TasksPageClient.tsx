"use client";

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useUser } from '@/contexts/user-context';
import { usePersonFilter } from '@/contexts/person-filter-context';
import { Task, TaskPriority } from '@/lib/supabase/types';
import { parseDateOnlyLocal } from '@/lib/utils/date-utils';
import { Plus, CheckCircle, List as ListIcon, BarChart3, Maximize2, Minimize2 } from 'lucide-react';
import { CategoriesClient, Category } from '@/lib/categories/categories-client';
import { VirtualizedTaskList } from '@/components/tasks/VirtualizedTaskList';
import { TasksSearchFilter, TaskStatusFilter } from '@/components/tasks/TasksSearchFilter';

const GanttView = dynamic(() => import('@/components/tasks/GanttView'));
const TaskCard = dynamic(() => import('@/components/tasks/TaskCard'));
const TaskModal = dynamic(() => import('@/components/tasks/TaskModal'));
const TaskDetailModal = dynamic(() => import('@/components/tasks/TaskDetailModal').then(m => m.TaskDetailModal));
const CommentsDrawer = dynamic(() => import('@/components/tasks/CommentsDrawer').then(m => m.CommentsDrawer));

export default function TasksPageClient() {
  const { user } = useUser();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'gantt'>('list');
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; color?: string }>>([]);
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('active');
  const { selectedPersonId, setSelectedPersonId, isLoading: personFilterLoading } = usePersonFilter();
  const assignedTo = selectedPersonId ?? 'all';
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const load = async () => {
    if (personFilterLoading) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedPersonId) {
        params.set('selected_person', selectedPersonId);
      }
      if (filterProject && filterProject !== 'all') {
        params.set('project', filterProject);
      }
      const url = params.toString() ? `/api/tasks?${params.toString()}` : '/api/tasks';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTasks(data?.tasks || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!personFilterLoading) {
      load();
    }
  }, [selectedPersonId, filterProject, user?.id, personFilterLoading]);
  useEffect(() => {
    (async () => {
      try {
        const cats = await CategoriesClient.getCategories('tasks');
        setCategories(cats || []);
      } catch {}
    })();
  }, []);

  // Fetch projects for top-level filters
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects || []);
        }
      } catch {}
    })();
  }, []);

  const markComplete = async (id: string) => {
    const ApiClient = (await import('@/lib/api/api-client')).default;
    const res = await ApiClient.post(`/api/tasks/${id}/complete`);
    if (res.success) load();
  };
  const deleteTask = async (id: string) => {
    const ApiClient = (await import('@/lib/api/api-client')).default;
    const res = await ApiClient.delete(`/api/tasks/${id}`);
    if (res.success) load();
  };
  const bulkComplete = async () => {
    for (const id of Array.from(selectedIds)) {
      await (await import('@/lib/api/api-client')).default.post(`/api/tasks/${id}/complete`);
    }
    setSelectedIds(new Set());
    load();
  };
  const bulkDelete = async () => {
    if (!confirm('Delete selected tasks?')) return;
    for (const id of Array.from(selectedIds)) {
      await (await import('@/lib/api/api-client')).default.delete(`/api/tasks/${id}`);
    }
    setSelectedIds(new Set());
    load();
  };

  const filteredTasks = useMemo(() => {
    let t = [...tasks];
    // Client-side assigned filter fallback (in case API didn't filter)
    if (assignedTo && assignedTo !== 'all') {
      t = t.filter(x => (x.assigned_to || []).includes(assignedTo) || (x.assigned_users || []).some(u => u.id === assignedTo));
    }
    // Project filter (client-side safeguard)
    if (filterProject && filterProject !== 'all') {
      t = t.filter((x: any) => (x.project_id === filterProject) || (x.project && x.project.id === filterProject));
    }
    // Status filter
    if (statusFilter === 'active') {
      t = t.filter(x => {
        const isPending = Boolean((x as any).is_pending || x.status === 'pending');
        return !isPending && x.status !== 'completed' && x.status !== 'archived' && x.status !== 'draft';
      });
    } else if (statusFilter === 'pending') {
      t = t.filter(x => Boolean((x as any).is_pending || x.status === 'pending'));
    } else if (statusFilter === 'completed') {
      t = t.filter(x => x.status === 'completed');
    } else if (statusFilter === 'draft') {
      t = t.filter(x => x.status === 'draft');
    }
    if (filterCategory !== 'all') t = t.filter(x => x.category === filterCategory);
    if (filterPriority !== 'all') t = t.filter(x => x.priority === filterPriority);
    const term = search.trim().toLowerCase();
    if (term) t = t.filter(x => (x.title||'').toLowerCase().includes(term) || (x.description||'').toLowerCase().includes(term));
    return t;
  }, [tasks, statusFilter, filterCategory, filterPriority, search, assignedTo, filterProject]);

  const statusCounts = useMemo(() => {
    const counts = { active: 0, pending: 0, completed: 0, drafts: 0 };
    tasks.forEach(task => {
      const isPending = Boolean((task as any).is_pending || task.status === 'pending');
      if (task.status === 'completed') {
        counts.completed += 1;
      } else if (task.status === 'draft') {
        counts.drafts += 1;
      } else if (isPending) {
        counts.pending += 1;
      } else if (task.status !== 'archived') {
        counts.active += 1;
      }
    });
    return counts;
  }, [tasks]);

  // Group tasks into calendar weeks with explicit date ranges as titles
  const grouped = useMemo(() => {
    type Bucket = { key: string; start: Date; end: Date; title: string; items: Task[] };
    const map = new Map<string, Bucket>();
    const noDue: Task[] = [];
    // Pull urgent tasks to a separate list so they can be shown at the top
    const urgentTasks: Task[] = [];

    const input = [...filteredTasks];
    input.forEach(t => { if ((t as any)?.is_urgent) urgentTasks.push(t); });
    const nonUrgent = input.filter(t => !(t as any)?.is_urgent);

    const startOfWeek = (d: Date) => { const n = new Date(d); const dow = n.getDay(); n.setDate(n.getDate()-dow); n.setHours(0,0,0,0); return n; };
    const endOfWeek = (s: Date) => { const n = new Date(s); n.setDate(n.getDate()+6); n.setHours(23,59,59,999); return n; };
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const keyFromDate = (d: Date) => {
      const s = startOfWeek(d); return `${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,'0')}-${String(s.getDate()).padStart(2,'0')}`;
    };

    nonUrgent.forEach(t => {
      if (!t.due_date) { noDue.push(t); return; }
      const due = parseDateOnlyLocal(t.due_date);
      const start = startOfWeek(due);
      const end = endOfWeek(start);
      const key = keyFromDate(due);
      let b = map.get(key);
      if (!b) {
        const title = `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
        b = { key, start, end, title, items: [] };
        map.set(key, b);
      }
      b.items.push(t);
    });

    // Sort buckets by start date ascending
    const buckets = Array.from(map.values()).sort((a,b) => a.start.getTime() - b.start.getTime());

    // Stable sort inside buckets by priority then due date
    const priorityOrder: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
    buckets.forEach(b => b.items.sort((a,b) => {
      const p = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (p !== 0) return p;
      const ad = a.due_date ? parseDateOnlyLocal(a.due_date).getTime() : Infinity;
      const bd = b.due_date ? parseDateOnlyLocal(b.due_date).getTime() : Infinity;
      return ad - bd;
    }));

    // Sort urgent tasks by due date soonest first
    urgentTasks.sort((a,b) => {
      const ad = a.due_date ? parseDateOnlyLocal(a.due_date).getTime() : Infinity;
      const bd = b.due_date ? parseDateOnlyLocal(b.due_date).getTime() : Infinity;
      return ad - bd;
    });

    const result: { title: string; items: Task[] }[] = [];
    if (urgentTasks.length > 0) {
      result.push({ title: 'Urgent', items: urgentTasks });
    }
    result.push(...buckets.map(b => ({ title: b.title, items: b.items })));
    if (noDue.length > 0) {
      // Keep No Due Date at the end
      result.push({ title: 'No Due Date', items: noDue });
    }
    return result;
  }, [filteredTasks]);

  const toggleFullscreen = () => {
    const el = document.documentElement;
    const isHidden = el.getAttribute('data-chrome-hidden') === 'true';
    if (isHidden) {
      el.setAttribute('data-chrome-hidden', 'false');
      setIsFullscreen(false);
    } else {
      el.setAttribute('data-chrome-hidden', 'true');
      setIsFullscreen(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-text-primary">Tasks</h1>
        <div className="flex items-center gap-2">
          {user && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors">
              <Plus className="h-4 w-4" /> Add Task
            </button>
          )}
          <div className="flex items-center rounded-xl overflow-hidden border border-gray-600/40">
            <button onClick={() => setViewMode('list')} className={`px-4 py-2 text-sm ${viewMode==='list'?'bg-primary-600 text-white':'bg-background-secondary text-text-muted hover:text-text-primary'}`}>
              <ListIcon className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode('gantt')} className={`px-4 py-2 text-sm ${viewMode==='gantt'?'bg-primary-600 text-white':'bg-background-secondary text-text-muted hover:text-text-primary'}`}>
              <BarChart3 className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={toggleFullscreen}
            className={`px-4 py-2 text-sm rounded-xl border border-gray-600/40 ${isFullscreen ? 'bg-gray-700 text-white' : 'bg-background-secondary text-text-muted hover:text-text-primary'}`}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Search + Filters bar */}
      <TasksSearchFilter
        onSearchChange={setSearch}
        categories={categories}
        priorities={['high','medium','low']}
        status={statusFilter}
        category={filterCategory}
        priority={filterPriority as any}
        onStatusChange={setStatusFilter}
        onCategoryChange={setFilterCategory}
        onPriorityChange={(v) => setFilterPriority(v as any)}
        commentsOpen={showComments}
        onToggleComments={() => setShowComments(s => !s)}
        assignedTo={assignedTo}
        onAssignedChange={(value) => {
          if (value === 'all') {
            setSelectedPersonId(null);
          } else {
            setSelectedPersonId(value);
          }
        }}
        statusCounts={statusCounts}
      />

      {/* Project filter buttons (below search bar) */}
      {projects && projects.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterProject('all')}
            className={`px-4 py-1.5 text-sm rounded-xl border transition-colors ${filterProject==='all' ? 'bg-gray-700 text-white border-gray-500' : 'bg-background-secondary text-text-muted hover:text-text-primary border-gray-600/40'}`}
          >
            All
          </button>
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => setFilterProject(p.id)}
              className={`px-4 py-1.5 text-sm rounded-xl border transition-colors ${filterProject===p.id ? 'bg-gray-700 text-white border-gray-500' : 'bg-background-secondary text-text-muted hover:text-text-primary border-gray-600/40'}`}
              title={p.name}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
        </div>
      ) : (
        <>
          {viewMode === 'list' && (
            <div className="space-y-6">
              {grouped.map(group => (
                <div key={group.title}>
                  <div className={`text-sm font-semibold mb-1 px-1 flex items-center gap-2`}>
                    {group.title === 'Urgent' && (
                      <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    )}
                    <span className={'text-text-muted'}>{group.title}</span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map(t => (
                      <TaskCard
                        key={t.id}
                        task={t as any}
                        onClick={() => setSelectedTask(t)}
                        onComplete={async () => { await markComplete(t.id); }}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {grouped.length === 0 && (
                <div className="text-text-muted">No tasks match your filters.</div>
              )}
            </div>
          )}
          {viewMode === 'gantt' && (
            <div className="bg-background-secondary border border-gray-600/30 rounded">
              <GanttView tasks={filteredTasks as any} isFullScreen={false} />
            </div>
          )}
        </>
      )}
      {/* Create/Edit Modal */}
      {showCreate && (
        <TaskModal isOpen={showCreate} onClose={() => setShowCreate(false)} onSave={load} />
      )}
      {editingTask && (
        <TaskModal isOpen={true} onClose={() => setEditingTask(null)} onSave={load} task={editingTask} />
      )}

      {/* Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onComplete={async () => { await markComplete(selectedTask.id); setSelectedTask(null); }}
          onEdit={() => { setEditingTask(selectedTask); setSelectedTask(null); }}
        />
      )}

      {/* Comments Drawer */}
      <CommentsDrawer
        open={showComments}
        onClose={() => setShowComments(false)}
        onOpenTask={(taskId) => {
          const t = tasks.find(x => x.id === taskId);
          if (t) setSelectedTask(t);
        }}
      />
    </div>
  );
}
