// PHASE 3: EXAMPLE REFACTORED API ROUTE
// Shows how to use the new auth middleware and validation utilities

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PAGINATION } from '@/constants';
import { ActivityLogger } from '@/lib/services/activity-logger';
import { authenticateRequest } from '@/lib/utils/auth-middleware';
import { validateForm, validators } from '@/lib/utils/validation';
import { processRelatedTo } from '@/lib/constants/family-members';

export async function GET(request: NextRequest) {
  try {
    // Use the new auth middleware
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return auth.response!;
    }

    const supabase = await createClient();
    const { user } = auth;

    // Get pagination parameters with validation
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get('limit') || String(PAGINATION.DEFAULT_PAGE_SIZE), 10)),
      PAGINATION.MAX_PAGE_SIZE
    );
    const offset = (page - 1) * limit;

    // Build query with proper filtering
    let query = supabase
      .from('tasks')
      .select('*', { count: 'exact' })
      .order('priority', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .range(offset, offset + limit - 1);

    // Apply role-based filtering
    if ((user as any).role !== 'admin') {
      query = query.or(`created_by.eq.${(user as any).id},assigned_to.cs.{${(user as any).id}}`);
    }
    
    const { data: tasks, error: tasksError, count } = await query;

    if (tasksError) {
      console.error('[Tasks API] Database error:', tasksError);
      return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }

    // Batch fetch related data
    const userIds = new Set<string>();
    const taskIds: string[] = [];
    
    tasks?.forEach(task => {
      taskIds.push(task.id);
      if (task.created_by) userIds.add(task.created_by);
      if (task.assigned_to && Array.isArray(task.assigned_to)) {
        task.assigned_to.forEach((id: string) => userIds.add(id));
      }
    });

    // Parallel fetch user details and comment counts
    const [usersResult, commentsResult] = await Promise.all([
      userIds.size > 0 
        ? supabase.from('users').select('id, name, email').in('id', Array.from(userIds))
        : Promise.resolve({ data: [] }),
      taskIds.length > 0
        ? supabase.from('task_comments').select('task_id').in('task_id', taskIds).eq('is_deleted', false)
        : Promise.resolve({ data: [] })
    ]);

    // Map users and count comments
    const usersMap = (usersResult.data || []).reduce((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {} as Record<string, any>);

    const commentCounts = (commentsResult.data || []).reduce((acc, comment) => {
      acc[comment.task_id] = (acc[comment.task_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Transform tasks
    const transformedTasks = (tasks || []).map(task => ({
      ...task,
      assigned_users: task.assigned_to?.map((userId: string) => usersMap[userId]).filter(Boolean) || [],
      created_by_user: task.created_by ? usersMap[task.created_by] : undefined,
      comment_count: commentCounts[task.id] || 0
    }));
    
    return NextResponse.json({ 
      tasks: transformedTasks,
      pagination: {
        page,
        limit,
        totalCount: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('[API/tasks GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Use the new auth middleware
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return auth.response!;
    }

    const supabase = await createClient();
    const { user } = auth;
    const body = await request.json();
    
    // Extract task data with proper structure
    const taskData = body.task || body;
    let assignedUserIds = body.assignedUserIds || body.assigned_to || [];

    // Validate input using the validation utility
    const validation = validateForm([
      {
        field: 'title',
        value: taskData.title,
        rules: { required: true, minLength: 1, maxLength: 255 }
      },
      {
        field: 'category',
        value: taskData.category,
        rules: { 
          required: true,
          custom: (v) => validators.oneOf([
            'medical', 'household', 'personal', 'administrative',
            'travel', 'pets', 'documents', 'work', 'family'
          ])(v)
        }
      },
      {
        field: 'priority',
        value: taskData.priority || 'medium',
        rules: {
          custom: (v) => validators.oneOf(['low', 'medium', 'high'])(v)
        }
      },
      {
        field: 'due_date',
        value: taskData.due_date,
        rules: {
          custom: (v) => !v || validators.futureDate(v)
        }
      }
    ]);

    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Validation failed', errors: validation.errors },
        { status: 400 }
      );
    }

    // Process assigned users - use the family member utility if needed
    if (typeof assignedUserIds === 'string') {
      assignedUserIds = [assignedUserIds];
    } else if (!Array.isArray(assignedUserIds)) {
      assignedUserIds = [];
    }

    // Auto-assign to creator if no assignees
    const finalAssignees = assignedUserIds.length > 0 ? assignedUserIds : [(user as any).id];

    // Prepare task for creation with correct status
    const taskToCreate = {
      title: taskData.title,
      description: taskData.description || null,
      category: taskData.category,
      priority: taskData.priority || 'medium',
      due_date: taskData.due_date || null,
      is_urgent: taskData.is_urgent || false,
      is_draft: taskData.is_draft || false,
      links: taskData.links || [],
      document_ids: taskData.document_ids || [],
      project_id: taskData.project_id || null,
      created_by: (user as any).id,
      status: taskData.is_draft ? 'draft' : 'active', // Correct status values
      assigned_to: finalAssignees,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Create the task
    const { data: newTask, error: createError } = await supabase
      .from('tasks')
      .insert(taskToCreate)
      .select()
      .single();

    if (createError) {
      console.error('[API/tasks POST] Database error:', createError);
      return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
    }

    // Create calendar event if task has a due date
    if (newTask.due_date) {
      const isMedicalTask = newTask.category === 'medical';
      
      await supabase
        .from('calendar_events')
        .insert({
          title: isMedicalTask ? newTask.title : `Task: ${newTask.title}`,
          description: newTask.description || `${isMedicalTask ? 'Medical appointment' : 'Task deadline'} for: ${newTask.title}`,
          start_time: newTask.due_date,
          end_time: newTask.due_date,
          all_day: true,
          category: isMedicalTask ? 'medical' : 'work',
          source: isMedicalTask ? 'health' : 'tasks',
          source_reference: newTask.id,
          created_by: (user as any).id,
          attendees: finalAssignees
        });
    }

    // Log the activity
    await ActivityLogger.logTaskActivity(
      (user as any).id,
      'created',
      newTask,
      { assignedTo: finalAssignees }
    );

    // Fetch user details for response
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email')
      .in('id', [...new Set([(user as any).id, ...finalAssignees])]);

    const usersMap = (users || []).reduce((acc, u) => {
      acc[u.id] = u;
      return acc;
    }, {} as Record<string, any>);

    // Transform the response
    const transformedTask = {
      ...newTask,
      assigned_users: newTask.assigned_to?.map((id: string) => usersMap[id]).filter(Boolean) || [],
      created_by_user: usersMap[(user as any).id],
      comment_count: 0
    };

    return NextResponse.json({ task: transformedTask });
  } catch (error) {
    console.error('[API/tasks POST] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
