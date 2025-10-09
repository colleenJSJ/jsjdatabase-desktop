'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/contexts/user-context';
import { usePersonFilter } from '@/contexts/person-filter-context';
import { Task, TaskPriority, TaskCategory } from '@/lib/supabase/types';
import { 
  Check, Calendar, AlertCircle, Clock, Circle, ChevronDown, ChevronUp,
  Home, User as UserIcon, Heart, Plane, PawPrint, FileText, Briefcase, Users,
  Hospital, ClipboardList, MessageSquare
} from 'lucide-react';
import { TaskDetailModal } from '@/components/tasks/TaskDetailModal';
import { parseDateOnlyLocal } from '@/lib/utils/date-utils';
import TaskModal from '@/components/tasks/TaskModal';
import { addCSRFToHeaders } from '@/lib/security/csrf-client';

const priorityOrder: Record<TaskPriority, number> = {
  high: 1,
  medium: 2,
  low: 3,
};

const priorityColors: Record<TaskPriority, string> = {
  high: 'bg-priority-high',
  medium: 'bg-priority-medium', 
  low: 'bg-priority-low',
};

const priorityIcons = {
  low: null,
  medium: <Clock className="h-4 w-4" />,
  high: <AlertCircle className="h-4 w-4" />,
};

const categoryIcons: Record<TaskCategory, React.ReactNode> = {
  medical: <Hospital className="h-5 w-5" />,
  household: <Home className="h-5 w-5" />,
  personal: <UserIcon className="h-5 w-5" />,
  administrative: <FileText className="h-5 w-5" />,
  travel: <Plane className="h-5 w-5" />,
  pets: <PawPrint className="h-5 w-5" />,
  documents: <FileText className="h-5 w-5" />,
  work: <Briefcase className="h-5 w-5" />,
  family: <Users className="h-5 w-5" />,
};

const categoryColors: Record<TaskCategory, string> = {
  personal: 'bg-personal/20 text-personal border-personal/30',
  household: 'bg-household/20 text-household border-household/30',
  medical: 'bg-medical/20 text-medical border-medical/30',
  travel: 'bg-travel/20 text-travel border-travel/30',
  pets: 'bg-pets/20 text-pets border-pets/30',
  administrative: 'bg-administrative/20 text-administrative border-administrative/30',
  work: 'bg-work/20 text-work border-work/30',
  family: 'bg-family/20 text-family border-family/30',
  documents: 'bg-documents/20 text-documents border-documents/30',
};

const statusIcon = {
  pending: <Circle className="h-5 w-5" />,
  in_progress: <Clock className="h-5 w-5 text-medical" />,
  completed: <Check className="h-5 w-5 text-travel" />,
  cancelled: <Circle className="h-5 w-5 text-text-muted" />,
};

export function TasksWidget() {
  const { user } = useUser();
  const { selectedPersonId } = usePersonFilter();
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const isDev = process.env.NODE_ENV !== 'production';
  const debugLog = (...args: unknown[]) => {
    if (isDev) {
      console.log(...args);
    }
  };

  useEffect(() => {
    if (user) {
      fetchTasks();
      
      // Refresh every minute to update overdue status
      const interval = setInterval(() => {
        fetchTasks();
      }, 60000); // 1 minute
      
      return () => clearInterval(interval);
    }
  }, [user, selectedPersonId]);

  const fetchTasks = async () => {
    try {
      const params = new URLSearchParams();
      
      // Apply selected person filter
      const targetPerson =
        user?.role === 'admin'
          ? selectedPersonId
          : (user?.family_member_id ?? selectedPersonId);

      if (targetPerson) {
        params.set('selected_person', targetPerson);
      }
      // Admins with no selection see everything (no param)
      
      const response = await fetch(`/api/tasks?${params.toString()}`);
      if (!response.ok) {
        console.error('[TasksWidget] API response not OK:', response.status);
        const errorData = await response.json();
        console.error('[TasksWidget] Error data:', errorData);
        return;
      }
      
      const data = await response.json();
      const allTasks: Task[] = data.tasks || [];
      
      // Tasks are already filtered by the API based on RLS policies
      // Admin users will see all tasks, regular users will see only their assigned tasks
      const userTasks = allTasks;
      
      // Filter for active tasks and sort by priority first, then by due date
      const now = new Date();
      const activeTasks = userTasks
        .filter(task => task.status !== 'completed' && task.status !== 'archived')
        .sort((a, b) => {
          // First, sort by priority (high -> medium -> low)
          const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
          if (priorityDiff !== 0) return priorityDiff;
          
          // Within the same priority, sort by due date (earliest first)
          if (a.due_date && b.due_date) {
            return parseDateOnlyLocal(a.due_date).getTime() - parseDateOnlyLocal(b.due_date).getTime();
          }
          // Tasks with due dates come before tasks without
          if (a.due_date && !b.due_date) return -1;
          if (!a.due_date && b.due_date) return 1;
          
          // For tasks without due dates, sort by created date (oldest first)
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        })
        .slice(0, 5); // Get 5 tasks total (3 visible + 2 more)
      
      setAllTasks(activeTasks);
    } catch (error) {
      console.error('[TasksWidget] Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      debugLog('[Dashboard] Marking task complete:', taskId);
      const response = await fetch(`/api/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: addCSRFToHeaders(),
      });
      debugLog('[Dashboard] Complete response:', response.status, response.ok);
      if (response.ok) {
        debugLog('[Dashboard] Task marked complete, refetching tasks');
        // Refetch tasks to get the next 3 highest priority active tasks
        await fetchTasks();
      }
    } catch (error) {

    }
  };

  const handleTogglePending = async (taskId: string, isPending: boolean) => {
    try {
      debugLog('[Dashboard] Toggling pending status:', taskId, isPending);
      const response = await fetch(`/api/tasks/${taskId}/pending`, {
        method: 'PATCH',
        headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ is_pending: isPending })
      });
      debugLog('[Dashboard] Pending toggle response:', response.status, response.ok);
      if (response.ok) {
        debugLog('[Dashboard] Task pending status toggled, refetching tasks');
        await fetchTasks();
      }
    } catch (error) {
      console.error('[Dashboard] Error toggling pending status:', error);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-700 rounded"></div>
        ))}
      </div>
    );
  }

  if (allTasks.length === 0) {
    return (
      <>
        <div className="text-center py-8">
          <p className="text-text-muted">Tasks will appear here</p>
        </div>
        <div className="flex items-center justify-end mt-4">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            {collapsed ? (
              <>
                <ChevronDown className="w-3 h-3" />
                Show tasks
              </>
            ) : (
              <>
                <ChevronUp className="w-3 h-3" />
                Hide tasks
              </>
            )}
          </button>
        </div>
      </>
    );
  }

  const displayedTasks = expanded ? allTasks.slice(0, 5) : allTasks.slice(0, 3);
  const hasMoreTasks = allTasks.length > 3;

  return (
    <>
      {!collapsed && (
        <div className="space-y-3">
          {displayedTasks.map((task) => {
          const dueLocal = task.due_date ? parseDateOnlyLocal(task.due_date) : null;
          const isOverdue = !!dueLocal && dueLocal < new Date();
          const isPending = task.is_pending;
          const getPriorityColor = () => {
            if (isPending) return '#8C7348';
            switch (task.priority) {
              case 'high':
                return '#9A5D5D';
              case 'medium':
                return '#8C7348';
              case 'low':
              default:
                return '#5B7CA3';
            }
          };

          return (
        <div 
          key={task.id} 
          className="rounded-xl px-4 py-3 transition-colors cursor-pointer"
          style={{ 
            backgroundColor: '#30302e',
            border: '1px solid #30302e',
            borderLeft: `6px solid ${getPriorityColor()}` 
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.borderLeft = `6px solid ${getPriorityColor()}`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.border = '1px solid #30302e';
            e.currentTarget.style.borderLeft = `6px solid ${getPriorityColor()}`;
          }}
          onClick={() => setSelectedTask(task)}
        >
          <div className="flex items-start gap-3">
            {/* Icon with fixed width for alignment */}
            <div className="w-6 flex-shrink-0">
              <span className="text-xl text-text-muted">{categoryIcons[task.category]}</span>
            </div>
            
            <div className="flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className={`text-sm font-medium text-white ${task.status === 'completed' ? 'line-through opacity-70' : ''}`}>
                    {task.title}
                  </h3>
                  {task.description && (
                    <p className={`text-xs text-text-muted line-clamp-2 mt-1 ${task.status === 'completed' ? 'opacity-70' : ''}`}>
                      {task.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCompleteTask(task.id);
                    }}
                    className="px-2 py-1 bg-button-create hover:bg-button-create/90 text-white text-xs font-medium rounded transition-colors flex-shrink-0"
                  >
                    ✓ Mark Complete
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePending(task.id, !isPending);
                    }}
                    className="px-2 py-1 bg-[#514c78] hover:bg-[#474169] text-white text-xs font-medium rounded transition-colors flex-shrink-0 flex items-center gap-1"
                  >
                    <Clock className="h-3 w-3" />
                    {isPending ? 'Pending' : 'Mark Pending'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 mt-2 text-xs text-text-muted">
                <div className="flex items-center gap-2">
                  {task.due_date && (
                    <span className={isOverdue ? 'text-red-400 font-semibold' : ''}>
                      Due {dueLocal?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {isOverdue && ' (Overdue)'}
                    </span>
                  )}
                </div>
                {/* Comment icon - show only if there are comments */}
                {task.comment_count !== undefined && task.comment_count !== null && Number(task.comment_count) > 0 && (
                  <div className="flex items-center gap-1 text-blue-400">
                    <MessageSquare className="h-3 w-3" />
                    <span>{task.comment_count}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
      })}
        </div>
      )}
      
      <div className="flex items-center justify-between mt-4">
        {!collapsed && hasMoreTasks && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                +{Math.min(2, allTasks.length - 3)} more
              </>
            )}
          </button>
        )}
        
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors ml-auto"
        >
          {collapsed ? (
            <>
              <ChevronDown className="w-3 h-3" />
              Show tasks
            </>
          ) : (
            <>
              <ChevronUp className="w-3 h-3" />
              Hide tasks
            </>
          )}
        </button>
      </div>

    {/* Task Detail Modal */}
    {selectedTask && (
      <TaskDetailModal
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onComplete={async () => {
          await handleCompleteTask(selectedTask.id);
          setSelectedTask(null);
        }}
        onEdit={() => {
          setEditingTask(selectedTask);
          setSelectedTask(null);
        }}
        onPending={async () => {
          await handleTogglePending(selectedTask.id, !selectedTask.is_pending);
          setSelectedTask(null);
        }}
      />
    )}

    {/* Task Modal for editing */}
    <TaskModal
      isOpen={!!editingTask}
      task={editingTask}
      onClose={() => setEditingTask(null)}
      onSave={() => {
        setEditingTask(null);
        fetchTasks();
      }}
    />
    </>
  );
}
