import { createServiceClient } from '@/lib/supabase/server';

interface LogActivityParams {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  page?: string;
  details?: Record<string, any>;
  request?: Request;
}

/**
 * Simple activity logger for all API endpoints
 * This ensures all actions are tracked consistently
 */
export async function logActivity({
  userId,
  action,
  entityType,
  entityId = null,
  entityName = null,
  page,
  details = {},
  request
}: LogActivityParams) {
  try {
    const supabase = await createServiceClient();
    
    // Extract IP and user agent from request if provided
    let ipAddress: string | null = null;
    let userAgent: string | null = null;
    
    if (request) {
      // Get IP from headers
      ipAddress = request.headers.get('x-forwarded-for') || 
                  request.headers.get('x-real-ip') || 
                  null;
      userAgent = request.headers.get('user-agent') || null;
    }
    
    // Insert activity log
    const { error } = await supabase
      .from('activity_logs')
      .insert({
        user_id: userId,
        action: action.toLowerCase(),
        entity_type: entityType.toLowerCase(),
        entity_id: entityId,
        entity_name: entityName,
        page: page,
        details: details,
        ip_address: ipAddress,
        user_agent: userAgent,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('[Activity Logger] Failed to log activity:', error);
    }
  } catch (error) {
    console.error('[Activity Logger] Error:', error);
    // Don't throw - we don't want logging failures to break the app
  }
}

/**
 * Helper function to log common CRUD operations
 */
export async function logCRUDActivity(
  userId: string,
  operation: 'create' | 'read' | 'update' | 'delete',
  entityType: string,
  entity: any,
  request?: Request
) {
  const actionMap = {
    'create': 'created',
    'read': 'viewed',
    'update': 'updated',
    'delete': 'deleted'
  };

  await logActivity({
    userId,
    action: actionMap[operation],
    entityType,
    entityId: entity?.id || null,
    entityName: entity?.name || entity?.title || entity?.email || null,
    page: entityType + 's',
    details: {
      // Include some basic entity info
      ...operation === 'create' ? { created: entity } : {},
      ...operation === 'update' ? { updated_fields: Object.keys(entity) } : {},
      ...operation === 'delete' ? { deleted: entity } : {}
    },
    request
  });
}

/**
 * Log authentication-related activities
 */
export async function logAuthActivity(
  userId: string,
  action: 'login' | 'logout' | 'password_changed' | 'settings_updated',
  details?: Record<string, any>,
  request?: Request
) {
  await logActivity({
    userId,
    action,
    entityType: 'auth',
    page: 'auth',
    details,
    request
  });
}

/**
 * Log bulk operations
 */
export async function logBulkActivity(
  userId: string,
  action: string,
  entityType: string,
  count: number,
  details?: Record<string, any>,
  request?: Request
) {
  await logActivity({
    userId,
    action: `bulk_${action}`,
    entityType,
    entityName: `${count} ${entityType}s`,
    page: entityType + 's',
    details: {
      count,
      ...details
    },
    request
  });
}
