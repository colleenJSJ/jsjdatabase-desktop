import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withCache, invalidateRelatedCache } from '@/lib/utils/cache';
import { logErrorAndReturn, extractUserId } from '@/lib/utils/error-logger';
import { enforceCSRF } from '@/lib/security/csrf';

/**
 * Consolidated Tasks Dashboard Endpoint
 * Returns all task-related data in a single call to eliminate N+1 queries
 * Maintains the exact same response structure the frontend expects
 */
export async function GET(request: NextRequest) {
  const context = {
    endpoint: '/api/tasks/dashboard',
    method: 'GET',
    userId: await extractUserId(request),
  };

  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use caching for this expensive operation
    const data = await withCache(
      '/api/tasks/dashboard',
      async () => {
        // Fetch all data in parallel with proper joins
        const [
          tasksResult,
          usersResult,
          projectsResult,
          categoriesResult,
        ] = await Promise.all([
          // Fetch tasks with all related data in one query
          supabase
            .from('tasks')
            .select(`
              *,
              created_by_user:users!tasks_created_by_fkey(
                id,
                email,
                name,
                avatar_url
              ),
              updated_by_user:users!tasks_updated_by_fkey(
                id,
                email,
                name
              ),
              completed_by_user:users!tasks_completed_by_fkey(
                id,
                email,
                name
              ),
              project:projects(
                id,
                name,
                description,
                status
              ),
              task_assignments(
                id,
                user_id,
                assigned_at,
                assigned_by,
                user:users(
                  id,
                  email,
                  name,
                  avatar_url
                )
              ),
              task_comments(count)
            `)
            .order('created_at', { ascending: false }),
          
          // Fetch all users for assignment dropdown
          supabase
            .from('users')
            .select('id, email, name, avatar_url, role')
            .order('name', { ascending: true }),
          
          // Fetch all projects for filtering
          supabase
            .from('projects')
            .select('*')
            .order('name', { ascending: true }),
          
          // Get distinct categories
          supabase
            .from('tasks')
            .select('category')
            .not('category', 'is', null)
            .order('category', { ascending: true }),
        ]);

        // Check for errors
        if (tasksResult.error) throw tasksResult.error;
        if (usersResult.error) throw usersResult.error;
        if (projectsResult.error) throw projectsResult.error;
        if (categoriesResult.error) throw categoriesResult.error;

        // Process tasks to match expected format
        const processedTasks = tasksResult.data?.map(task => {
          // Extract comment count from the aggregate
          const commentCount = task.task_comments?.[0]?.count || 0;
          
          // Extract assigned users from task_assignments
          const assigned_to = task.task_assignments?.map((assignment: any) => assignment.user) || [];
          
          // Build the task object in the format frontend expects
          return {
            ...task,
            comment_count: commentCount,
            assigned_to, // Frontend expects this array
            created_by_user: task.created_by_user,
            updated_by_user: task.updated_by_user,
            completed_by_user: task.completed_by_user,
            project: task.project,
            // Remove the raw join data
            task_assignments: undefined,
            task_comments: undefined,
          };
        }) || [];

        // Extract unique categories
        const uniqueCategories = [...new Set(categoriesResult.data?.map(item => item.category) || [])];

        // Build response in the exact format the frontend expects
        return {
          tasks: processedTasks,
          users: usersResult.data || [],
          projects: projectsResult.data || [],
          categories: uniqueCategories,
          stats: {
            total: processedTasks.length,
            pending: processedTasks.filter(t => t.status === 'pending').length,
            in_progress: processedTasks.filter(t => t.status === 'in_progress').length,
            completed: processedTasks.filter(t => t.status === 'completed').length,
            overdue: processedTasks.filter(t => {
              if (!t.due_date) return false;
              return new Date(t.due_date) < new Date() && t.status !== 'completed';
            }).length,
          },
        };
      },
      { userId: user.id }
    );

    // Return successful response maintaining frontend-expected format
    return NextResponse.json({
      success: true,
      data,
    });

  } catch (error: any) {
    return logErrorAndReturn(error, context, 'Failed to fetch tasks dashboard data');
  }
}

/**
 * POST endpoint to trigger cache invalidation after task updates
 * Call this after any task-related data changes
 */
export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const context = {
    endpoint: '/api/tasks/dashboard',
    method: 'POST',
    userId: await extractUserId(request),
  };

  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Invalidate task-related caches
    await invalidateRelatedCache('tasks', 'update');
    await invalidateRelatedCache('dashboard', 'update');

    return NextResponse.json({
      success: true,
      message: 'Tasks dashboard cache invalidated',
    });

  } catch (error: any) {
    return logErrorAndReturn(error, context, 'Failed to invalidate tasks cache');
  }
}
