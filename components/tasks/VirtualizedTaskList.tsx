'use client';

import React, { memo } from 'react';
import { Task } from '@/lib/supabase/types';
import { VirtualizedList, FixedHeightVirtualizedList } from '@/components/ui/virtualized-list';
import TaskCard from './TaskCard';
import { parseDateOnlyLocal } from '@/lib/utils/date-utils';

interface VirtualizedTaskListProps {
  tasks: Task[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  onTaskClick: (task: Task) => void;
  onComplete: (taskId: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  viewMode: 'card' | 'list';
  selectedTasks: Set<string>;
  onTaskSelect: (taskId: string, selected: boolean) => void;
}

// Memoized task card to prevent unnecessary re-renders
const MemoizedTaskCard = memo(({ 
  task, 
  onClick, 
  onComplete, 
  onEdit, 
  onDelete
}: {
  task: Task;
  onClick: () => void;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => (
  <div className="px-4 py-2">
    <TaskCard
      task={task}
      onClick={onClick}
      onComplete={onComplete}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  </div>
));

MemoizedTaskCard.displayName = 'MemoizedTaskCard';

export function VirtualizedTaskList({
  tasks,
  loading,
  hasMore,
  loadMore,
  onTaskClick,
  onComplete,
  onEdit,
  onDelete,
  viewMode,
  selectedTasks,
  onTaskSelect,
}: VirtualizedTaskListProps) {
  // Card view - variable height based on content
  if (viewMode === 'card') {
    const renderTaskCard = (task: Task, index: number) => (
      <MemoizedTaskCard
        key={task.id}
        task={task}
        onClick={() => onTaskClick(task)}
        onComplete={() => onComplete(task.id)}
        onEdit={() => onEdit(task)}
        onDelete={() => onDelete(task.id)}
        
      />
    );

    const getItemHeight = (index: number) => {
      const task = tasks[index];
      if (!task) return 80;
      
      // Estimate height based on content
      let height = 100; // Base height
      if (task.description) height += 20;
      if (task.due_date) height += 20;
      if (task.assigned_users?.length) height += 20;
      if (task.comment_count && Number(task.comment_count) > 0) height += 20;
      
      return height;
    };

    return (
      <VirtualizedList
        items={tasks}
        renderItem={renderTaskCard}
        getItemHeight={getItemHeight}
        hasMore={hasMore}
        loadMore={loadMore}
        loading={loading}
        estimatedItemHeight={120}
        overscan={5}
        className="h-[calc(100vh-240px)] min-h-[320px]"
        emptyMessage="No tasks found. Create your first task to get started."
        threshold={10}
      />
    );
  }

  // List view - fixed height rows
  const renderTaskListItem = (task: Task, index: number) => (
    <div 
      key={task.id}
      className="px-4 py-2 hover:bg-gray-800/50 cursor-pointer border-b border-gray-700"
      onClick={() => onTaskClick(task)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <input
            type="checkbox"
            checked={selectedTasks.has(task.id)}
            onChange={(e) => {
              e.stopPropagation();
              onTaskSelect(task.id, e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
          />
          
          <div className="flex-1">
            <h3 className="text-sm font-medium text-text-primary">
              {task.title}
            </h3>
            {task.description && (
              <p className="text-xs text-text-muted line-clamp-1 mt-1">
                {task.description}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs rounded-full ${
              task.priority === 'high' ? 'bg-red-500/20 text-red-400' :
              task.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-gray-500/20 text-gray-400'
            }`}>
              {task.priority}
            </span>
            
            {task.due_date && (
              <span className="text-xs text-text-muted">
                Due {parseDateOnlyLocal(task.due_date).toLocaleDateString()}
              </span>
            )}
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                onComplete(task.id);
              }}
              className="px-3 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-xs rounded transition-colors"
            >
              Complete
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <FixedHeightVirtualizedList
      items={tasks}
      renderItem={renderTaskListItem}
      itemHeight={60}
      hasMore={hasMore}
      loadMore={loadMore}
      loading={loading}
      overscan={5}
      className="h-[calc(100vh-240px)] min-h-[320px]"
      emptyMessage="No tasks found. Create your first task to get started."
    />
  );
}
