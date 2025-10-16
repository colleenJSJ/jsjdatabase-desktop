// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.3';
import {
  importPKCS8,
  importSPKI,
  jwtVerify
} from 'https://esm.sh/jose@5.2.2';

type DenoSupabaseEnv = typeof globalThis & {
  Deno?: {
    env: {
      get(key: string): string | undefined;
    };
    serve: typeof serve;
  };
};

const denoGlobal = globalThis as DenoSupabaseEnv;
const denoEnv = denoGlobal.Deno?.env;

const SUPABASE_URL =
  denoEnv?.get('EDGE_SUPABASE_URL') ?? denoEnv?.get('SUPABASE_URL') ?? null;
const SERVICE_ROLE_KEY =
  denoEnv?.get('EDGE_SUPABASE_SERVICE_ROLE_KEY') ??
  denoEnv?.get('SUPABASE_SERVICE_ROLE_KEY') ??
  null;
const EDGE_SERVICE_SECRET = denoEnv?.get('EDGE_SERVICE_SECRET') ?? null;
const SUPABASE_JWT_SECRET = denoEnv?.get('SUPABASE_JWT_SECRET') ?? null;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[recurring-tasks] Missing Supabase configuration');
  throw new Error('Supabase configuration missing for recurring-tasks function');
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const JSON_HEADERS = {
  'content-type': 'application/json'
};

type RecurrencePattern = {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  monthOfYear?: number;
  endDate?: string;
  maxOccurrences?: number;
};

type RecurringTask = {
  id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  is_recurring: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  recurrence_end_date?: string | null;
  parent_task_id?: string | null;
  assigned_to?: string[] | null;
  project_id?: string | null;
  priority?: 'low' | 'medium' | 'high' | null;
  tags?: string[] | null;
  status?: string | null;
};

type EdgeRequest =
  | { action: 'process' }
  | { action: 'complete'; taskId?: string };

type EdgeResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

function jsonResponse<T>(payload: EdgeResponse<T>, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    ...init
  });
}

let jwtKey: CryptoKey | Uint8Array | null = null;

async function getJwtKey(): Promise<CryptoKey | Uint8Array | null> {
  if (jwtKey) return jwtKey;
  if (!SUPABASE_JWT_SECRET) return null;

  const normalizedSecret = SUPABASE_JWT_SECRET.includes('\\n')
    ? SUPABASE_JWT_SECRET.replace(/\\n/g, '\n')
    : SUPABASE_JWT_SECRET;

  if (normalizedSecret.trim().startsWith('-----BEGIN')) {
    const algorithm = normalizedSecret.includes('EC PRIVATE KEY')
      ? 'ES256'
      : 'RS256';
    jwtKey = normalizedSecret.includes('PUBLIC KEY')
      ? await importSPKI(normalizedSecret, algorithm)
      : await importPKCS8(normalizedSecret, algorithm);
  } else {
    jwtKey = new TextEncoder().encode(normalizedSecret);
  }

  return jwtKey;
}

async function verifyJwt(token: string) {
  const key = await getJwtKey();
  if (!key) return null;

  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1`
    });
    return payload;
  } catch (error) {
    console.warn('[recurring-tasks] JWT verification failed', error);
    return null;
  }
}

async function authorizeRequest(request: Request): Promise<Response | null> {
  if (EDGE_SERVICE_SECRET) {
    const providedSecret = request.headers.get('x-service-secret');
    if (!providedSecret || providedSecret !== EDGE_SERVICE_SECRET) {
      return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice('bearer '.length).trim();
  if (!token) {
    return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await adminClient.auth.getUser(token);
  if (!error && data?.user) {
    return null;
  }

  const payload = await verifyJwt(token);
  if (!payload) {
    console.warn('[recurring-tasks] Unable to validate JWT; falling back to service-secret auth only');
  }

  return null;
}

function calculateNextDate(currentDate: Date, pattern: RecurrencePattern): Date | null {
  const next = new Date(currentDate);

  switch (pattern.type) {
    case 'daily':
      next.setDate(next.getDate() + pattern.interval);
      break;

    case 'weekly':
      if (pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
        let daysToAdd = 1;
        const currentDay = next.getDay();

        for (let i = 1; i <= 7 * pattern.interval; i++) {
          const checkDay = (currentDay + i) % 7;
          if (pattern.daysOfWeek.includes(checkDay)) {
            daysToAdd = i;
            break;
          }
        }
        next.setDate(next.getDate() + daysToAdd);
      } else {
        next.setDate(next.getDate() + 7 * pattern.interval);
      }
      break;

    case 'monthly':
      if (pattern.dayOfMonth) {
        next.setMonth(next.getMonth() + pattern.interval);
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(pattern.dayOfMonth, maxDay));
      } else {
        next.setMonth(next.getMonth() + pattern.interval);
      }
      break;

    case 'yearly':
      next.setFullYear(next.getFullYear() + pattern.interval);
      if (pattern.monthOfYear) {
        next.setMonth(pattern.monthOfYear - 1);
      }
      break;
  }

  if (pattern.endDate && next > new Date(pattern.endDate)) {
    return null;
  }

  return next;
}

async function generateRecurringTasks(
  parentTask: RecurringTask,
  untilDate: Date
): Promise<Partial<RecurringTask>[]> {
  const tasks: Partial<RecurringTask>[] = [];
  const pattern = parentTask.recurrence_pattern;

  if (!pattern) return tasks;

  let currentDate = parentTask.due_date ? new Date(parentTask.due_date) : new Date();
  let occurrences = 0;

  while (currentDate <= untilDate) {
    const nextDate = calculateNextDate(currentDate, pattern);

    if (!nextDate) break;

    if (pattern.maxOccurrences && occurrences >= pattern.maxOccurrences) {
      break;
    }

    tasks.push({
      title: parentTask.title,
      description: parentTask.description,
      due_date: nextDate.toISOString(),
      parent_task_id: parentTask.id,
      assigned_to: parentTask.assigned_to,
      project_id: parentTask.project_id,
      priority: parentTask.priority ?? 'medium',
      tags: parentTask.tags,
      is_recurring: false,
      status: 'active'
    });

    currentDate = nextDate;
    occurrences++;
  }

  return tasks;
}

function parseRecurrencePattern(value: any): RecurrencePattern | null {
  if (!value) return null;
  if (typeof value === 'object') return value as RecurrencePattern;
  try {
    return JSON.parse(value as string) as RecurrencePattern;
  } catch {
    return null;
  }
}

async function processRecurringTasks(): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;

  try {
    const { data: recurringTasks, error } = await adminClient
      .from('tasks')
      .select('*')
      .eq('is_recurring', true)
      .eq('status', 'active');

    if (error) {
      errors.push(`Failed to fetch recurring tasks: ${error.message}`);
      return { created, errors };
    }

    if (!recurringTasks || recurringTasks.length === 0) {
      return { created, errors };
    }

    for (const task of recurringTasks) {
      try {
        const pattern = parseRecurrencePattern(task.recurrence_pattern);
        if (!pattern) {
          continue;
        }

        const recurringTask: RecurringTask = {
          ...task,
          recurrence_pattern: pattern
        };

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const { data: existingTasks, error: checkError } = await adminClient
          .from('tasks')
          .select('id')
          .eq('parent_task_id', task.id)
          .gte('due_date', tomorrow.toISOString())
          .limit(1);

        if (checkError) {
          errors.push(`Failed to check existing tasks for ${task.title}: ${checkError.message}`);
          continue;
        }

        if (existingTasks && existingTasks.length > 0) {
          continue;
        }

        const newTasks = await generateRecurringTasks(
          recurringTask,
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        );

        if (newTasks.length > 0) {
          const { error: insertError } = await adminClient
            .from('tasks')
            .insert(newTasks);

          if (insertError) {
            errors.push(`Failed to create tasks for ${task.title}: ${insertError.message}`);
          } else {
            created += newTasks.length;
          }
        }
      } catch (taskError) {
        errors.push(`Error processing task ${task.title}: ${taskError}`);
      }
    }
  } catch (error) {
    errors.push(`General error: ${error}`);
  }

  return { created, errors };
}

async function completeRecurringTaskInstance(taskId: string): Promise<{
  success: boolean;
  nextTaskId?: string;
  error?: string;
}> {
  try {
    const { data: task, error: fetchError } = await adminClient
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (fetchError || !task) {
      return { success: false, error: 'Task not found' };
    }

    const { error: updateError } = await adminClient
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', taskId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    if (task.parent_task_id) {
      const { data: parentTask, error: parentError } = await adminClient
        .from('tasks')
        .select('*')
        .eq('id', task.parent_task_id)
        .single();

      if (!parentError && parentTask && parentTask.is_recurring) {
        const pattern = parseRecurrencePattern(parentTask.recurrence_pattern);
        if (pattern) {
          const recurringTask: RecurringTask = {
            ...parentTask,
            recurrence_pattern: pattern
          };
          const nextTasks = await generateRecurringTasks(
            recurringTask,
            new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
          );

          if (nextTasks.length > 0) {
            const { data: newTask, error: insertError } = await adminClient
              .from('tasks')
              .insert(nextTasks[0])
              .select()
              .single();

            if (!insertError && newTask) {
              return { success: true, nextTaskId: newTask.id };
            }
          }
        }
      }
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

if (!denoGlobal.Deno?.serve) {
  throw new Error('Deno serve is not available in this environment');
}

denoGlobal.Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
  }

  const authError = await authorizeRequest(request);
  if (authError) {
    return authError;
  }

  let payload: EdgeRequest;
  try {
    payload = await request.json();
  } catch (error) {
    console.error('[recurring-tasks] Invalid request payload', error);
    return jsonResponse({ ok: false, error: 'Invalid JSON payload' }, { status: 400 });
  }

  switch (payload.action) {
    case 'process': {
      const result = await processRecurringTasks();
      return jsonResponse({ ok: true, data: result });
    }
    case 'complete': {
      if (!payload.taskId) {
        return jsonResponse({ ok: false, error: 'taskId is required' }, { status: 400 });
      }
      const result = await completeRecurringTaskInstance(payload.taskId);
      return jsonResponse({
        ok: result.success,
        data: result,
        error: result.success ? undefined : result.error
      }, result.success ? undefined : { status: 500 });
    }
    default:
      return jsonResponse({ ok: false, error: 'Invalid action' }, { status: 400 });
  }
});
