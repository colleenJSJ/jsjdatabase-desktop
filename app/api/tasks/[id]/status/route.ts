import { NextRequest } from 'next/server';
import { TasksService } from '@/lib/tasks/tasks-service';
import { requireUser } from '@/app/api/_helpers/auth';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';
import type { TaskStatus } from '@/lib/supabase/types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) return authResult;

    const { user } = authResult;
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request payload', { status: 400 });
    }
    const status = body?.status as TaskStatus | undefined;

    const allowedStatuses: TaskStatus[] = [
      'pending',
      'in_progress',
      'completed',
      'active',
      'draft',
      'archived',
      'cancelled',
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return jsonError('Invalid status value', { status: 400 });
    }

    await TasksService.updateTaskStatus(id, status, user.id);
    const payload = { taskId: id, status };
    return jsonSuccess(payload, { legacy: { success: true } });
  } catch (error) {
    console.error('[Task Status] Failed to update task status', error);
    return jsonError('Failed to update task status', {
      status: 500,
      meta: {
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}
