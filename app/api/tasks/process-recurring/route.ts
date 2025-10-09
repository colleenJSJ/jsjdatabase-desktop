import { NextRequest } from 'next/server';
import { RecurringTaskService } from '@/lib/services/recurring-tasks';
import { requireUser } from '@/app/api/_helpers/auth';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

async function processRecurringTasks(request: NextRequest) {
  try {
    const authResult = await requireUser(request, { enforceCsrf: false, role: 'admin' });
    if (authResult instanceof Response) {
      return authResult;
    }

    const result = await RecurringTaskService.processRecurringTasks();
    const payload = {
      created: result.created,
      errors: result.errors,
      message: `Created ${result.created} recurring task instances`,
    };

    return jsonSuccess(payload, { legacy: payload });
  } catch (error) {
    console.error('[Recurring Tasks] Failed to process tasks', error);
    return jsonError('Failed to process recurring tasks', {
      status: 500,
      meta: {
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;
  return processRecurringTasks(request);
}

// This could be called by a cron job
export async function GET(request: NextRequest) {
  return processRecurringTasks(request);
}
