import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { is_pending } = await request.json();
    
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current task to check if it's already pending
    const { data: currentTask, error: fetchError } = await supabase
      .from('tasks')
      .select('pending_at')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[Tasks Pending API] Fetch error:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
    }

    // Toggle pending status
    const updateData = {
      pending_at: is_pending ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };

    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[Tasks Pending API] Database error:', updateError);
      return NextResponse.json({ error: 'Failed to update task pending status' }, { status: 500 });
    }

    // Log activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: user.id,
        action: is_pending ? 'task_marked_pending' : 'task_pending_cleared',
        entity_type: 'task',
        entity_id: id,
        details: {
          task_id: id,
          is_pending,
          pending_at: updateData.pending_at
        }
      });

    return NextResponse.json({ 
      success: true,
      task: {
        ...updatedTask,
        is_pending: !!updatedTask.pending_at
      }
    });
  } catch (error) {
    console.error('[Tasks Pending API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update task pending status' },
      { status: 500 }
    );
  }
}

// Keep POST for backward compatibility (redirects to PATCH)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Default to marking as pending when using POST
  const newRequest = new Request(request.url, {
    method: 'PATCH',
    headers: request.headers,
    body: JSON.stringify({ is_pending: true })
  });
  
  return PATCH(newRequest as NextRequest, { params });
}