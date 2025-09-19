import { ActivityLogger } from '@/lib/services/activity-logger';

export async function logRlsDenied(params: {
  userId: string;
  error: any;
  endpoint: string;
  entityType?: string;
  entityId?: string;
  page?: string;
}) {
  try {
    const msg = String(params.error?.message || '').toLowerCase();
    const hint = String(params.error?.hint || '').toLowerCase();
    const code = String(params.error?.code || '');
    const looksLikeRls =
      msg.includes('row-level security') ||
      msg.includes('rls') ||
      hint.includes('row-level security');

    if (!looksLikeRls) return;

    await ActivityLogger.log({
      userId: params.userId,
      action: 'rls_denied',
      entityType: params.entityType || 'security',
      entityId: params.entityId,
      page: params.page || 'api',
      details: {
        errorMessage: params.error?.message,
        changes: { endpoint: { from: null, to: params.endpoint } },
      },
    });
  } catch {}
}

