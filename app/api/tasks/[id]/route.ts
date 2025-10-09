import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ActivityLogger } from '@/lib/services/activity-logger';
import { resolvePersonReferences } from '@/app/api/_helpers/person-resolver';
import { enforceCSRF } from '@/lib/security/csrf';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: task, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ task });
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // All users can update tasks
    const body = await request.json();
    
    // Handle both old format (task, assignedUserIds) and new format (direct task object)
    const taskData = body.task || body;
    const assignedInput = body.assignedUserIds || body.assigned_to || taskData.assigned_to || [];

    // Normalize/resolve any incoming person references to family_member IDs
    let assignedUserIds: string[] = [];
    try {
      const resolved = await resolvePersonReferences(assignedInput);
      if (resolved) {
        assignedUserIds = Array.isArray(resolved) ? resolved : [resolved];
      }
    } catch {
      // Fallback to incoming values if resolver fails
      assignedUserIds = Array.isArray(assignedInput) ? assignedInput : [assignedInput];
    }

    // Get the original task for comparison
    const { data: originalTask } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    // Normalize category if present (e.g., 'J3 Academics' -> 'j3_academics')
    const normalizeCategory = (val: any) => {
      if (!val || typeof val !== 'string') return val;
      return val.trim().toLowerCase().replace(/\s+/g, '_');
    };
    if (taskData.category) {
      let catVal: any = taskData.category;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (typeof catVal === 'string' && uuidRegex.test(catVal)) {
        try {
          const { data: catRow } = await supabase
            .from('categories')
            .select('name')
            .eq('id', catVal)
            .single();
          if (catRow?.name) {
            catVal = catRow.name;
          }
        } catch {}
      }
      taskData.category = normalizeCategory(catVal);
    }

    // Update the task
    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update({
        ...taskData,
        assigned_to: assignedUserIds,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[Tasks Update API] Database error:', updateError);
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
    }

    // Fetch user details for the response
    const userIds = new Set<string>([user.id]);
    if (updatedTask.assigned_to && Array.isArray(updatedTask.assigned_to)) {
      updatedTask.assigned_to.forEach((id: string) => userIds.add(id));
    }
    if (updatedTask.created_by) userIds.add(updatedTask.created_by);

    const { data: users } = await supabase
      .from('users')
      .select('id, name, email')
      .in('id', Array.from(userIds));

    const usersMap = users?.reduce((acc, u) => {
      acc[u.id] = u;
      return acc;
    }, {} as Record<string, any>) || {};

    // Do not auto-create or update calendar events when tasks change.
    if (!updatedTask.due_date) {
      // Remove calendar event if due date was removed (from both sources)
      try {
        const { error: deleteError } = await supabase
          .from('calendar_events')
          .delete()
          .or(`source.eq.tasks,source.eq.health`)
          .eq('source_reference', id);

        if (deleteError) {
          console.error('[Tasks API] Failed to delete calendar event:', deleteError);
        }
      } catch (error) {
        console.error('[Tasks API] Error deleting calendar event:', error);
      }
    }

    // Log the activity
    const changes: Record<string, { from: any; to: any }> = {};
    if (originalTask) {
      if (originalTask.title !== updatedTask.title) changes.title = { from: originalTask.title, to: updatedTask.title };
      if (originalTask.status !== updatedTask.status) changes.status = { from: originalTask.status, to: updatedTask.status };
      if (originalTask.priority !== updatedTask.priority) changes.priority = { from: originalTask.priority, to: updatedTask.priority };
      if (originalTask.due_date !== updatedTask.due_date) changes.due_date = { from: originalTask.due_date, to: updatedTask.due_date };
      if (JSON.stringify(originalTask.assigned_to) !== JSON.stringify(updatedTask.assigned_to)) {
        changes.assigned_to = { 
          from: originalTask.assigned_to?.map((id: string) => usersMap[id]?.name || id), 
          to: updatedTask.assigned_to?.map((id: string) => usersMap[id]?.name || id) 
        };
      }
    }

    // Log special case for completion
    if (updatedTask.status === 'completed' && originalTask?.status !== 'completed') {
      // Archive any documents attached to this task that originated from tasks
      try {
        const docIds: string[] = (updatedTask as any)?.document_ids || [];
        if (docIds && docIds.length > 0) {
          const { error: archiveError } = await supabase
            .from('documents')
            .update({ is_archived: true })
            .in('id', docIds)
            .eq('source_page', 'tasks');
          if (archiveError) {
            console.warn('[Tasks Update API] Failed to archive related task documents:', archiveError);
          }
        }
      } catch (e) {
        console.warn('[Tasks Update API] Error attempting to archive related documents:', e);
      }
      await ActivityLogger.logTaskActivity(
        user.id,
        'completed',
        updatedTask
      );
    } else if (Object.keys(changes).length > 0) {
      await ActivityLogger.logTaskActivity(
        user.id,
        'updated',
        updatedTask,
        { changes }
      );
    }

    // Transform the response
    const transformedTask = {
      ...updatedTask,
      assigned_users: updatedTask.assigned_to?.map((id: string) => usersMap[id]).filter(Boolean) || [],
      created_by_user: updatedTask.created_by ? usersMap[updatedTask.created_by] : undefined
    };

    return NextResponse.json({ task: transformedTask });
  } catch (error) {
    console.error('[Tasks Update API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get task details before deletion for logging
    const { data: taskToDelete } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    // All users can delete tasks
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[Tasks Delete API] Database error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
    }

    // Also delete associated calendar events (both 'tasks' and 'health' sources)
    try {
      // Delete calendar events from both sources
      const { error: calendarDeleteError } = await supabase
        .from('calendar_events')
        .delete()
        .or(`source.eq.tasks,source.eq.health`)
        .eq('source_reference', id);

      if (calendarDeleteError) {
        console.error('[Tasks API] Failed to delete calendar event:', calendarDeleteError);
        // Don't fail the task deletion if calendar event deletion fails
      } else {
        console.log('[Tasks API] Successfully deleted associated calendar events for task:', id);
      }
    } catch (error) {
      console.error('[Tasks API] Error deleting calendar event:', error);
    }

    // Log the deletion
    if (taskToDelete) {
      await ActivityLogger.logTaskActivity(
        user.id,
        'deleted',
        taskToDelete
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Tasks Delete API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete task' },
      { status: 500 }
    );
  }
}
