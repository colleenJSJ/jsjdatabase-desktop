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
    const supabase = await createServiceClient();
    const errors: string[] = [];
    let created = 0;
    
    try {
      // Get all active recurring tasks
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
      
      // Generate future instances for each recurring task
      for (const task of recurringTasks) {
        try {
          // Check if instances already exist for the next period
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
          
          // Skip if future instances already exist
          if (existingTasks && existingTasks.length > 0) {
            continue;
          }
          
          // Generate new instances
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
    const supabase = await createServiceClient();
    
    try {
      // Get the task details
      const { data: task, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();
      
      if (fetchError || !task) {
        return { success: false, error: 'Task not found' };
      }
      
      // Mark as complete
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
      
      // If this is a child of a recurring task, generate the next instance
      if (task.parent_task_id) {
        const { data: parentTask, error: parentError } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', task.parent_task_id)
          .single();
        
        if (!parentError && parentTask && parentTask.is_recurring) {
          const nextTasks = await this.generateRecurringTasks(
            parentTask,
            new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // Look 60 days ahead
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
