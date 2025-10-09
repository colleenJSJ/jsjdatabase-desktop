import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceCSRF } from '@/lib/security/csrf';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch comments for the task with user info
    const { data: comments, error } = await supabase
      .from('task_comments')
      .select(`
        id,
        task_id,
        user_id,
        comment,
        created_at,
        is_deleted,
        parent_comment_id
      `)
      .eq('task_id', resolvedParams.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    
    if (!error && comments) {
      // Fetch user info for each comment
      const userIds = [...new Set(comments.map(c => c.user_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', userIds);
      
      // Map user info to comments
      const usersMap = new Map(users?.map(u => [u.id, u]) || []);
      const commentsWithUsers = comments.map(comment => ({
        ...comment,
        users: usersMap.get(comment.user_id) || null
      }));
      
      return NextResponse.json({ comments: commentsWithUsers });
    }

    if (error) {
      console.error('Error fetching task comments:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ comments: comments || [] });
  } catch (error) {
    console.error('Error in GET /api/tasks/[id]/comments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const resolvedParams = await params;
    const supabase = await createClient();
    const body = await request.json();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { comment, parent_comment_id } = body;

    if (!comment || comment.trim() === '') {
      return NextResponse.json({ error: 'Comment is required' }, { status: 400 });
    }

    // Check if user has access to the task
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, created_by, assigned_to')
      .eq('id', resolvedParams.id)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Check if user is assigned to the task via legacy table
    const { data: assignment } = await supabase
      .from('task_assignments')
      .select('id')
      .eq('task_id', resolvedParams.id)
      .eq('user_id', user.id)
      .single();

    // Also check array membership on tasks.assigned_to for current user or mapped family member
    let inAssignedArray = false;
    try {
      const { resolveCurrentUserToFamilyMember } = await import('@/app/api/_helpers/person-resolver');
      const fmId = await resolveCurrentUserToFamilyMember(user.id);
      const assigned = Array.isArray((task as any).assigned_to) ? (task as any).assigned_to.map(String) : [];
      inAssignedArray = assigned.includes(String(user.id)) || (fmId ? assigned.includes(String(fmId)) : false);
    } catch {}

    // Check permissions
    const isAdmin = (user as any).user_metadata?.role === 'admin';
    const hasAccess = task.created_by === user.id || assignment !== null || inAssignedArray || isAdmin;

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Create comment
    const { data: newComment, error: commentError } = await supabase
      .from('task_comments')
      .insert({
        task_id: resolvedParams.id,
        user_id: user.id,
        comment: comment.trim(),
        parent_comment_id: parent_comment_id || null
      })
      .select()
      .single();
    
    if (!commentError && newComment) {
      // Log activity for comment creation
      await supabase
        .from('activity_logs')
        .insert({
          user_id: user.id,
          action: 'task_comment_added',
          entity_type: 'task',
          entity_id: resolvedParams.id,
          metadata: {
            task_id: resolvedParams.id,
            comment_id: newComment.id,
            comment_preview: comment.trim().substring(0, 100) // First 100 chars for preview
          }
        });

      // Fetch task title for better activity log display
      const { data: taskData } = await supabase
        .from('tasks')
        .select('title')
        .eq('id', resolvedParams.id)
        .single();

      if (taskData) {
        // Update activity log with task title
        await supabase
          .from('activity_logs')
          .update({
            metadata: {
              task_id: resolvedParams.id,
              task_title: taskData.title,
              comment_id: newComment.id,
              comment_preview: comment.trim().substring(0, 100)
            }
          })
          .eq('entity_id', resolvedParams.id)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);
      }

      // Fetch user info
      const { data: userData } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('id', user.id)
        .single();
      
      return NextResponse.json({ 
        comment: {
          ...newComment,
          users: userData || null
        }
      });
    }

    if (commentError) {
      console.error('Error creating comment:', commentError);
      return NextResponse.json({ error: commentError.message }, { status: 500 });
    }

    return NextResponse.json({ comment: newComment });
  } catch (error) {
    console.error('Error in POST /api/tasks/[id]/comments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Soft delete a comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const commentId = searchParams.get('commentId');
    
    if (!commentId) {
      return NextResponse.json({ error: 'Comment ID is required' }, { status: 400 });
    }
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Update comment to soft delete (only owner can delete)
    const { error } = await supabase
      .from('task_comments')
      .update({ is_deleted: true })
      .eq('id', commentId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting comment:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/tasks/[id]/comments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
