import { ActivityLogger } from '@/lib/services/activity-logger';

export async function logRlsDenied(params: {
  userId: string;
  error: unknown;
  endpoint: string;
  entityType?: string;
  entityId?: string;
  page?: string;
}) {
  try {
    const errorRecord =
      params.error && typeof params.error === 'object'
        ? (params.error as Record<string, unknown>)
        : {};

    const rawMessage = errorRecord.message;
    const rawHint = errorRecord.hint;
    const message = typeof rawMessage === 'string' ? rawMessage : '';
    const hintValue = typeof rawHint === 'string' ? rawHint : '';

    const msg = message.toLowerCase();
    const hint = hintValue.toLowerCase();
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
        errorMessage: message || undefined,
        changes: { endpoint: { from: null, to: params.endpoint } },
      },
    });
  } catch {}
}
