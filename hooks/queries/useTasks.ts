/**
 * React Query hooks for Tasks
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { tasksService, TaskFilters } from '@/lib/api/tasks.service';
import { Task, TaskStatus } from '@/lib/supabase/types';

// Query keys factory
export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters: TaskFilters) => [...taskKeys.lists(), filters] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
  dashboard: () => [...taskKeys.all, 'dashboard'] as const,
};

// Fetch tasks with filters
export function useTasks(filters: TaskFilters = {}) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: () => tasksService.getTasks(filters),
    staleTime: 30 * 1000, // Consider data fresh for 30 seconds
  });
}

// Fetch tasks with infinite scroll
export function useInfiniteTasks(filters: TaskFilters = {}) {
  return useInfiniteQuery({
    queryKey: taskKeys.list(filters),
    queryFn: ({ pageParam = 1 }) => 
      tasksService.getTasks({ ...filters, page: pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.hasMore) {
        return allPages.length + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });
}

// Fetch single task
export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => tasksService.getTask(id),
    enabled: !!id,
  });
}

// Fetch dashboard tasks
export function useDashboardTasks() {
  return useQuery({
    queryKey: taskKeys.dashboard(),
    queryFn: () => tasksService.getDashboardTasks(),
    staleTime: 60 * 1000, // Fresh for 1 minute
    refetchInterval: 60 * 1000, // Refetch every minute
  });
}

// Create task mutation
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: tasksService.createTask,
    onSuccess: (newTask) => {
      // Invalidate and refetch task lists
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      // Add the new task to the cache
      queryClient.setQueryData(taskKeys.detail(newTask.id), newTask);
    },
  });
}

// Update task mutation
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      tasksService.updateTask(id, data),
    onMutate: async ({ id, ...data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(id) });
      
      // Snapshot the previous value
      const previousTask = queryClient.getQueryData(taskKeys.detail(id));
      
      // Optimistically update
      queryClient.setQueryData(taskKeys.detail(id), (old: any) => ({
        ...old,
        ...data,
      }));
      
      return { previousTask };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousTask) {
        queryClient.setQueryData(
          taskKeys.detail(variables.id),
          context.previousTask
        );
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

// Delete task mutation
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: tasksService.deleteTask,
    onSuccess: (_, taskId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: taskKeys.detail(taskId) });
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

// Complete task mutation
export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: tasksService.completeTask,
    onMutate: async (taskId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });
      
      // Snapshot the previous value
      const previousTask = queryClient.getQueryData<Task>(taskKeys.detail(taskId));
      
      // Optimistically update
      queryClient.setQueryData(taskKeys.detail(taskId), (old: any) => ({
        ...old,
        status: 'completed',
        completed_at: new Date().toISOString(),
      }));
      
      // Also update in lists
      queryClient.setQueriesData(
        { queryKey: taskKeys.lists() },
        (oldData: any) => {
          if (!oldData?.tasks) return oldData;
          return {
            ...oldData,
            tasks: oldData.tasks.map((task: Task) =>
              task.id === taskId
                ? { ...task, status: 'completed', completed_at: new Date().toISOString() }
                : task
            ),
          };
        }
      );
      
      return { previousTask };
    },
    onError: (err, taskId, context) => {
      // Rollback on error
      if (context?.previousTask) {
        queryClient.setQueryData(taskKeys.detail(taskId), context.previousTask);
      }
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
    onSuccess: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: taskKeys.dashboard() });
    },
  });
}

// Undo complete task mutation
export function useUndoCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: tasksService.undoCompleteTask,
    onSuccess: (updatedTask) => {
      // Update cache
      queryClient.setQueryData(taskKeys.detail(updatedTask.id), updatedTask);
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: taskKeys.dashboard() });
    },
  });
}

// Update task status mutation
export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      tasksService.updateTaskStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(id) });
      
      const previousTask = queryClient.getQueryData<Task>(taskKeys.detail(id));
      
      queryClient.setQueryData(taskKeys.detail(id), (old: any) => ({
        ...old,
        status,
      }));
      
      return { previousTask };
    },
    onError: (err, variables, context) => {
      if (context?.previousTask) {
        queryClient.setQueryData(
          taskKeys.detail(variables.id),
          context.previousTask
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

// Prefetch tasks
export function usePrefetchTasks(filters: TaskFilters = {}) {
  const queryClient = useQueryClient();

  const prefetch = () => {
    queryClient.prefetchQuery({
      queryKey: taskKeys.list(filters),
      queryFn: () => tasksService.getTasks(filters),
    });
  };

  return prefetch;
}