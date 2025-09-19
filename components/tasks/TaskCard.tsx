'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Task } from '@/lib/supabase/types';
import { Category } from '@/lib/categories/categories-client';
import { formatCategoryName, isCategoryArchived } from '@/lib/categories/categories-utils';
import { 
  User as UserIcon, 
  Hospital, 
  Home, 
  Plane, 
  Briefcase, 
  Users, 
  PawPrint, 
  FileText, 
  ClipboardList,
  Trash2,
  Undo,
  MessageSquare,
  Clock
} from 'lucide-react';
import { parseDateOnlyLocal } from '@/lib/utils/date-utils';

interface TaskCardProps {
  task: Task;
  urgent?: boolean;
  isDraft?: boolean;
  isCompleted?: boolean;
  isSelected?: boolean;
  showDelete?: boolean;
  categories?: Category[];
  onEdit?: (task: Task) => void;
  onComplete?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
  onUndoComplete?: (taskId: string) => void;
  onToggleSelect?: (taskId: string) => void;
  onClick?: (task: Task) => void;
  onTogglePending?: (taskId: string, isPending: boolean) => void;
}

const getCategoryIcon = (category: string) => {
  const icons: Record<string, React.ReactNode> = {
    medical: <Hospital className="h-5 w-5" />,
    household: <Home className="h-5 w-5" />,
    personal: <UserIcon className="h-5 w-5" />,
    travel: <Plane className="h-5 w-5" />,
    work: <Briefcase className="h-5 w-5" />,
    family: <Users className="h-5 w-5" />,
    pets: <PawPrint className="h-5 w-5" />,
    administrative: <FileText className="h-5 w-5" />,
    documents: <FileText className="h-5 w-5" />
  };
  return icons[category] || <ClipboardList className="h-5 w-5" />;
};

export default function TaskCard({ task, urgent = false, isDraft = false, isCompleted = false, isSelected = false, showDelete = false, categories = [], onEdit, onComplete, onDelete, onUndoComplete, onToggleSelect, onClick, onTogglePending }: TaskCardProps) {
  const handleComplete = async () => {
    console.log('[TaskCard] Marking task complete:', task.id);
    if (onComplete) {
      onComplete(task.id);
    } else {
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: 'POST'
      });
      console.log('[TaskCard] Complete response:', res.status, res.ok);
      if (res.ok) {
        console.log('[TaskCard] Task marked complete, reloading page');
        window.location.reload();
      } else {
        console.error('[TaskCard] Failed to mark task complete');
      }
    }
  };

  const handleTogglePending = async () => {
    const newPendingState = !task.is_pending;
    console.log('[TaskCard] Toggling pending status:', task.id, newPendingState);
    if (onTogglePending) {
      onTogglePending(task.id, newPendingState);
    } else {
      const res = await fetch(`/api/tasks/${task.id}/pending`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pending: newPendingState })
      });
      console.log('[TaskCard] Pending toggle response:', res.status, res.ok);
      if (res.ok) {
        console.log('[TaskCard] Task pending status toggled, reloading page');
        window.location.reload();
      } else {
        console.error('[TaskCard] Failed to toggle pending status');
      }
    }
  };

  const isPending = task.is_pending;
  const dueDateLocal = task.due_date ? parseDateOnlyLocal(task.due_date) : null;
  const isOverdue = !!dueDateLocal && dueDateLocal < new Date();

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
      className={`bg-background-secondary border border-gray-600/30 hover:border-gray-500 rounded-xl p-3 cursor-pointer transition-colors`}
      style={{
        borderLeft: `4px solid ${getPriorityColor()}`
      }}
      onClick={(e) => {
        // Only trigger onClick if not clicking on interactive elements
        const target = e.target as HTMLElement;
        if (!target.closest('button') && !target.closest('input[type="checkbox"]') && onClick) {
          onClick(task);
        }
      }}
    >
      <div className="flex items-start gap-3">
        {/* Selection checkbox on the left */}
        {onToggleSelect && !isCompleted && !isDraft && (
          <Checkbox 
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(task.id)}
            className="mt-0.5"
          />
        )}
        
        {/* Icon with fixed width for alignment */}
        <div className="w-6 flex-shrink-0">
          <span className="text-xl text-text-muted">{getCategoryIcon(task.category)}</span>
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
              {!isCompleted && !isDraft && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleComplete();
                    }}
                    className="px-2 py-1 bg-button-create hover:bg-button-create/90 text-white text-xs font-medium rounded transition-colors flex-shrink-0"
                  >
                    ✓ Mark Complete
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePending();
                    }}
                    className="px-2 py-1 bg-[#514c78] hover:bg-[#474169] text-white text-xs font-medium rounded transition-colors flex-shrink-0 flex items-center gap-1"
                  >
                    <Clock className="h-3 w-3" />
                    {isPending ? 'Clear Pending' : 'Mark Pending'}
                  </button>
                  {showDelete && onDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Are you sure you want to delete this task?')) {
                          onDelete(task.id);
                        }
                      }}
                      className="p-1 bg-button-delete hover:bg-button-delete/90 text-white text-xs rounded transition-colors flex-shrink-0"
                      title="Delete task"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}
              {isCompleted && (
                <>
                  {onUndoComplete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUndoComplete(task.id);
                      }}
                      className="px-2 py-1 bg-button-edit hover:bg-button-edit/90 text-white text-xs font-medium rounded transition-colors flex-shrink-0"
                    >
                      <span className="flex items-center gap-1">
                        <Undo className="h-3 w-3" />
                        Undo Complete
                      </span>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Are you sure you want to delete this task?')) {
                          onDelete(task.id);
                        }
                      }}
                      className="p-1 bg-button-delete hover:bg-button-delete/90 text-white text-xs rounded transition-colors flex-shrink-0"
                      title="Delete task"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 mt-2 text-xs text-text-muted">
            <div className="flex items-center gap-2">
                  {isPending && (
                    <>
                      <span className="px-2 py-0.5 bg-[#514c78] text-white rounded-full text-xs font-medium">PENDING</span>
                    </>
                  )}
              {task.due_date && (
                <>
                  {isPending && <span>•</span>}
                  <span className={isOverdue ? 'text-red-400 font-semibold' : ''}>
                    Due {dueDateLocal?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {isOverdue && ' (Overdue)'}
                  </span>
                </>
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
}
