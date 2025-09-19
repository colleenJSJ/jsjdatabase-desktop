import { createClient } from '@/lib/supabase/server';
import { CalendarEvent } from '@/lib/supabase/types';

export interface SyncResult {
  ok: boolean;
  id?: string;
  existed?: boolean;
  error?: string;
}

export interface CalendarEventData {
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location?: string;
  is_virtual?: boolean;
  virtual_link?: string;
  category?: string;
  source: string;
  source_reference?: string;
  attendees?: string[];
  google_calendar_id?: string | null;
  reminder_minutes?: number;
  metadata?: Record<string, any>;
  timezone?: string | null;
}

export interface PasswordData {
  name: string;
  website?: string;
  username?: string;
  password: string;
  category: string;
  source: string;
  source_reference: string;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface DocumentData {
  title: string;
  file_url: string;
  file_size?: number;
  file_type?: string;
  category: string;
  source?: string;
  source_reference?: string;
  assigned_to?: string[];
  metadata?: Record<string, any>;
}

export interface Operation {
  type: 'calendar' | 'password' | 'document' | 'task' | 'custom';
  forward: () => Promise<any>;
  backward: (result: any) => Promise<void>;
}

/**
 * Central sync service for handling cross-domain data synchronization
 * Ensures idempotency and proper rollback handling
 */
export class SyncService {
  private requestId: string;
  private userId?: string;
  
  constructor(requestId?: string, userId?: string) {
    this.requestId = requestId || crypto.randomUUID();
    this.userId = userId;
  }
  
  /**
   * Log sync operation to audit table
   */
  private async logAudit(
    operation: 'create' | 'update' | 'delete' | 'sync',
    sourceTable: string,
    sourceId: string | undefined,
    targetTable: string | undefined,
    targetId: string | undefined,
    status: 'pending' | 'success' | 'failed' | 'rolled_back',
    error?: string,
    metadata?: any
  ) {
    try {
      const supabase = await createClient();
      
      const auditData = {
        request_id: this.requestId,
        operation_type: operation,
        source_table: sourceTable,
        source_id: sourceId,
        target_table: targetTable,
        target_id: targetId,
        status,
        error_message: error,
        metadata,
        created_by: this.userId,
        completed_at: status !== 'pending' ? new Date().toISOString() : null
      };
      
      await supabase.from('sync_audit').insert(auditData);
    } catch (auditError) {
      // Don't fail the operation if audit logging fails
      console.error(`[${this.requestId}] Failed to log audit:`, auditError);
    }
  }

  /**
   * Ensure a calendar event exists (upsert by source/reference)
   */
  async ensureCalendarEvent(data: CalendarEventData): Promise<SyncResult> {
    try {
      const supabase = await createClient();
      // Resolve user for created_by if available
      let currentUserId = this.userId;
      if (!currentUserId) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) currentUserId = user.id;
        } catch {}
      }
      
      // Log the operation
      console.log(`[${this.requestId}] Ensuring calendar event for ${data.source}/${data.source_reference}`);
      
      // Log audit entry
      await this.logAudit('sync', data.source, data.source_reference, 'calendar_events', undefined, 'pending', undefined, data.metadata);
      
      // First, check if event already exists
      // Prepare sanitized payload (map virtual_link → meeting_link)
      const toPayload = async (input: CalendarEventData) => {
        const payload: any = { ...input };
        if ((input as any).virtual_link && !payload.meeting_link) {
          payload.meeting_link = (input as any).virtual_link;
        }
        delete payload.virtual_link;
        // Ensure created_by is set for RLS/ownership
        if (currentUserId && !payload.created_by) {
          payload.created_by = currentUserId;
        }
        // Resolve timezone if not explicitly provided
        if (!payload.timezone) {
          payload.timezone = input?.metadata?.timezone || input?.metadata?.departure_timezone || null;
          if (!payload.timezone && input.google_calendar_id) {
            try {
              const { data: cal } = await supabase
                .from('google_calendars')
                .select('time_zone')
                .eq('google_calendar_id', input.google_calendar_id)
                .single();
              if (cal?.time_zone) payload.timezone = cal.time_zone;
            } catch {}
          }
        }
        return payload;
      };

      if (data.source_reference) {
        const { data: existing, error: fetchError } = await supabase
          .from('calendar_events')
          .select('id')
          .eq('source', data.source)
          .eq('source_reference', data.source_reference)
          .single();
        
        if (existing) {
          // Update existing event
          const { data: updated, error: updateError } = await supabase
            .from('calendar_events')
            .update({
              ...(await toPayload(data)),
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id)
            .select()
            .single();
          
          if (updateError) {
            console.error(`[${this.requestId}] Failed to update calendar event:`, updateError);
            await this.logAudit('update', data.source, data.source_reference, 'calendar_events', existing.id, 'failed', updateError.message);
            return { ok: false, error: updateError.message };
          }
          
          await this.logAudit('update', data.source, data.source_reference, 'calendar_events', updated.id, 'success');
          return { ok: true, id: updated.id, existed: true };
        }
      }
      
      // Create new event
      const { data: created, error: createError } = await supabase
        .from('calendar_events')
        .insert(await toPayload(data))
        .select()
        .single();
      
      if (createError) {
        // Check if it's a unique constraint violation
        if (createError.code === '23505') {
          // Race condition - event was created by another request
          const { data: existing } = await supabase
            .from('calendar_events')
            .select('id')
            .eq('source', data.source)
            .eq('source_reference', data.source_reference!)
            .single();
          
          if (existing) {
            return { ok: true, id: existing.id, existed: true };
          }
        }
        
        console.error(`[${this.requestId}] Failed to create calendar event:`, createError);
        await this.logAudit('create', data.source, data.source_reference, 'calendar_events', undefined, 'failed', createError.message);
        return { ok: false, error: createError.message };
      }
      
      await this.logAudit('create', data.source, data.source_reference, 'calendar_events', created.id, 'success');
      return { ok: true, id: created.id, existed: false };
    } catch (error) {
      console.error(`[${this.requestId}] Unexpected error in ensureCalendarEvent:`, error);
      return { ok: false, error: 'Internal error' };
    }
  }

  /**
   * Ensure a password entry exists (upsert by source/reference)
   */
  async ensurePasswordEntry(data: PasswordData): Promise<SyncResult> {
    try {
      const supabase = await createClient();
      
      console.log(`[${this.requestId}] Ensuring password entry for ${data.source}/${data.source_reference}`);
      
      // Check if password already exists
      const { data: existing, error: fetchError } = await supabase
        .from('passwords')
        .select('id')
        .eq('source', data.source)
        .eq('source_reference', data.source_reference)
        .single();
      
      if (existing) {
        // Update existing password
        const { data: updated, error: updateError } = await supabase
          .from('passwords')
          .update({
            ...data,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();
        
        if (updateError) {
          console.error(`[${this.requestId}] Failed to update password:`, updateError);
          return { ok: false, error: updateError.message };
        }
        
        return { ok: true, id: updated.id, existed: true };
      }
      
      // Create new password
      const { data: created, error: createError } = await supabase
        .from('passwords')
        .insert(data)
        .select()
        .single();
      
      if (createError) {
        // Check for unique constraint violation
        if (createError.code === '23505') {
          const { data: existing } = await supabase
            .from('passwords')
            .select('id')
            .eq('source', data.source)
            .eq('source_reference', data.source_reference)
            .single();
          
          if (existing) {
            return { ok: true, id: existing.id, existed: true };
          }
        }
        
        console.error(`[${this.requestId}] Failed to create password:`, createError);
        return { ok: false, error: createError.message };
      }
      
      return { ok: true, id: created.id, existed: false };
    } catch (error) {
      console.error(`[${this.requestId}] Unexpected error in ensurePasswordEntry:`, error);
      return { ok: false, error: 'Internal error' };
    }
  }

  /**
   * Ensure a document exists and is saved
   */
  async ensureDocument(data: DocumentData): Promise<SyncResult> {
    try {
      const supabase = await createClient();
      
      console.log(`[${this.requestId}] Ensuring document for ${data.source}/${data.source_reference}`);
      
      // Check if document already exists by URL
      const { data: existing, error: fetchError } = await supabase
        .from('documents')
        .select('id')
        .eq('file_url', data.file_url)
        .single();
      
      if (existing) {
        // Update existing document metadata
        const { data: updated, error: updateError } = await supabase
          .from('documents')
          .update({
            title: data.title,
            category: data.category,
            assigned_to: data.assigned_to,
            metadata: data.metadata,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();
        
        if (updateError) {
          console.error(`[${this.requestId}] Failed to update document:`, updateError);
          return { ok: false, error: updateError.message };
        }
        
        return { ok: true, id: updated.id, existed: true };
      }
      
      // Create new document
      const { data: created, error: createError } = await supabase
        .from('documents')
        .insert(data)
        .select()
        .single();
      
      if (createError) {
        console.error(`[${this.requestId}] Failed to create document:`, createError);
        return { ok: false, error: createError.message };
      }
      
      return { ok: true, id: created.id, existed: false };
    } catch (error) {
      console.error(`[${this.requestId}] Unexpected error in ensureDocument:`, error);
      return { ok: false, error: 'Internal error' };
    }
  }

  /**
   * Remove a calendar event by source/reference
   */
  async removeCalendarEvent(source: string, sourceReference: string): Promise<SyncResult> {
    try {
      const supabase = await createClient();
      
      console.log(`[${this.requestId}] Removing calendar event for ${source}/${sourceReference}`);
      
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('source', source)
        .eq('source_reference', sourceReference);
      
      if (error) {
        console.error(`[${this.requestId}] Failed to remove calendar event:`, error);
        return { ok: false, error: error.message };
      }
      
      return { ok: true };
    } catch (error) {
      console.error(`[${this.requestId}] Unexpected error in removeCalendarEvent:`, error);
      return { ok: false, error: 'Internal error' };
    }
  }

  /**
   * Remove a password entry by source/reference
   */
  async removePasswordEntry(source: string, sourceReference: string): Promise<SyncResult> {
    try {
      const supabase = await createClient();
      
      console.log(`[${this.requestId}] Removing password entry for ${source}/${sourceReference}`);
      
      const { error } = await supabase
        .from('passwords')
        .delete()
        .eq('source', source)
        .eq('source_reference', sourceReference);
      
      if (error) {
        console.error(`[${this.requestId}] Failed to remove password:`, error);
        return { ok: false, error: error.message };
      }
      
      return { ok: true };
    } catch (error) {
      console.error(`[${this.requestId}] Unexpected error in removePasswordEntry:`, error);
      return { ok: false, error: 'Internal error' };
    }
  }
}

/**
 * Composite operation handler with rollback support
 */
export class CompositeOperation {
  private steps: Operation[] = [];
  private completed: { operation: Operation; result: any }[] = [];
  private requestId: string;
  
  constructor(requestId?: string) {
    this.requestId = requestId || crypto.randomUUID();
  }
  
  addStep(operation: Operation) {
    this.steps.push(operation);
    return this;
  }
  
  async execute(): Promise<{ ok: boolean; results: any[]; error?: string }> {
    console.log(`[${this.requestId}] Starting composite operation with ${this.steps.length} steps`);
    const results: any[] = [];
    
    for (const operation of this.steps) {
      try {
        console.log(`[${this.requestId}] Executing ${operation.type} operation`);
        const result = await operation.forward();
        this.completed.push({ operation, result });
        results.push(result);
      } catch (error) {
        console.error(`[${this.requestId}] Operation failed, starting rollback:`, error);
        await this.rollback();
        return { 
          ok: false, 
          results, 
          error: error instanceof Error ? error.message : 'Operation failed' 
        };
      }
    }
    
    console.log(`[${this.requestId}] Composite operation completed successfully`);
    return { ok: true, results };
  }
  
  private async rollback() {
    console.log(`[${this.requestId}] Rolling back ${this.completed.length} operations`);
    
    for (const { operation, result } of this.completed.reverse()) {
      try {
        console.log(`[${this.requestId}] Rolling back ${operation.type} operation`);
        await operation.backward(result);
      } catch (error) {
        console.error(`[${this.requestId}] Rollback failed for ${operation.type}:`, error);
        // Continue rolling back other operations
      }
    }
  }
}

/**
 * Get request ID from headers or generate new one
 */
export function getRequestId(headers?: Headers): string {
  const requestId = headers?.get('x-request-id') || crypto.randomUUID();
  return requestId;
}

/**
 * Format datetime for consistent storage (exclusive end for all-day events)
 */
export function formatEventDateTime(date: string, time: string, isAllDay: boolean, isEnd: boolean = false): string {
  if (isAllDay) {
    const d = new Date(date);
    if (isEnd) {
      // For all-day events, end is exclusive (next day at 00:00)
      d.setDate(d.getDate() + 1);
      return `${d.toISOString().split('T')[0]}T00:00:00`;
    } else {
      return `${date}T00:00:00`;
    }
  } else {
    return `${date}T${time}:00`;
  }
}
