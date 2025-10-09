import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PAGINATION } from '@/constants';
import { ActivityLogger } from '@/lib/services/activity-logger';
import { authenticateRequest } from '@/lib/utils/auth-middleware';
import { validateForm, validators } from '@/lib/utils/validation';
import { resolvePersonReferences, expandPersonReferences, resolveCurrentUserToFamilyMember } from '@/app/api/_helpers/person-resolver';
import { enforceCSRF } from '@/lib/security/csrf';

export async function GET(request: NextRequest) {
  try {
    // Use the new auth middleware
    const auth = await authenticateRequest(request, false, { skipCSRF: true });
    if (!auth.authenticated) {
      return auth.response!;
    }

    const supabase = await createClient();
    const userData = auth.user!;

    // Get pagination and filter parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(
      parseInt(searchParams.get('limit') || String(PAGINATION.DEFAULT_PAGE_SIZE), 10),
      PAGINATION.MAX_PAGE_SIZE
    );
    const offset = (page - 1) * limit;
    
    // Get filter parameters
    const category = searchParams.get('category');
    const priority = searchParams.get('priority');
    const status = searchParams.get('status');
    const assignedUser = searchParams.get('assigned_user'); // Keep for backward compatibility
    const selectedPerson = searchParams.get('selected_person'); // New unified filter
    const project = searchParams.get('project');
    const search = searchParams.get('search');
    const showFavorites = searchParams.get('show_favorites') === 'true';
    const showUrgent = searchParams.get('show_urgent') === 'true';
    const isPending = searchParams.get('is_pending');


    // Build query - using authenticated client
    // Note: The tasks table uses assigned_to array column for assignments
    let query = supabase
      .from('tasks')
      .select('*');
    
    // Apply filters
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    
    if (priority && priority !== 'all') {
      query = query.eq('priority', priority);
    }
    
    if (status) {
      // Support legacy UI value 'drafts' and new 'draft'
      if (status === 'active') {
        query = query.eq('status', 'active');
      } else if (status === 'drafts' || status === 'draft') {
        query = query.eq('status', 'draft');
      } else if (status === 'completed') {
        query = query.eq('status', 'completed');
      }
    }
    
    if (project && project !== 'all') {
      query = query.eq('project_id', project);
    }
    
    if (showFavorites) {
      query = query.eq('is_pinned', true);
    }
    
    if (showUrgent) {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      query = query.lte('due_date', threeDaysFromNow.toISOString());
    }
    
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }
    
    // Apply pending filter
    if (isPending === 'true') {
      query = query.not('pending_at', 'is', null);
    } else if (isPending === 'false') {
      query = query.is('pending_at', null);
    }
    
    // Apply person filtering with new unified approach
    // Use selected_person if available, otherwise fall back to assignedUser for backward compatibility
    const personFilter = selectedPerson || assignedUser;
    
    // Resolve current user's family_member.id for proper filtering
    const userFamilyMemberId = await resolveCurrentUserToFamilyMember(userData.id);
    
    // Build the default visibility filter parts for non-admin users
    const buildDefaultVisibilityParts = () => {
      const parts = [
        `created_by.eq.${userData.id}`
      ];
      // Prefer family member id; keep user.id as backward-compat fallback
      if (userFamilyMemberId) parts.push(`assigned_to.cs.{${userFamilyMemberId}}`);
      parts.push(`assigned_to.cs.{${userData.id}}`);
      return parts;
    };
    
    // Apply person filtering based on role and selection
    if (!personFilter || personFilter === 'all') {
      // No specific person selected - apply role-based defaults
      if (userData.role !== 'admin') {
        // Non-admin users see only their tasks by default
        const filterParts = buildDefaultVisibilityParts();
        const filterString = filterParts.join(',');
        query = query.or(filterString);
        
        // Defensive logging
        console.log('[API/tasks] Non-admin default filter applied:', {
          userId: userData.id,
          familyMemberId: userFamilyMemberId,
          filterString
        });
      }
      // Admins see everything by default (no filter needed)
      
    } else if (personFilter === 'me') {
      // User explicitly selected "me" - show only their tasks
      const filterParts = buildDefaultVisibilityParts();
      const filterString = filterParts.join(',');
      query = query.or(filterString);
      
      // Defensive logging
      console.log('[API/tasks] "me" filter applied:', {
        userId: userData.id,
        familyMemberId: userFamilyMemberId,
        filterString
      });
      
    } else {
      // Specific person selected - resolve to family_member ID
      const resolvedId = await resolvePersonReferences(personFilter);
      
      if (resolvedId) {
        // Valid person found - apply specific filter
        const familyMemberId = Array.isArray(resolvedId) ? resolvedId[0] : resolvedId;
        query = query.contains('assigned_to', [familyMemberId]);
        
        // Defensive logging
        console.log('[API/tasks] Specific person filter applied:', {
          selectedPerson: personFilter,
          resolvedTo: familyMemberId
        });
        
      } else {
        // Invalid person selection - fallback behavior
        console.warn('[API/tasks] Could not resolve person:', personFilter);
        
        if (userData.role !== 'admin') {
          // For non-admins, fallback to default visibility
          const filterParts = buildDefaultVisibilityParts();
          const filterString = filterParts.join(',');
          query = query.or(filterString);
          
          console.log('[API/tasks] Fallback to default visibility due to invalid person selection');
        }
        // For admins, show everything (no filter) when person is invalid
      }
    }
    
    
    // Apply sorting
    query = query
      .order('priority', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .range(offset, offset + limit - 1);
    
    // Execute query
    const { data: tasks, error: tasksError } = await query;

    // Get total count for pagination (separate query to avoid builder issues)
    let totalCount = 0;
    if (!tasksError && tasks) {
      // Build a count query with the same filters
      let countQuery = supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true });
      
      // Re-apply the same filters for count
      if (category && category !== 'all') {
        countQuery = countQuery.eq('category', category);
      }
      if (priority && priority !== 'all') {
        countQuery = countQuery.eq('priority', priority);
      }
      if (status) {
        if (status === 'active') {
          countQuery = countQuery.eq('status', 'active');
        } else if (status === 'drafts' || status === 'draft') {
          countQuery = countQuery.eq('status', 'draft');
        } else if (status === 'completed') {
          countQuery = countQuery.eq('status', 'completed');
        }
      }
      if (project && project !== 'all') {
        countQuery = countQuery.eq('project_id', project);
      }
      if (showFavorites) {
        countQuery = countQuery.eq('is_pinned', true);
      }
      if (showUrgent) {
        const threeDaysFromNow = new Date();
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
        countQuery = countQuery.lte('due_date', threeDaysFromNow.toISOString());
      }
      if (search) {
        countQuery = countQuery.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
      }
      
      // Apply the same person filter for count
      if (userData.role !== 'admin' && (!personFilter || personFilter === 'all')) {
        const parts = [] as string[];
        parts.push(`created_by.eq.${userData.id}`);
        if (userFamilyMemberId) parts.push(`assigned_to.cs.{${userFamilyMemberId}}`);
        parts.push(`assigned_to.cs.{${userData.id}}`);
        countQuery = countQuery.or(parts.join(','));
      } else if (personFilter && personFilter !== 'all') {
        // For specific person filters, we'd need to resolve them again
        // For now, use the task count we have
        totalCount = tasks.length;
      }
      
      if (!personFilter || personFilter === 'all' || userData.role === 'admin') {
        const { count } = await countQuery;
        totalCount = count || 0;
      }
    }

    // Get comment counts for all tasks
    let commentCounts: Record<string, number> = {};
    if (tasks && tasks.length > 0) {
      const taskIds = tasks.map(t => t.id);
      
      // Fetch comment counts for all tasks in batch
      const { data: comments } = await supabase
        .from('task_comments')
        .select('task_id')
        .in('task_id', taskIds)
        .eq('is_deleted', false);
      
      if (comments) {
        // Count comments per task
        comments.forEach(comment => {
          if (!commentCounts[comment.task_id]) {
            commentCounts[comment.task_id] = 0;
          }
          commentCounts[comment.task_id]++;
        });
      }
    }

    if (tasksError) {
      console.error('[Tasks API] Database error:', tasksError);
      return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }


    // Get all unique user IDs
    const userIds = new Set<string>();
    tasks?.forEach(task => {
      if (task.created_by) userIds.add(task.created_by);
      if (task.assigned_to && Array.isArray(task.assigned_to)) {
        task.assigned_to.forEach((id: string) => userIds.add(id));
      }
    });

    // Fetch user details
    let usersMap: Record<string, any> = {};
    if (userIds.size > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', Array.from(userIds));
      
      if (users) {
        usersMap = users.reduce((acc, user) => {
          acc[user.id] = user;
          return acc;
        }, {} as Record<string, any>);
      }
    }

    // Transform tasks to match expected format
    const transformedTasks = (tasks || []).map(task => ({
      ...task,
      assigned_users: task.assigned_to?.map((userId: string) => usersMap[userId]).filter(Boolean) || [],
      created_by_user: task.created_by ? usersMap[task.created_by] : undefined,
      comment_count: commentCounts[task.id] || 0,
      is_pending: !!task.pending_at
    }));
    
    // Use the tasks as-is since we already applied range in the query
    const paginatedTasks = transformedTasks;
    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({ 
      tasks: paginatedTasks,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages
      }
    });
  } catch (error) {

    console.error('[API/tasks] Error name:', (error as any).name);
    console.error('[API/tasks] Error message:', (error as any).message);
    console.error('[API/tasks] Error stack:', (error as any).stack);
    
    // Check if it's a database connection error
    if ((error as any).message?.includes('supabase') || (error as any).message?.includes('database')) {
      console.error('[API/tasks] Appears to be a database connection error');
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch tasks',
        details: (error as any).message || 'Unknown error',
        type: (error as any).name || 'Error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    // Use the new auth middleware
    const auth = await authenticateRequest(request, false, { skipCSRF: true });
    if (!auth.authenticated) {
      return auth.response!;
    }

    const supabase = await createClient();
    const user = auth.user!;

    // All users can create and assign tasks
    const body = await request.json();
    
    // Handle both old format (task, assignedUserIds) and new format (direct task object)
    const taskData = body.task || body;
    let assignedInput = body.assignedUserIds || body.assigned_to || [];

    // Resolve person references to UUIDs
    const resolvedAssignees = await resolvePersonReferences(assignedInput);
    let assignedUserIds: string[] = [];
    
    if (resolvedAssignees) {
      assignedUserIds = Array.isArray(resolvedAssignees) ? resolvedAssignees : [resolvedAssignees];
    }

    if (!taskData.title || !taskData.category) {
      return NextResponse.json(
        { error: 'Title and category are required' },
        { status: 400 }
      );
    }

    // Auto-assign to creator if no assignees specified
    const finalAssignees = assignedUserIds.length > 0 ? assignedUserIds : [user.id];

    // Normalize category to enum format (e.g., 'J3 Academics' -> 'j3_academics')
    const normalizeCategory = (val: any) => {
      if (!val || typeof val !== 'string') return val;
      return val.trim().toLowerCase().replace(/\s+/g, '_');
    };

    const normalizedCategory = normalizeCategory(taskData.category);

    // If category looks like a UUID, resolve to category name then normalize
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let finalCategory = normalizedCategory;
    if (typeof taskData.category === 'string' && uuidRegex.test(taskData.category)) {
      try {
        const { data: catRow } = await supabase
          .from('categories')
          .select('name')
          .eq('id', taskData.category)
          .single();
        if (catRow?.name) {
          finalCategory = normalizeCategory(catRow.name);
        }
      } catch {}
    }

    // Ensure we're using 'active' not 'pending'
    const taskToCreate = {
      title: taskData.title,
      description: taskData.description || null,
      category: finalCategory || normalizedCategory || taskData.category,
      priority: taskData.priority || 'medium',
      due_date: taskData.due_date || null,
      is_urgent: taskData.is_urgent || false,
      is_draft: taskData.is_draft || false,
      links: taskData.links || [],
      document_ids: taskData.document_ids || [],
      project_id: taskData.project_id || null,
      created_by: user.id,
      status: taskData.is_draft ? 'draft' : 'active',  // MUST be 'active' not 'pending'
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Ensure default assignee is the current user's family_member when none provided
    let defaultAssignee = user.id;
    try {
      const fmId = await resolveCurrentUserToFamilyMember(user.id);
      if (fmId) defaultAssignee = fmId;
    } catch {}

    // Create the task using authenticated client
    const { data: newTask, error: createError } = await supabase
      .from('tasks')
      .insert({
        ...taskToCreate,
        // prefer family member ids only going forward
        assigned_to: (finalAssignees && finalAssignees.length > 0 ? finalAssignees : [defaultAssignee])
      })
      .select()
      .single();

    if (createError) {
      console.error('[API/tasks POST] Database error:', createError);
      return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
    }

    // Fetch user details for the response
    const userIds = new Set<string>([user.id, ...finalAssignees]);
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email')
      .in('id', Array.from(userIds));

    const usersMap = users?.reduce((acc, u) => {
      acc[u.id] = u;
      return acc;
    }, {} as Record<string, any>) || {};

    // Do not auto-create calendar events from tasks.
    // Health page and Calendar should manage their own events independently.

    // Log the activity
    await ActivityLogger.logTaskActivity(
      user.id,
      'created',
      newTask,
      {
        assignedTo: finalAssignees.map((id: string) => usersMap[id]?.name || id)
      }
    );

    // Transform the response
    const transformedTask = {
      ...newTask,
      assigned_users: newTask.assigned_to?.map((id: string) => usersMap[id]).filter(Boolean) || [],
      created_by_user: usersMap[user.id]
    };

    return NextResponse.json({ task: transformedTask });
  } catch (error) {
    console.error('[API/tasks POST] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create task',
        details: (error as any).message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
