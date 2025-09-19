import { createClient } from '@/lib/supabase/server';
import { encryptionService } from '@/lib/encryption';
import { normalizeUrl } from '@/lib/utils/url-helper';
import { 
  IPasswordService, 
  Password, 
  PasswordInput, 
  PasswordUpdate, 
  PasswordFilter,
  PasswordStrength 
} from './password-service-interface';
import type { Database } from '@/lib/database.types';
import type { PostgrestError } from '@supabase/supabase-js';

export class SupabasePasswordService implements IPasswordService {
  private async getSupabase() {
    // Use regular client to respect RLS policies
    return createClient();
  }

  async getPasswords(userId: string, filter?: PasswordFilter): Promise<Password[]> {
    console.log('[SupabasePasswordService] Getting passwords for user:', userId);
    const supabase = await this.getSupabase();
    
    let query = supabase
      .from('passwords')
      .select('*')
      .order('created_at', { ascending: false });

    if (filter) {
      if (filter.category) {
        query = query.eq('category', filter.category);
      }
      if (filter.owner_id) {
        query = query.eq('owner_id', filter.owner_id);
      }
      if (filter.is_shared !== undefined) {
        query = query.eq('is_shared', filter.is_shared);
      }
      if (filter.is_favorite !== undefined) {
        query = query.eq('is_favorite', filter.is_favorite);
      }
      if (filter.search) {
        query = query.or(`service_name.ilike.%${filter.search}%,username.ilike.%${filter.search}%,url.ilike.%${filter.search}%`);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('[SupabasePasswordService] Error fetching passwords:', error);
      throw new Error('Failed to fetch passwords');
    }

    console.log('[SupabasePasswordService] Raw passwords from DB:', data?.length || 0);
    const passwords = (data || []).map(row => this.mapRowToPassword(row));
    console.log('[SupabasePasswordService] Mapped passwords:', passwords.length);
    
    if (filter?.strength) {
      return passwords.filter(p => p.strength === filter.strength);
    }
    
    return passwords;
  }

  async getPassword(id: string, userId: string): Promise<Password> {
    const supabase = await this.getSupabase();
    
    const { data, error } = await supabase
      .from('passwords')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error('[SupabasePasswordService] Error fetching password:', error);
      throw new Error('Password not found');
    }

    return this.mapRowToPassword(data);
  }

  async createPassword(data: PasswordInput): Promise<Password> {
    const supabase = await this.getSupabase();
    
    // Get the current authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[SupabasePasswordService] No authenticated user:', authError);
      throw new Error('User not authenticated');
    }
    
    const encryptedPassword = encryptionService.encrypt(data.password);
    const encryptedNotes = data.notes ? encryptionService.encrypt(data.notes) : null;
    
    // Log what fields we're trying to insert
    console.log('[SupabasePasswordService] Preparing to insert password:', {
      hasServiceName: !!data.service_name,
      hasUsername: !!data.username,
      hasPassword: !!data.password,
      providedOwnerId: data.owner_id,
      authUserId: user.id,
      category: data.category
    });

    // Determine the owner_id based on user role and request
    let ownerId = user.id; // Default to current user
    
    // Check if user is admin and trying to set a different owner
    if (data.owner_id && data.owner_id !== 'shared') {
      // For non-admin users, always use their own ID (security measure)
      // For admin users, allow setting different owner_id
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
      
      if (userData?.role === 'admin') {
        ownerId = data.owner_id;
      }
    }
    
    // Handle shared passwords
    const isShared = data.is_shared || data.owner_id === 'shared';
    
    const row = {
      title: data.service_name || 'Untitled',
      service_name: data.service_name,
      username: data.username,
      password: encryptedPassword,
      url: data.url ? normalizeUrl(data.url) : null,
      website_url: data.url ? normalizeUrl(data.url) : null,
      category: data.category,
      notes: encryptedNotes,
      tags: data.tags || [],
      owner_id: isShared ? user.id : ownerId, // For shared, use creator's ID but mark as shared
      is_favorite: data.is_favorite || false,
      is_shared: isShared,
      last_changed: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Test if we can read from the table first
    const { error: readError } = await supabase
      .from('passwords')
      .select('id')
      .limit(1);
    
    if (readError) {
      console.error('[SupabasePasswordService] Cannot read from passwords table:', readError);
    }

    const { data: created, error } = await supabase
      .from('passwords')
      .insert(row)
      .select()
      .single();

    if (error || !created) {
      console.error('[SupabasePasswordService] Error creating password:', {
        error: error,
        errorMessage: error?.message,
        errorDetails: error?.details,
        errorHint: error?.hint,
        errorCode: error?.code,
        created: created,
        rowData: {
          ...row,
          password: '[HIDDEN]',
          notes: row.notes ? '[HIDDEN]' : null
        }
      });
      throw new Error(`Failed to create password: ${error?.message || 'Unknown error'}`);
    }

    await this.logActivity(user.id, 'password_created');

    return this.mapRowToPassword(created);
  }

  async updatePassword(id: string, userId: string, data: PasswordUpdate): Promise<Password> {
    const supabase = await this.getSupabase();
    
    const updates: Partial<Database['public']['Tables']['passwords']['Update']> = {
      updated_at: new Date().toISOString()
    };

    if (data.service_name !== undefined) {
      updates.service_name = data.service_name;
    }
    if (data.username !== undefined) updates.username = data.username;
    if (data.password !== undefined) {
      updates.password = encryptionService.encrypt(data.password);
      updates.last_changed = new Date().toISOString();
    }
    if (data.url !== undefined) updates.url = data.url ? normalizeUrl(data.url) : null;
    if (data.category !== undefined) updates.category = data.category;
    if (data.notes !== undefined) {
      updates.notes = data.notes ? encryptionService.encrypt(data.notes) : null;
    }
    if (data.tags !== undefined) updates.tags = data.tags;
    if (data.is_favorite !== undefined) updates.is_favorite = data.is_favorite;
    if (data.is_shared !== undefined) updates.is_shared = data.is_shared;

    const { data: updated, error } = await supabase
      .from('passwords')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !updated) {
      console.error('[SupabasePasswordService] Error updating password:', error);
      throw new Error('Failed to update password');
    }

    await this.logActivity(userId, 'password_updated');

    return this.mapRowToPassword(updated);
  }

  async deletePassword(id: string, userId: string): Promise<void> {
    const supabase = await this.getSupabase();
    
    const { error } = await supabase
      .from('passwords')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[SupabasePasswordService] Error deleting password:', error);
      throw new Error('Failed to delete password');
    }

    await this.logActivity(userId, 'password_deleted');
  }

  async searchPasswords(userId: string, query: string): Promise<Password[]> {
    return this.getPasswords(userId, { search: query });
  }

  async bulkDelete(ids: string[], userId: string): Promise<void> {
    const supabase = await this.getSupabase();
    
    const { error } = await supabase
      .from('passwords')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('[SupabasePasswordService] Error bulk deleting passwords:', error);
      throw new Error('Failed to delete passwords');
    }

    await this.logActivity(userId, 'passwords_bulk_deleted', { count: ids.length });
  }

  calculatePasswordStrength(password: string): PasswordStrength {
    if (!password || password.length < 8) {
      return PasswordStrength.WEAK;
    }

    let strength = 0;
    
    if (password.length >= 12) strength++;
    if (password.length >= 16) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    if (strength <= 2) return PasswordStrength.WEAK;
    if (strength <= 4) return PasswordStrength.FAIR;
    if (strength <= 5) return PasswordStrength.STRONG;
    return PasswordStrength.EXCELLENT;
  }

  private mapRowToPassword(row: Database['public']['Tables']['passwords']['Row']): Password {
    let decryptedPassword = '';
    let decryptedNotes = '';

    try {
      decryptedPassword = row.password ? encryptionService.decrypt(row.password) : '';
    } catch (error) {
      console.error('[SupabasePasswordService] Error decrypting password:', error);
      decryptedPassword = '[Decryption Error]';
    }

    try {
      decryptedNotes = row.notes ? encryptionService.decrypt(row.notes) : '';
    } catch (error) {
      console.error('[SupabasePasswordService] Error decrypting notes:', error);
      decryptedNotes = row.notes || '';
    }

    const password: Password = {
      id: row.id,
      service_name: row.service_name || (row as any).title || '',
      username: row.username || '',
      password: decryptedPassword,
      url: row.url || (row as any).website_url || '',
      category: row.category || 'other',
      notes: decryptedNotes,
      tags: row.tags || [],
      owner_id: row.owner_id,
      is_favorite: row.is_favorite || false,
      is_shared: row.is_shared || false,
      last_changed: new Date(row.last_changed || row.updated_at),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };

    password.strength = this.calculatePasswordStrength(decryptedPassword);

    return password;
  }

  async testDatabaseAccess(userId: string): Promise<{ canRead: boolean; canInsert: boolean; error?: PostgrestError }> {
    const supabase = await this.getSupabase();
    
    // Test read access
    const { error: readError } = await supabase
      .from('passwords')
      .select('id')
      .limit(1);
    
    // Get current auth user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('[SupabasePasswordService] Current auth user:', user?.id, 'Provided userId:', userId);
    
    // Test minimal insert
    const testRow = {
      service_name: 'Test Password Entry',
      username: 'testuser',
      password: encryptionService.encrypt('testpassword'),
      category: 'other',
      owner_id: user?.id || userId, // Use auth user ID if available
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { error: insertError } = await supabase
      .from('passwords')
      .insert(testRow)
      .select()
      .single();
    
    return {
      canRead: !readError,
      canInsert: !insertError,
      error: insertError ?? readError ?? undefined
    };
  }

  private async logActivity(userId: string, action: string, metadata?: Record<string, unknown>): Promise<void> {
    try {
      const supabase = await this.getSupabase();
      
      await supabase
        .from('activity_logs')
        .insert({
          user_id: userId,
          action,
          metadata: metadata || {},
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('[SupabasePasswordService] Error logging activity:', error);
    }
  }
}
