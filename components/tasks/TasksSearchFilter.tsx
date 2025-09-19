'use client';

import { useState } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { useFamilyMembers } from '@/hooks/use-family-members';

export type TaskStatusFilter = 'active' | 'pending' | 'completed' | 'draft';

interface TasksSearchFilterProps {
  onSearchChange: (q: string) => void;
  categories: Array<{ id?: string; name?: string } & Record<string, any>>;
  priorities?: Array<'high' | 'medium' | 'low'>;
  status: TaskStatusFilter;
  category: string;
  priority: string | 'all';
  onStatusChange: (s: TaskStatusFilter) => void;
  onCategoryChange: (c: string) => void;
  onPriorityChange: (p: 'high' | 'medium' | 'low' | 'all') => void;
  commentsOpen?: boolean;
  onToggleComments?: () => void;
  assignedTo?: string;
  onAssignedChange?: (id: string) => void;
  statusCounts?: { active: number; pending: number; completed: number; drafts?: number };
}

export function TasksSearchFilter({
  onSearchChange,
  categories,
  priorities = ['high', 'medium', 'low'],
  status,
  category,
  priority,
  onStatusChange,
  onCategoryChange,
  onPriorityChange,
  commentsOpen = false,
  onToggleComments,
  assignedTo = 'all',
  onAssignedChange,
  statusCounts,
}: TasksSearchFilterProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [open, setOpen] = useState(false);
  const { memberOptions } = useFamilyMembers({ includePets: false, includeExtended: true });

  const filtersActive =
    status !== 'active' || category !== 'all' || priority !== 'all' || assignedTo !== 'all';

  const clear = () => {
    onStatusChange('active');
    onCategoryChange('all');
    onPriorityChange('all');
    onAssignedChange?.('all');
  };

  const renderCount = (value?: number) => (statusCounts ? ` (${value ?? 0})` : '');

  return (
    <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-3 mb-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search tasks by title or description..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              onSearchChange(e.target.value);
            }}
            className="w-full pl-10 pr-3 py-1 bg-background-primary border border-gray-600/30 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
          />
        </div>

        <button
          onClick={() => onToggleComments?.()}
          className={`inline-flex items-center gap-2 px-4 py-1 rounded-xl border transition-colors ${
            commentsOpen
              ? 'bg-gray-700 text-text-primary border-gray-600'
              : 'bg-background-primary text-text-muted border border-gray-600/30 hover:bg-gray-700/20 hover:text-text-primary'
          }`}
          title="Toggle comments"
        >
          Comments
        </button>

        <button
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex items-center gap-2 px-4 py-1 rounded-xl transition-colors ${
            open || filtersActive
              ? 'bg-gray-700 text-text-primary border border-gray-600'
              : 'bg-background-primary text-text-muted border border-gray-600/30 hover:bg-gray-700/20 hover:text-text-primary'
          }`}
        >
          <Filter className="h-4 w-4" />
          <span>Filters</span>
          {filtersActive && (
            <span className="ml-1 px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full">Active</span>
          )}
        </button>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-gray-600/30 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => onPriorityChange(e.target.value as any)}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              >
                <option value="all">All</option>
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
                Assigned To
              </label>
              <select
                value={assignedTo}
                onChange={(e) => onAssignedChange?.(e.target.value)}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700 min-w-[160px]"
              >
                {memberOptions.map((opt: any) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => onCategoryChange(e.target.value)}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700 min-w-[160px]"
              >
                <option value="all">All</option>
                {categories.map((c) => (
                  <option key={c.id || c.name} value={c.name || c.id}>
                    {c.name || c.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => onStatusChange(e.target.value as TaskStatusFilter)}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              >
                <option value="active">Active{renderCount(statusCounts?.active)}</option>
                <option value="pending">Pending{renderCount(statusCounts?.pending)}</option>
                <option value="completed">Completed{renderCount(statusCounts?.completed)}</option>
                <option value="draft">Drafts{statusCounts && statusCounts.drafts !== undefined ? renderCount(statusCounts.drafts) : ''}</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <button
              onClick={clear}
              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" /> Clear Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
