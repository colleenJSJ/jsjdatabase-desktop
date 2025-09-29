/**
 * Tasks API Service
 * Centralized service for all task-related API operations
 */

import ApiClient from './api-client';
import { Task, TaskStatus, TaskPriority, TaskCategory } from '@/lib/supabase/types';

export interface TaskFilters {
  category?: TaskCategory | 'all';
  priority?: TaskPriority | 'all';
  status?: 'active' | 'drafts' | 'completed';
  assigned_user?: string;
  project?: string;
  search?: string;
  show_favorites?: boolean;
  show_urgent?: boolean;
  page?: number;
  limit?: number;
}

export interface TasksResponse {
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface CreateTaskData {
  title: string;
  description?: string;
  category: TaskCategory;
  priority: TaskPriority;
  status?: TaskStatus;
  due_date?: string;
  assigned_to?: string[];
  project_id?: string;
  is_pinned?: boolean;
  is_draft?: boolean;
  recurrence_pattern?: string;
}

export interface UpdateTaskData extends Partial<CreateTaskData> {
  id: string;
}

class TasksService {
  private baseUrl = '/api/tasks';
  
  /**
   * Fetch tasks with filters
   */
  async getTasks(filters: TaskFilters = {}): Promise<TasksResponse> {
    const response = await ApiClient.get<TasksResponse>(this.baseUrl, filters);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch tasks');
    }
    
    return response.data!;
  }
  
  /**
   * Get a single task by ID
   */
  async getTask(id: string): Promise<Task> {
    const response = await ApiClient.get<Task>(`${this.baseUrl}/${id}`);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch task');
    }
    
    return response.data!;
  }
  
  /**
   * Create a new task
   */
  async createTask(data: CreateTaskData): Promise<Task> {
    const response = await ApiClient.post<Task>(this.baseUrl, data);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to create task');
    }
    
    return response.data!;
  }
  
  /**
   * Update an existing task
   */
  async updateTask(id: string, data: Partial<UpdateTaskData>): Promise<Task> {
    const response = await ApiClient.put<Task>(`${this.baseUrl}/${id}`, data);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to update task');
    }
    
    return response.data!;
  }
  
  /**
   * Delete a task
   */
  async deleteTask(id: string): Promise<void> {
    const response = await ApiClient.delete(`${this.baseUrl}/${id}`);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to delete task');
    }
  }
  
  /**
   * Mark task as complete
   */
  async completeTask(id: string): Promise<Task> {
    const response = await ApiClient.post<Task>(`${this.baseUrl}/${id}/complete`);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to complete task');
    }
    
    return response.data!;
  }
  
  /**
   * Undo task completion
   */
  async undoCompleteTask(id: string): Promise<Task> {
    const response = await ApiClient.post<Task>(`${this.baseUrl}/${id}/undo-complete`);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to undo task completion');
    }
    
    return response.data!;
  }
  
  /**
   * Mark task as pending
   */
  async markTaskPending(id: string): Promise<Task> {
    const response = await ApiClient.post<Task>(`${this.baseUrl}/${id}/pending`);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to mark task as pending');
    }
    
    return response.data!;
  }
  
  /**
   * Update task status
   */
  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
    const response = await ApiClient.post<Task>(`${this.baseUrl}/${id}/status`, { status });
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to update task status');
    }
    
    return response.data!;
  }
  
  /**
   * Get task comments
   */
  async getTaskComments(taskId: string): Promise<any[]> {
    const response = await ApiClient.get<any[]>(`${this.baseUrl}/${taskId}/comments`);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch task comments');
    }
    
    return response.data!;
  }
  
  /**
   * Add comment to task
   */
  async addTaskComment(taskId: string, comment: string): Promise<any> {
    const response = await ApiClient.post<any>(`${this.baseUrl}/${taskId}/comments`, { comment });
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to add task comment');
    }
    
    return response.data!;
  }
  
  /**
   * Get dashboard tasks (top priority active tasks)
   */
  async getDashboardTasks(): Promise<Task[]> {
    const response = await ApiClient.get<{ tasks: Task[] }>(`${this.baseUrl}/dashboard`);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch dashboard tasks');
    }
    
    return response.data!.tasks;
  }
}

// Export singleton instance
export const tasksService = new TasksService();

// Export class for testing
export default TasksService;