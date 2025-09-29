import { createClient, createServiceClient } from '@/lib/supabase/server';
import { Task, TaskCategory, TaskStatus, TaskPriority, User } from '@/lib/supabase/types';
import type { Database } from '@/lib/database.types';

type DbTaskStatus = Database['public']['Tables']['tasks']['Row']['status'];

function toDbStatus(status?: TaskStatus | null): DbTaskStatus | undefined {
  if (!status) return undefined;
  switch (status) {
    case 'active':
    case 'in_progress':
      return 'in_progress';
    case 'draft':
    case 'pending':
      return 'pending';
    case 'completed':
    case 'archived':
    case 'cancelled':
      return 'completed';
    default:
      return status as DbTaskStatus;
  }
}

function fromDbStatus(status: DbTaskStatus): TaskStatus {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'in_progress':
      return 'active';
    case 'completed':
      return 'completed';
    default:
      return status as TaskStatus;
  }
}

// Extend the database type to include the assigned_to field used in the app
type TaskUpdate = Partial<Database['public']['Tables']['tasks']['Update'] & {
  assigned_to?: string[] | null;
}>;

export class TasksService {
  // Server-side methods
  static async createTask(
    task: Omit<Task, 'id' | 'created_at' | 'updated_at'>,
    assignedUserIds: string[]
  ) {
    const supabase = await createClient();
    
    console.log('[TasksService] Creating task with data:', task);
    console.log('[TasksService] Assigned user IDs:', assignedUserIds);
    
    const insertData = {
      title: task.title,
      description: task.description,
      category: task.category,
      status: toDbStatus(task.status) || 'pending',
      priority: task.priority,
      due_date: task.due_date,
      created_by: task.created_by,
      assigned_to: assignedUserIds.length > 0 ? assignedUserIds : null,
    };
    
    console.log('[TasksService] Insert data:', insertData);
    
    // Create the task with assigned_to array
    const { data: newTask, error: taskError } = await supabase
      .from('tasks')
      .insert(insertData)
      .select()
      .single();

    if (taskError) {
      console.error('[TasksService] Database error:', taskError);
      console.error('[TasksService] Failed data:', insertData);
      throw new Error(`Failed to create task: ${taskError.message}`);
    }

    if (!newTask) {
      throw new Error('Failed to create task: No data returned');
    }

    console.log('[TasksService] Task created successfully:', newTask);
    return newTask;
  }

  static async getTasksForUser(userId: string, isAdmin: boolean = false) {

    try {
      const supabase = await createClient();

      // Simple query without joins
      let query = supabase
        .from('tasks')
        .select('*')
        .order('priority', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false });

      // If not admin, filter by assigned tasks or created tasks
      if (!isAdmin) {

        query = query.or(`created_by.eq.${userId},assigned_to.cs.{${userId}}`);
      }

      const { data: tasks, error } = await query;

      if (error) {

        throw new Error(`Failed to fetch tasks: ${error.message}`);
      }

      if (!tasks) {

        return [];
      }

      // Collect all unique user IDs we need to fetch
      const allUserIds = new Set<string>();
      
      tasks.forEach(task => {
        // Add created_by user
        if (task.created_by) {
          allUserIds.add(task.created_by);
        }
        // Add completed_by user
        if (task.completed_by) {
          allUserIds.add(task.completed_by);
        }
        // Add assigned users
        if (task.assigned_to && Array.isArray(task.assigned_to)) {
          task.assigned_to.forEach((id: string) => allUserIds.add(id));
        }
      });

      // Fetch all users at once
      let usersMap: Record<string, User> = {};
      if (allUserIds.size > 0) {

        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, name, email, role, user_status, theme_preference, created_at, updated_at, phone, avatar_url, notification_preferences')
          .in('id', Array.from(allUserIds));
        
        if (usersError) {

        } else if (users) {
          usersMap = users.reduce((acc, user) => {
            acc[user.id] = user;
            return acc;
          }, {} as Record<string, User>);
        }
      }

      // Transform tasks to include user details
      const transformedTasks = tasks.map(task => ({
        ...task,
        status: fromDbStatus(task.status as DbTaskStatus),
        created_by_user: task.created_by ? usersMap[task.created_by] : undefined,
        completed_by_user: task.completed_by ? usersMap[task.completed_by] : undefined,
        assigned_users: task.assigned_to?.map((userId: string) => usersMap[userId]).filter(Boolean) || [],
      }));

      return transformedTasks;
    } catch (error) {

      throw error;
    }
  }

  static async updateTask(
    taskId: string,
    task: Partial<Task>,
    assignedUserIds?: string[]
  ) {
    const supabase = await createClient();
    
    // Build update object
    const updateData: TaskUpdate = {
      updated_at: new Date().toISOString()
    };

    if (task.title !== undefined) updateData.title = task.title;
    if (task.description !== undefined) updateData.description = task.description;
    if (task.category !== undefined) updateData.category = task.category;
    if (task.status !== undefined) updateData.status = toDbStatus(task.status);
    if (task.priority !== undefined) updateData.priority = task.priority as Database['public']['Tables']['tasks']['Update']['priority'];
    if (task.due_date !== undefined) updateData.due_date = task.due_date;
    if (task.is_pinned !== undefined) updateData.is_pinned = task.is_pinned;
    if (task.completed_at !== undefined) updateData.completed_at = task.completed_at;
    if (task.completed_by !== undefined) updateData.completed_by = task.completed_by;
    if (task.link !== undefined) updateData.link = task.link;
    if (task.document_ids !== undefined) updateData.document_ids = task.document_ids as any;
    if (task.notes !== undefined) updateData.notes = task.notes as any;

    // Update assigned_to if provided
    if (assignedUserIds !== undefined) {
      updateData.assigned_to = assignedUserIds.length > 0 ? assignedUserIds : null;
    }
    
    // Update the task
    const { data: updatedTask, error: taskError } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)
      .select()
      .single();

    if (taskError || !updatedTask) {

      throw new Error('Failed to update task');
    }

    updatedTask.status = fromDbStatus(updatedTask.status as DbTaskStatus);

    // Fetch user details for the updated task
    if (updatedTask.assigned_to && updatedTask.assigned_to.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name, email, role, user_status, theme_preference, created_at, updated_at, phone, avatar_url, notification_preferences')
        .in('id', updatedTask.assigned_to);
      
      if (!usersError && users) {
        updatedTask.assigned_users = users;
      }
    } else {
      updatedTask.assigned_users = [];
    }

    return updatedTask;
  }

  static async updateTaskStatus(taskId: string, status: TaskStatus, userId: string) {
    const supabase = await createClient();
    
    const updateData: TaskUpdate = {
      status: toDbStatus(status),
      updated_at: new Date().toISOString()
    };

    // If marking as completed, set completion fields
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
      updateData.completed_by = userId;
    } else {
      // If uncompleting, clear completion fields
      updateData.completed_at = null;
      updateData.completed_by = null;
    }

    const { error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId);

    if (error) {
      throw new Error('Failed to update task status');
    }
  }

  static async completeTask(taskId: string, userId: string) {
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId);

    if (error) {
      throw new Error('Failed to complete task');
    }
  }

  static async deleteTask(taskId: string) {
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      throw new Error('Failed to delete task');
    }
  }

  static async getUsers() {
    const supabase = await createServiceClient();
    
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('is_active', true)
      .order('name');

    if (error) {
      throw new Error('Failed to fetch users');
    }

    return users;
  }
}
