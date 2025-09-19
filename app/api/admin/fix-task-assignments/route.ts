import { createServiceClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {

  try {
    const supabase = await createServiceClient();
    
    // First, check for any tasks with invalid assigned_to values
    const { data: allTasks, error: fetchError } = await supabase
      .from('tasks')
      .select('id, title, assigned_to')
      .not('assigned_to', 'is', null);
    
    if (fetchError) {

      return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }
    
    const invalidTasks = [];
    const susanUUID = '6f0ddcb5-fff8-4c35-aacb-ef60f575cf0c';
    
    // Check each task for invalid assignments
    for (const task of allTasks || []) {
      if (task.assigned_to && Array.isArray(task.assigned_to)) {
        const hasInvalid = task.assigned_to.some((id: any) => {
          // Check if it's not a valid UUID format
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          return typeof id !== 'string' || !uuidRegex.test(id) || id.toLowerCase() === 'susan';
        });
        
        if (hasInvalid) {
          invalidTasks.push({
            id: task.id,
            title: task.title,
            assigned_to: task.assigned_to,
            invalid_values: task.assigned_to.filter((id: any) => {
              const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              return typeof id !== 'string' || !uuidRegex.test(id) || id.toLowerCase() === 'susan';
            })
          });
        }
      }
    }

    return NextResponse.json({ 
      totalTasks: allTasks?.length || 0,
      invalidTasks,
      message: `Found ${invalidTasks.length} tasks with invalid assignments`
    });
  } catch (error) {

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {

  try {
    const supabase = await createServiceClient();
    const susanUUID = '6f0ddcb5-fff8-4c35-aacb-ef60f575cf0c';
    
    // First, get all tasks with assigned_to
    const { data: allTasks, error: fetchError } = await supabase
      .from('tasks')
      .select('id, title, assigned_to')
      .not('assigned_to', 'is', null);
    
    if (fetchError) {

      return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }
    
    const fixed = [];
    const errors = [];
    
    // Fix each task with invalid assignments
    for (const task of allTasks || []) {
      if (task.assigned_to && Array.isArray(task.assigned_to)) {
        let needsFix = false;
        const fixedAssignments = task.assigned_to.map((id: any) => {
          // If it's "susan" (case insensitive), replace with Susan's UUID
          if (typeof id === 'string' && id.toLowerCase() === 'susan') {
            needsFix = true;
            return susanUUID;
          }
          // If it's not a valid UUID, remove it
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (typeof id !== 'string' || !uuidRegex.test(id)) {
            needsFix = true;
            return null;
          }
          return id;
        }).filter(Boolean); // Remove null values
        
        if (needsFix) {

          const { error: updateError } = await supabase
            .from('tasks')
            .update({ 
              assigned_to: fixedAssignments.length > 0 ? fixedAssignments : null,
              updated_at: new Date().toISOString()
            })
            .eq('id', task.id);
          
          if (updateError) {
            console.error(`[Fix Task Assignments API] Error updating task ${task.id}:`, updateError);
            errors.push({ taskId: task.id, error: updateError.message });
          } else {
            fixed.push({
              id: task.id,
              title: task.title,
              oldAssignments: task.assigned_to,
              newAssignments: fixedAssignments
            });
          }
        }
      }
    }

    return NextResponse.json({ 
      message: `Fixed ${fixed.length} tasks`,
      fixed,
      errors,
      totalChecked: allTasks?.length || 0
    });
  } catch (error) {

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}