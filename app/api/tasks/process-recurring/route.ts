import { NextResponse } from 'next/server';
import { RecurringTaskService } from '@/lib/services/recurring-tasks';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';

export async function POST() {
  try {
    // Verify user is authenticated and is admin
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }
    
    const { user } = authResult;
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    // Process recurring tasks
    const result = await RecurringTaskService.processRecurringTasks();
    
    return NextResponse.json({
      success: true,
      created: result.created,
      errors: result.errors,
      message: `Created ${result.created} recurring task instances`
    });
  } catch (error) {
    console.error('Error processing recurring tasks:', error);
    return NextResponse.json(
      { error: 'Failed to process recurring tasks' },
      { status: 500 }
    );
  }
}

// This could be called by a cron job
export async function GET() {
  // For cron jobs, we might want to use a different auth mechanism
  // For now, we'll use the same logic as POST
  return POST();
}