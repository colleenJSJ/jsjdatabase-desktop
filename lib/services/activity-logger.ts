import { createServiceClient } from '@/lib/supabase/server';
import { getEncryptionSessionToken } from '@/lib/encryption/context';

const PROJECT_REF = (() => {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EDGE_SUPABASE_URL;
  if (!url) return null;
  try {
    const host = new URL(url).host;
    const match = host.match(/^([^.]+)\.supabase\.co$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
})();

const ACTIVITY_FUNCTION_NAME = 'activity-log';
const ACTIVITY_SERVICE_SECRET = process.env.EDGE_SERVICE_SECRET || '';
const ACTIVITY_FUNCTION_URL = PROJECT_REF
  ? `https://${PROJECT_REF}.functions.supabase.co/${ACTIVITY_FUNCTION_NAME}`
  : null;

type ActivityLogPayload = {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  page?: string | null;
  details?: ActivityLogDetails | Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

async function invokeEdgeLogger(payload: ActivityLogPayload) {
  if (!ACTIVITY_SERVICE_SECRET) {
    throw new Error('EDGE_SERVICE_SECRET is required for activity logging');
  }

  if (!ACTIVITY_FUNCTION_URL) {
    throw new Error('Activity log function URL could not be determined');
  }

  const sessionToken = getEncryptionSessionToken();
  if (!sessionToken) {
    throw new Error('Supabase session token is required for activity logging');
  }

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.EDGE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  const edgeHeaders = {
    Authorization: `Bearer ${sessionToken}`,
    ...(anonKey ? { apikey: anonKey } : {})
  };
  const response = await fetch(ACTIVITY_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...edgeHeaders,
      'x-service-secret': ACTIVITY_SERVICE_SECRET,
      'x-client-info': 'activity-logger/1.0'
    },
    body: JSON.stringify(payload)
  });

  let result: { ok?: boolean; error?: string } | null = null;
  try {
    result = await response.json();
  } catch {
    // ignore parse errors; we'll surface a generic failure below
  }

  if (!response.ok || !result?.ok) {
    const message =
      result?.error ||
      `Edge function ${ACTIVITY_FUNCTION_NAME} returned ${response.status}`;
    throw new Error(message);
  }
}

function shouldUseEdgeLogger(): boolean {
  return Boolean(
    ACTIVITY_SERVICE_SECRET &&
    ACTIVITY_FUNCTION_URL &&
    getEncryptionSessionToken()
  );
}

export interface ActivityLogDetails {
  // Common fields
  previousValue?: any;
  newValue?: any;
  changes?: Record<string, { from: any; to: any }>;
  
  // Task specific
  taskTitle?: string;
  taskStatus?: string;
  taskPriority?: string;
  taskDueDate?: string;
  assignedTo?: string[];
  
  // Document specific
  documentTitle?: string;
  documentCategory?: string;
  fileSize?: number;
  fileType?: string;
  
  // Calendar event specific
  eventTitle?: string;
  eventDate?: string;
  eventLocation?: string;
  eventAttendees?: string[];
  
  // Travel specific
  tripDestination?: string;
  tripDates?: { start: string; end: string };
  travelers?: string[];
  
  // Password specific
  passwordTitle?: string;
  passwordCategory?: string;
  passwordStrength?: 'weak' | 'medium' | 'strong';
  
  // Contact specific
  contactName?: string;
  contactCompany?: string;
  contactCategory?: string;
  
  // Pet specific
  petName?: string;
  petType?: string;
  
  // Household specific
  propertyName?: string;
  inventoryItem?: string;
  
  // Generic fields
  entityName?: string;
  itemCount?: number;
  searchQuery?: string;
  filterCriteria?: Record<string, any>;
  errorMessage?: string;
  duration?: number;
  ipAddress?: string;
  userAgent?: string;
  portal_id?: string;
  password_id?: string;
  provider_type?: string;
  owner_id?: string;
  shared_with_count?: number;
}

export class ActivityLogger {
  /**
   * Log an activity with detailed context
   */
  static async log(
    params: {
      userId: string;
      action: string;
      entityType: string;
      entityId?: string | null;
      entityName?: string | null;
      page?: string;
      details?: ActivityLogDetails;
      ipAddress?: string;
      userAgent?: string;
    }
  ) {
    const payload: ActivityLogPayload = {
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      entityName: params.entityName ?? null,
      page: params.page ?? null,
      details: params.details ?? {},
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null
    };

    if (shouldUseEdgeLogger()) {
      try {
        await invokeEdgeLogger(payload);
        return;
      } catch (error) {
        console.warn('[ActivityLogger] Edge invocation failed, falling back to service client:', error);
      }
    }

    const supabase = await createServiceClient();

    try {
      const { error } = await supabase.from('activity_logs').insert({
        user_id: payload.userId,
        action: payload.action,
        entity_type: payload.entityType,
        entity_id: payload.entityId || null,
        entity_name: payload.entityName || null,
        page: payload.page || null,
        details: payload.details || {},
        ip_address: payload.ipAddress || null,
        user_agent: payload.userAgent || null,
        created_at: new Date().toISOString()
      });

      if (error) {
        console.error('Failed to log activity:', error);
      }
    } catch (error) {
      console.error('Error in ActivityLogger fallback:', error);
    }
  }

  /**
   * Helper method to generate detailed change descriptions
   */
  static generateChangeDescription(action: string, entityType: string, details?: ActivityLogDetails): string {
    let description = '';
    
    switch (action) {
      case 'created':
        switch (entityType) {
          case 'task':
            description = `Created task "${details?.taskTitle}"`;
            if (details?.taskDueDate) {
              description += ` due ${new Date(details.taskDueDate).toLocaleDateString()}`;
            }
            if (details?.assignedTo?.length) {
              description += ` assigned to ${details.assignedTo.join(', ')}`;
            }
            break;
          case 'document':
            description = `Uploaded document "${details?.documentTitle}"`;
            if (details?.documentCategory) {
              description += ` in ${details.documentCategory}`;
            }
            if (details?.fileSize) {
              description += ` (${formatFileSize(details.fileSize)})`;
            }
            break;
          case 'event':
            description = `Created event "${details?.eventTitle}"`;
            if (details?.eventDate) {
              description += ` on ${new Date(details.eventDate).toLocaleDateString()}`;
            }
            if (details?.eventLocation) {
              description += ` at ${details.eventLocation}`;
            }
            break;
          case 'trip':
            description = `Created trip to ${details?.tripDestination}`;
            if (details?.tripDates) {
              description += ` from ${new Date(details.tripDates.start).toLocaleDateString()} to ${new Date(details.tripDates.end).toLocaleDateString()}`;
            }
            break;
          case 'contact':
            description = `Added contact "${details?.contactName}"`;
            if (details?.contactCompany) {
              description += ` from ${details.contactCompany}`;
            }
            break;
          default:
            description = `Created ${entityType}`;
        }
        break;
        
      case 'updated':
        description = `Updated ${entityType}`;
        if (details?.entityName) {
          description = `Updated "${details.entityName}"`;
        }
        if (details?.changes) {
          const changedFields = Object.keys(details.changes);
          if (changedFields.length > 0) {
            description += `: ${changedFields.join(', ')}`;
          }
        }
        break;
        
      case 'deleted':
        description = `Deleted ${entityType}`;
        if (details?.entityName) {
          description = `Deleted "${details.entityName}"`;
        }
        if (details?.itemCount && details.itemCount > 1) {
          description = `Deleted ${details.itemCount} ${entityType}s`;
        }
        break;
        
      case 'completed':
        if (entityType === 'task') {
          description = `Completed task "${details?.taskTitle}"`;
        } else {
          description = `Completed ${entityType}`;
        }
        break;
        
      case 'viewed':
        description = `Viewed ${entityType}`;
        if (details?.entityName) {
          description = `Viewed "${details.entityName}"`;
        }
        break;
        
      case 'exported':
        description = `Exported ${details?.itemCount || 'all'} ${entityType}s`;
        if (details?.filterCriteria) {
          const filters = Object.entries(details.filterCriteria)
            .filter(([_, value]) => value)
            .map(([key, value]) => `${key}: ${value}`);
          if (filters.length > 0) {
            description += ` with filters: ${filters.join(', ')}`;
          }
        }
        break;
        
      case 'searched':
        description = `Searched ${entityType}`;
        if (details?.searchQuery) {
          description += ` for "${details.searchQuery}"`;
        }
        break;
        
      default:
        description = `${action} ${entityType}`;
    }
    
    return description;
  }

  /**
   * Log task-related activities
   */
  static async logTaskActivity(
    userId: string,
    action: string,
    task: any,
    details?: Partial<ActivityLogDetails>
  ) {
    await this.log({
      userId,
      action,
      entityType: 'task',
      entityId: task.id,
      entityName: task.title,
      page: 'tasks',
      details: {
        taskTitle: task.title,
        taskStatus: task.status,
        taskPriority: task.priority,
        taskDueDate: task.due_date,
        assignedTo: task.assigned_to,
        ...details
      }
    });
  }

  /**
   * Log document-related activities
   */
  static async logDocumentActivity(
    userId: string,
    action: string,
    document: any,
    details?: Partial<ActivityLogDetails>
  ) {
    await this.log({
      userId,
      action,
      entityType: 'document',
      entityId: document.id,
      entityName: document.title || document.name,
      page: 'documents',
      details: {
        documentTitle: document.title || document.name,
        documentCategory: document.category,
        fileSize: document.file_size,
        fileType: document.file_type,
        ...details
      }
    });
  }

  /**
   * Log calendar event activities
   */
  static async logEventActivity(
    userId: string,
    action: string,
    event: any,
    details?: Partial<ActivityLogDetails>
  ) {
    await this.log({
      userId,
      action,
      entityType: 'event',
      entityId: event.id,
      entityName: event.title,
      page: 'calendar',
      details: {
        eventTitle: event.title,
        eventDate: event.start_time,
        eventLocation: event.location,
        eventAttendees: event.attendees,
        ...details
      }
    });
  }

  /**
   * Log bulk operations
   */
  static async logBulkOperation(
    userId: string,
    action: string,
    entityType: string,
    itemCount: number,
    details?: Partial<ActivityLogDetails>
  ) {
    await this.log({
      userId,
      action,
      entityType,
      entityId: null,
      entityName: `${itemCount} items`,
      page: entityType + 's',
      details: {
        itemCount,
        ...details
      }
    });
  }
}

/**
 * Helper function to format file size
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
