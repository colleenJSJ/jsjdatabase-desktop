import { getEncryptionSessionToken } from '@/lib/encryption/context';
import { createEdgeHeaders } from '@/lib/supabase/jwt';
import { createServiceClient } from '@/lib/supabase/server';
import type { TaskStatus } from '@/lib/supabase/types';

export interface RecurrencePattern {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number; // e.g., every 2 weeks
  daysOfWeek?: number[]; // 0-6, Sunday-Saturday for weekly
  dayOfMonth?: number; // 1-31 for monthly
  monthOfYear?: number; // 1-12 for yearly
  endDate?: string; // ISO date string
  maxOccurrences?: number;
}

export interface RecurringTask {
  id: string;
  title: string;
  description?: string;
  due_date?: string;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern;
  recurrence_end_date?: string;
  parent_task_id?: string; // Reference to the original recurring task
  assigned_to?: string[];
  project_id?: string;
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  status?: TaskStatus;
}

const PROJECT_REF = (() => {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EDGE_SUPABASE_URL;
  if (!url) return null;
  try {
    const host = new URL(url).host;
    const match = host.match(/^([^.]+)\.supabase\.co$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
})();

const RECURRING_FUNCTION_URL = PROJECT_REF
  ? `https://${PROJECT_REF}.functions.supabase.co/recurring-tasks`
  : null;

const EDGE_SERVICE_SECRET = process.env.EDGE_SERVICE_SECRET || '';

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.EDGE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

let hasLoggedEdgeConfigWarning = false;

type RecurringEdgeResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

async function callRecurringTasksEdge<T>(
  action: 'process' | 'complete',
  payload: Record<string, unknown> = {}
): Promise<RecurringEdgeResponse<T> | null> {
  if (!RECURRING_FUNCTION_URL || !EDGE_SERVICE_SECRET) {
    if (!hasLoggedEdgeConfigWarning) {
      console.warn('[RecurringTaskService] Edge function configuration missing', {
        hasFunctionUrl: Boolean(RECURRING_FUNCTION_URL),
        hasServiceSecret: Boolean(EDGE_SERVICE_SECRET)
      });
      hasLoggedEdgeConfigWarning = true;
    }
    return null;
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-service-secret': EDGE_SERVICE_SECRET
  };

  const sessionToken = getEncryptionSessionToken();
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
    if (SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
    }
  } else {
    try {
      Object.assign(headers, createEdgeHeaders());
    } catch (error) {
      console.warn('[RecurringTaskService] Failed to create edge headers', error);
      return null;
    }
  }

  let response: Response;
  try {
    response = await fetch(RECURRING_FUNCTION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...payload })
    });
  } catch (error) {
    console.warn('[RecurringTaskService] Edge call failed', error);
    return null;
  }

  const text = await response.text();
  let parsed: RecurringEdgeResponse<T> | null = null;
  try {
    parsed = JSON.parse(text) as RecurringEdgeResponse<T>;
  } catch (error) {
    console.error('[RecurringTaskService] Failed to parse edge response', error, text);
    return null;
  }

  if (!response.ok || !parsed?.ok) {
    console.warn('[RecurringTaskService] Edge function error', {
      action,
      status: response.status,
      parsed
    });
    return null;
  }

  return parsed;
}

export class RecurringTaskService {
  /**
   * Calculate the next occurrence date based on the recurrence pattern
   */
  static calculateNextDate(currentDate: Date, pattern: RecurrencePattern): Date | null {
    const next = new Date(currentDate);
    
    switch (pattern.type) {
      case 'daily':
        next.setDate(next.getDate() + pattern.interval);
        break;
        
      case 'weekly':
        if (pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
          // Find next occurrence on specified days
          let daysToAdd = 1;
          const currentDay = next.getDay();
          
          for (let i = 1; i <= 7 * pattern.interval; i++) {
            const checkDay = (currentDay + i) % 7;
            if (pattern.daysOfWeek.includes(checkDay)) {
              daysToAdd = i;
              break;
            }
          }
          next.setDate(next.getDate() + daysToAdd);
        } else {
          // Simple weekly interval
          next.setDate(next.getDate() + (7 * pattern.interval));
        }
        break;
        
      case 'monthly':
        if (pattern.dayOfMonth) {
          // Set to specific day of month
          next.setMonth(next.getMonth() + pattern.interval);
          next.setDate(Math.min(pattern.dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
        } else {
          // Same day next month(s)
          next.setMonth(next.getMonth() + pattern.interval);
        }
        break;
        
      case 'yearly':
        next.setFullYear(next.getFullYear() + pattern.interval);
        if (pattern.monthOfYear) {
          next.setMonth(pattern.monthOfYear - 1);
        }
        break;
    }
    
    // Check if we've exceeded the end date
    if (pattern.endDate && next > new Date(pattern.endDate)) {
      return null;
    }
    
    return next;
  }

  /**
   * Generate recurring task instances for a given period
   */
  static async generateRecurringTasks(
    parentTask: RecurringTask,
    untilDate: Date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default 30 days ahead
  ): Promise<Partial<RecurringTask>[]> {
    const tasks: Partial<RecurringTask>[] = [];
    const pattern = parentTask.recurrence_pattern;
    
    if (!pattern) return tasks;
    
    // Start from the task's due date or today
    let currentDate = parentTask.due_date ? new Date(parentTask.due_date) : new Date();
    let occurrences = 0;
    
    while (currentDate <= untilDate) {
      // Calculate next occurrence
      const nextDate = this.calculateNextDate(currentDate, pattern);
      
      if (!nextDate) break;
      
      // Check max occurrences
      if (pattern.maxOccurrences && occurrences >= pattern.maxOccurrences) {
        break;
      }
      
      // Create new task instance
      tasks.push({
        title: parentTask.title,
        description: parentTask.description,
        due_date: nextDate.toISOString(),
        parent_task_id: parentTask.id,
        assigned_to: parentTask.assigned_to,
        project_id: parentTask.project_id,
        priority: parentTask.priority,
        tags: parentTask.tags,
        is_recurring: false, // Child tasks are not recurring themselves
        status: 'active'
      });
      
      currentDate = nextDate;
      occurrences++;
    }
    
    return tasks;
  }

  /**
   * Process all recurring tasks and generate upcoming instances
   */
  static async processRecurringTasks(): Promise<{ created: number; errors: string[] }> {
    const edgeResult = await callRecurringTasksEdge<{ created: number; errors: string[] }>('process');
    if (edgeResult?.ok && edgeResult.data) {
      return edgeResult.data;
    }

    if (edgeResult && edgeResult.error) {
      console.warn('[RecurringTaskService] Edge process failed, falling back to local:', edgeResult.error);
    }

    return this.processRecurringTasksLocal();
  }

  private static async processRecurringTasksLocal(): Promise<{ created: number; errors: string[] }> {
    const supabase = await createServiceClient();
    const errors: string[] = [];
    let created = 0;

    try {
      const { data: recurringTasks, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('is_recurring', true)
        .eq('status', 'active');

      if (fetchError) {
        errors.push(`Failed to fetch recurring tasks: ${fetchError.message}`);
        return { created, errors };
      }

      if (!recurringTasks || recurringTasks.length === 0) {
        return { created, errors };
      }

      for (const task of recurringTasks) {
        try {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);

          const { data: existingTasks, error: checkError } = await supabase
            .from('tasks')
            .select('id')
            .eq('parent_task_id', task.id)
            .gte('due_date', tomorrow.toISOString())
            .limit(1);

          if (checkError) {
            errors.push(`Failed to check existing tasks for ${task.title}: ${checkError.message}`);
            continue;
          }

          if (existingTasks && existingTasks.length > 0) {
            continue;
          }

          const newTasks = await this.generateRecurringTasks(task);

          if (newTasks.length > 0) {
            const { error: insertError } = await supabase
              .from('tasks')
              .insert(newTasks);

            if (insertError) {
              errors.push(`Failed to create tasks for ${task.title}: ${insertError.message}`);
            } else {
              created += newTasks.length;
            }
          }
        } catch (taskError) {
          errors.push(`Error processing task ${task.title}: ${taskError}`);
        }
      }
    } catch (error) {
      errors.push(`General error: ${error}`);
    }

    return { created, errors };
  }

  /**
   * Mark a recurring task instance as complete and potentially generate the next one
   */
  static async completeRecurringTaskInstance(
    taskId: string
  ): Promise<{ success: boolean; nextTaskId?: string; error?: string }> {
    const edgeResult = await callRecurringTasksEdge<{ success: boolean; nextTaskId?: string; error?: string }>('complete', { taskId });
    if (edgeResult?.ok && edgeResult.data) {
      return edgeResult.data;
    }

    if (edgeResult && edgeResult.error) {
      console.warn('[RecurringTaskService] Edge completion failed, falling back to local:', edgeResult.error);
    }

    return this.completeRecurringTaskInstanceLocal(taskId);
  }

  private static async completeRecurringTaskInstanceLocal(
    taskId: string
  ): Promise<{ success: boolean; nextTaskId?: string; error?: string }> {
    const supabase = await createServiceClient();

    try {
      const { data: task, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (fetchError || !task) {
        return { success: false, error: 'Task not found' };
      }

      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', taskId);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      if (task.parent_task_id) {
        const { data: parentTask, error: parentError } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', task.parent_task_id)
          .single();

        if (!parentError && parentTask && parentTask.is_recurring) {
          const nextTasks = await this.generateRecurringTasks(
            parentTask,
            new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
          );

          if (nextTasks.length > 0) {
            const { data: newTask, error: insertError } = await supabase
              .from('tasks')
              .insert(nextTasks[0])
              .select()
              .single();

            if (!insertError && newTask) {
              return { success: true, nextTaskId: newTask.id };
            }
          }
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}
