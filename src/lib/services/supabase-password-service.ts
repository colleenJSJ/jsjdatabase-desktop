import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { encryptionService, decryptMany, isEncryptionBatchEnabled } from '@/lib/encryption';
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

type BatchDecryptionCache = {
  passwords: Map<string, string>;
  notes: Map<string, string>;
};

export class SupabasePasswordService implements IPasswordService {
  constructor(private sessionToken: string | null = null) {}

  setSessionToken(token: string | null) {
    this.sessionToken = token;
  }

  private getEncryptionOptions() {
    if (!this.sessionToken) {
      console.warn('[SupabasePasswordService] Session token missing when preparing encryption options');
    }
    return { sessionToken: this.sessionToken ?? undefined };
  }

  private async getSupabase() {
    // Use regular client to respect RLS policies
    return createClient();
  }

  private async prepareBatchDecryption(
    rows: Database['public']['Tables']['passwords']['Row'][],
  ): Promise<BatchDecryptionCache | null> {
    if (!rows.length || !isEncryptionBatchEnabled()) {
      return null;
    }

    const options = this.getEncryptionOptions();
    const passwordItems = rows
      .filter((row) => typeof row.password === 'string' && row.password.length > 0)
      .map((row) => ({ id: row.id, payload: row.password as string }));

    const noteItems = rows
      .filter((row) => typeof row.notes === 'string' && row.notes.length > 0)
      .map((row) => ({ id: row.id, payload: row.notes as string }));

    if (passwordItems.length === 0 && noteItems.length === 0) {
      return null;
    }

    try {
      const cache: BatchDecryptionCache = {
        passwords: new Map<string, string>(),
        notes: new Map<string, string>(),
      };

      if (passwordItems.length > 0) {
        const decryptedPasswords = await decryptMany(
          passwordItems.map((item) => item.payload),
          options,
        );

        if (decryptedPasswords.length !== passwordItems.length) {
          throw new Error('Password batch decrypt length mismatch');
        }

        passwordItems.forEach((item, index) => {
          cache.passwords.set(item.id, decryptedPasswords[index] ?? '');
        });
      }

      if (noteItems.length > 0) {
        const decryptedNotes = await decryptMany(
          noteItems.map((item) => item.payload),
          options,
        );

        if (decryptedNotes.length !== noteItems.length) {
          throw new Error('Notes batch decrypt length mismatch');
        }

        noteItems.forEach((item, index) => {
          cache.notes.set(item.id, decryptedNotes[index] ?? '');
        });
      }

      return cache;
    } catch (error) {
      console.warn('[SupabasePasswordService] Batch decrypt failed, falling back to single decrypt', error);
      return null;
    }
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
        const sanitizedSearch = filter.search.replace(/[%_,]/g, '').trim();
        if (sanitizedSearch.length > 0) {
          const pattern = `%${sanitizedSearch}%`;
          query = query.or(`service_name.ilike.${pattern},username.ilike.${pattern},url.ilike.${pattern}`);
        }
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('[SupabasePasswordService] Error fetching passwords:', error);
      throw new Error('Failed to fetch passwords');
    }

    const rows = data || [];

    console.log('[SupabasePasswordService] Raw passwords from DB:', rows.length);

    const batchCache = await this.prepareBatchDecryption(rows);

    const passwords = await Promise.all(rows.map((row) => this.mapRowToPassword(row, batchCache)));
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
    
    const options = this.getEncryptionOptions();
    const encryptedPassword = await encryptionService.encrypt(data.password, options);
    const encryptedNotes = data.notes ? await encryptionService.encrypt(data.notes, options) : null;
    
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
    
    const source = data.source ?? 'manual_password';
    const sourceReference = data.source_reference ?? randomUUID();

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
      source,
      source_reference: sourceReference,
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
      updates.password = await encryptionService.encrypt(
        data.password,
        this.getEncryptionOptions(),
      );
      updates.last_changed = new Date().toISOString();
    }
    if (data.url !== undefined) updates.url = data.url ? normalizeUrl(data.url) : null;
    if (data.category !== undefined) updates.category = data.category;
    if (data.notes !== undefined) {
      updates.notes = data.notes
        ? await encryptionService.encrypt(data.notes, this.getEncryptionOptions())
        : null;
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

  private async mapRowToPassword(
    row: Database['public']['Tables']['passwords']['Row'],
    batchCache?: BatchDecryptionCache | null,
  ): Promise<Password> {
    let decryptedPassword = '';
    let decryptedNotes = '';

    try {
      if (batchCache?.passwords?.has(row.id)) {
        decryptedPassword = batchCache.passwords.get(row.id) ?? '';
      } else {
        decryptedPassword = row.password
          ? await encryptionService.decrypt(row.password, this.getEncryptionOptions())
          : '';
      }
    } catch (error) {
      console.error('[SupabasePasswordService] Error decrypting password:', error);
      if (error && typeof error === 'object' && 'details' in error) {
        console.error('[SupabasePasswordService] Decrypt password details:', (error as any).details);
      }
      decryptedPassword = '[Decryption Error]';
    }

    try {
      if (batchCache?.notes?.has(row.id)) {
        decryptedNotes = batchCache.notes.get(row.id) ?? '';
      } else {
        decryptedNotes = row.notes
          ? await encryptionService.decrypt(row.notes, this.getEncryptionOptions())
          : '';
      }
    } catch (error) {
      console.error('[SupabasePasswordService] Error decrypting notes:', error);
      if (error && typeof error === 'object' && 'details' in error) {
        console.error('[SupabasePasswordService] Decrypt notes details:', (error as any).details);
      }
      decryptedNotes = row.notes || '';
    }

    const extraFields = row as Record<string, unknown>;
    const fallbackTitle = typeof extraFields.title === 'string' ? extraFields.title : '';
    const fallbackUrl = typeof extraFields.website_url === 'string' ? extraFields.website_url : '';
    const sourceValue = typeof extraFields.source === 'string' ? extraFields.source : null;
    const sourcePage = typeof extraFields.source_page === 'string' ? extraFields.source_page : null;
    const sourceReference = typeof extraFields.source_reference === 'string' ? extraFields.source_reference : null;

    const password: Password = {
      id: row.id,
      service_name: row.service_name || fallbackTitle || '',
      username: row.username || '',
      password: decryptedPassword,
      url: row.url || fallbackUrl,
      category: row.category || 'other',
      notes: decryptedNotes,
      tags: row.tags || [],
      owner_id: row.owner_id,
      is_favorite: row.is_favorite || false,
      is_shared: row.is_shared || false,
      last_changed: new Date(row.last_changed || row.updated_at),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      source: sourceValue ?? undefined,
      source_page: sourcePage ?? sourceValue ?? undefined,
      source_reference: sourceReference ?? undefined,
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
      password: await encryptionService.encrypt('testpassword'),
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
