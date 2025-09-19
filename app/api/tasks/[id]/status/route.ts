import { NextRequest, NextResponse } from 'next/server';
import { TasksService } from '@/lib/tasks/tasks-service';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { status } = await request.json();
    await TasksService.updateTaskStatus(id, status, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update task status' }, { status: 500 });
  }
}
