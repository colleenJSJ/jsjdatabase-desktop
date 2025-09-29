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

    console.log('[Tasks Complete API] Marking task as completed:', id);
    
    // First, try a minimal update to just change the status
    const { data: minimalData, error: minimalError } = await supabase
      .from('tasks')
      .update({
        status: 'completed'
      })
      .eq('id', id)
      .select();

    if (!minimalError) {
      console.log('[Tasks Complete API] Minimal update successful, now updating additional fields');
      
      // If minimal update works, try updating other fields separately
      const { data, error: fullError } = await supabase
        .from('tasks')
        .update({
          completed_at: new Date().toISOString(),
          completed_by: user.id
        })
        .eq('id', id)
        .select();
        
      if (fullError) {
        console.warn('[Tasks Complete API] Could not update completion metadata:', fullError);
      }
      
      // After completion, archive any documents attached to this task that originated from tasks
      try {
        const { data: taskRow } = await supabase
          .from('tasks')
          .select('id, document_ids')
          .eq('id', id)
          .single();

        const docIds: string[] = (taskRow as any)?.document_ids || [];
        if (docIds && docIds.length > 0) {
          const { error: archiveError } = await supabase
            .from('documents')
            .update({ is_archived: true })
            .in('id', docIds)
            .eq('source_page', 'tasks');
          if (archiveError) {
            console.warn('[Tasks Complete API] Failed to archive related task documents:', archiveError);
          } else {
            console.log('[Tasks Complete API] Archived related task documents:', docIds.length);
          }
        }
      } catch (e) {
        console.warn('[Tasks Complete API] Error attempting to archive related documents:', e);
      }

      console.log('[Tasks Complete API] Task marked as completed');
      return NextResponse.json({ success: true, task: minimalData?.[0] });
    }

    // If minimal update fails, log the error
    console.error('[Tasks Complete API] Database error:', minimalError);
    return NextResponse.json({ error: 'Failed to complete task' }, { status: 500 });
  } catch (error) {

    return NextResponse.json(
      { error: 'Failed to complete task' },
      { status: 500 }
    );
  }
}
