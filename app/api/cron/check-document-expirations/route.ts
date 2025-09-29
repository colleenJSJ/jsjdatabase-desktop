import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request (add your own security here)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServiceClient();
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Find documents expiring within 30 days that don't have tasks created yet
    const { data: expiringDocs, error: docsError } = await supabase
      .from('documents')
      .select('*')
      .lte('expiration_date', thirtyDaysFromNow.toISOString())
      .gte('expiration_date', now.toISOString())
      .eq('is_archived', false);

    if (docsError) {
      console.error('Error fetching expiring documents:', docsError);
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
    }

    const tasksCreated = [];

    for (const doc of expiringDocs || []) {
      // Check if a task already exists for this document
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('id')
        .eq('source_id', doc.id)
        .eq('source_page', 'documents')
        .single();

      if (!existingTask) {
        // Create a renewal task
        const { data: newTask, error: taskError } = await supabase
          .from('tasks')
          .insert({
            title: `Renew ${doc.title}`,
            description: `Document "${doc.title}" expires on ${new Date(doc.expiration_date).toLocaleDateString()}. Please renew or update.`,
            category: 'administrative',
            priority: 'high',
            due_date: doc.expiration_date,
            created_by: doc.uploaded_by,
            status: 'pending',
            source_page: 'documents',
            source_id: doc.id,
            document_ids: [doc.id]
          })
          .select()
          .single();

        if (taskError) {
          console.error('Error creating task for document:', doc.id, taskError);
        } else {
          // Assign the task to the same people as the document
          if (doc.assigned_to && doc.assigned_to.length > 0) {
            const assignments = doc.assigned_to.map((userId: string) => ({
              task_id: newTask.id,
              user_id: userId,
              assigned_by: doc.uploaded_by
            }));

            await supabase
              .from('task_assignments')
              .insert(assignments);
          }

          tasksCreated.push(newTask);
        }
      }
    }

    return NextResponse.json({
      message: 'Document expiration check completed',
      documentsChecked: expiringDocs?.length || 0,
      tasksCreated: tasksCreated.length,
      tasks: tasksCreated
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// This endpoint can be called by:
// 1. A cron service like Vercel Cron or Railway Cron
// 2. An external service like EasyCron or Cron-job.org
// 3. A GitHub Action on a schedule
// 
// Example cron expression: 0 9 * * * (daily at 9 AM)
//
// Set CRON_SECRET in your environment variables for security