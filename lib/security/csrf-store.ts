/**
 * CSRF Token Store using Supabase
 * Provides durable token storage that survives server restarts
 */

import { createServiceClient } from '@/lib/supabase/server';

export interface CSRFTokenData {
  token: string;
  expires: number;
}

/**
 * Supabase-based CSRF token store
 * Uses a simple key-value table for token storage
 */
export class SupabaseCSRFStore {
  private tableName = 'csrf_tokens';
  
  async get(sessionId: string): Promise<CSRFTokenData | null> {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from(this.tableName)
        .select('token, expires')
        .eq('session_id', sessionId)
        .single();
      
      if (error || !data) return null;
      
      // Check if expired
      if (Date.now() > data.expires) {
        await this.delete(sessionId);
        return null;
      }
      
      return {
        token: data.token,
        expires: data.expires
      };
    } catch (error) {
      console.error('[CSRF Store] Get error:', error);
      return null;
    }
  }
  
  async set(sessionId: string, data: CSRFTokenData): Promise<void> {
    try {
      const supabase = await createServiceClient();
      await supabase
        .from(this.tableName)
        .upsert({
          session_id: sessionId,
          token: data.token,
          expires: data.expires,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('[CSRF Store] Set error:', error);
    }
  }
  
  async delete(sessionId: string): Promise<void> {
    try {
      const supabase = await createServiceClient();
      await supabase
        .from(this.tableName)
        .delete()
        .eq('session_id', sessionId);
    } catch (error) {
      console.error('[CSRF Store] Delete error:', error);
    }
  }
  
  async cleanup(): Promise<void> {
    try {
      const supabase = await createServiceClient();
      await supabase
        .from(this.tableName)
        .delete()
        .lt('expires', Date.now());
    } catch (error) {
      console.error('[CSRF Store] Cleanup error:', error);
    }
  }
}

// Export singleton instance
export const csrfStore = new SupabaseCSRFStore();
