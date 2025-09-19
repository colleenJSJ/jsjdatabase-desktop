import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Tasks Undo Complete API] Marking task as active:', id);
    
    // Update task back to active
    const { data, error: updateError } = await supabase
      .from('tasks')
      .update({
        status: 'active',
        completed_at: null,
        completed_by: null,
        updated_at: new Date().toISOString(),
        updated_by: user.id
      })
      .eq('id', id)
      .select();

    if (updateError) {
      console.error('[Tasks Undo Complete API] Database error:', updateError);
      return NextResponse.json({ error: 'Failed to undo task completion' }, { status: 500 });
    }

    console.log('[Tasks Undo Complete API] Task updated successfully:', data);
    return NextResponse.json({ success: true, task: data?.[0] });
  } catch (error) {
    console.error('[Tasks Undo Complete API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to undo task completion' },
      { status: 500 }
    );
  }
}