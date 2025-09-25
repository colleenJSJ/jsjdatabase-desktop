/**
 * Portal-Password Synchronization Service
 * Ensures portals and passwords stay in sync when credentials are created/updated
 */

import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUrl } from '@/lib/utils/url-helper';
import { ActivityLogger } from '@/lib/services/activity-logger';
import { encryptionService } from '@/lib/encryption';

export interface PortalPasswordSyncConfig {
  providerType: 'medical' | 'pet' | 'academic';  // Valid portal types
  providerId?: string; // Optional: doctor_id, vet_id, portal_id, etc.
  providerName: string;
  portalName?: string; // Optional display name override
  portalId?: string; // If provided, target this portal record directly
  portal_url: string;
  portal_username: string;
  portal_password: string;
  ownerId: string; // Primary owner (user id)
  sharedWith: string[]; // Additional users who need access
  createdBy: string; // User creating/updating the record
  notes?: string | null; // Persisted as encrypted notes when provided
  source?: string; // Source of the data (e.g., 'health', 'pets')
  sourcePage?: string; // Optional source page for display (e.g., 'health', 'pets')
  entityIds?: string[]; // Related family member ids (pets, patients, students)
}

/**
 * Normalize and extract domain from URL for consistent matching
 */
function extractDomain(url: string): string {
  try {
    const normalized = normalizeUrl(url);
    const urlObj = new URL(normalized);
    return urlObj.hostname.toLowerCase();
  } catch {
    // If URL parsing fails, just return lowercase trimmed version
    return url.toLowerCase().trim();
  }
}

/**
 * Get category based on provider type
 */
function getCategoryForProviderType(providerType: string): string {
  switch (providerType) {
    case 'medical':
      return 'Health';
    case 'pet':
      return 'Pets';
    case 'academic':
      return 'J3 Academics';
    default:
      return 'Other';       // Matches existing category
  }
}

/**
 * Main sync function - ensures portal and password records exist and are linked
 */
export async function ensurePortalAndPassword(config: PortalPasswordSyncConfig): Promise<{
  portal: any;
  password: any;
  success: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  let serviceSupabase: SupabaseClient | null = null;
  try {
    serviceSupabase = await createServiceClient();
  } catch (serviceError) {
    console.warn('[Portal-Password Sync] Service client unavailable; falling back to user client for password sync', serviceError);
  }
  
  try {
    // 1. Normalize the portal URL and extract domain
    const normalizedUrl = normalizeUrl(config.portal_url);
    const domain = extractDomain(config.portal_url);

    const portalName = (config.portalName ?? config.providerName ?? 'Portal').trim() || config.providerName;
    const encryptedPortalPassword = config.portal_password
      ? encryptionService.encrypt(config.portal_password)
      : null;

    const ownerUserId = config.ownerId || config.createdBy;
    const sharedCandidates = [...(config.sharedWith ?? [])];
    if (config.createdBy && config.createdBy !== ownerUserId) {
      sharedCandidates.push(config.createdBy);
    }
    const cleanSharedWith = Array.from(
      new Set(sharedCandidates.filter(id => id && id !== ownerUserId))
    );

    const portalEntities = Array.from(
      new Set((config.entityIds ?? []).filter((id): id is string => Boolean(id)))
    );

    // 3. Upsert Portal record
    let portal;
    let existingPortal = null;

    if (config.portalId) {
      const { data: portalById, error } = await supabase
        .from('portals')
        .select('*')
        .eq('id', config.portalId)
        .single();

      if (!error && portalById) {
        existingPortal = portalById;
      }
    }

    if (!existingPortal) {
      // Fallback lookup using provider name and domain (legacy support)
      const portalKey = {
        portal_type: config.providerType,
        provider_name: config.providerName.toLowerCase().trim(),
      };

      const { data: foundPortal } = await supabase
        .from('portals')
        .select('*')
        .eq('portal_type', portalKey.portal_type)
        .ilike('provider_name', portalKey.provider_name)
        .maybeSingle();

      if (foundPortal) {
        existingPortal = foundPortal;
      }
    }

    if (existingPortal) {
      const portalUpdate: Record<string, any> = {
        portal_name: portalName,
        provider_name: config.providerName,
        portal_url: normalizedUrl,
        username: config.portal_username || null,
        password: encryptedPortalPassword,
        entity_id: config.providerId ?? existingPortal.entity_id ?? null,
        updated_at: new Date().toISOString(),
      };

      if (portalEntities.length > 0) {
        portalUpdate.patient_ids = portalEntities;
      }
      if (config.notes !== undefined) {
        portalUpdate.notes = config.notes;
      }

      const { data: updatedPortal, error: updateError } = await supabase
        .from('portals')
        .update(portalUpdate)
        .eq('id', existingPortal.id)
        .select()
        .single();

      if (updateError) throw updateError;
      portal = updatedPortal;
    } else {
      const portalInsert: Record<string, any> = {
        portal_type: config.providerType,
        portal_name: portalName,
        portal_url: normalizedUrl,
        username: config.portal_username || null,
        password: encryptedPortalPassword,
        provider_name: config.providerName,
        entity_id: config.providerId ?? null,
        patient_ids: portalEntities,
        notes: config.notes ?? null,
        created_by: config.createdBy,
        updated_at: new Date().toISOString(),
      };

      const { data: newPortal, error: createError } = await supabase
        .from('portals')
        .insert(portalInsert)
        .select()
        .single();

      if (createError) throw createError;
      portal = newPortal;
    }
    
    // 4. Upsert Password record via API
    // Use composite key: domain + username + owner_id for idempotency
    const passwordKey = {
      domain,
      username: config.portal_username,
      owner_id: ownerUserId
    };

    let existingPassword = null;

    if (portal?.password_id) {
      try {
        const passwordClient = (serviceSupabase ?? supabase) as SupabaseClient;
        const { data: passwordById } = await passwordClient
          .from('passwords')
          .select('*')
          .eq('id', portal.password_id)
          .maybeSingle();
        if (passwordById) {
          existingPassword = passwordById;
        }
      } catch (lookupError) {
        console.warn('[Portal-Password Sync] Unable to fetch existing password by id, will attempt fallback matching', lookupError);
      }
    }

    if (!existingPassword && serviceSupabase) {
      const { data: existingPasswords } = await serviceSupabase
        .from('passwords')
        .select('*')
        .eq('owner_id', passwordKey.owner_id)
        .eq('username', passwordKey.username)
        .or(`website_url.ilike.%${domain}%,url.ilike.%${domain}%`);

      existingPassword = existingPasswords?.find(p =>
        p.username === passwordKey.username &&
        (p.website_url?.includes(domain) || p.url?.includes(domain))
      ) ?? null;
    }

    if (!existingPassword && !serviceSupabase) {
      try {
        const { data: fallbackPassword } = await supabase
          .from('passwords')
          .select('*')
          .eq('source_reference', portal.id)
          .maybeSingle();
        if (fallbackPassword) {
          existingPassword = fallbackPassword;
        }
      } catch (fallbackLookupError) {
        console.warn('[Portal-Password Sync] Fallback password lookup failed', fallbackLookupError);
      }
    }
    
    // For password creation, we'll use direct Supabase insert to avoid interface issues
    let password;
    const source = config.source || config.providerType;
    const sourcePage = config.sourcePage || source;

    // Prepare password data for direct database insert
    const entityIds = Array.from(new Set((config.entityIds || []).filter(Boolean)));
    const entityTags = entityIds.length > 0 ? entityIds.map(id => `family:${id}`) : undefined;

    const passwordDataBase: Record<string, any> = {
      service_name: portalName,
      title: portalName,
      username: config.portal_username,
      password: encryptionService.encrypt(config.portal_password),
      url: normalizedUrl,
      website_url: normalizedUrl,
      category: getCategoryForProviderType(config.providerType),
      owner_id: ownerUserId,
      shared_with: cleanSharedWith,
      is_shared: cleanSharedWith.length > 0,
      source,
      source_page: sourcePage,
      source_reference: portal.id, // Link to portal record
      tags: entityTags ?? [],
      is_favorite: false,
      created_by: config.createdBy,
      updated_at: new Date().toISOString(),
      last_changed: new Date().toISOString()
    };
    if (config.notes !== undefined) {
      passwordDataBase.notes = config.notes ? encryptionService.encrypt(config.notes) : null;
    }
    
    if (existingPassword) {
      // Update existing password directly in database
      const existingTagsRaw = Array.isArray(existingPassword.tags)
        ? (existingPassword.tags as string[])
        : [];
      const existingNonFamilyTags = existingTagsRaw.filter(tag => !tag.startsWith('family:'));
      const mergedTags = entityTags
        ? Array.from(new Set([...existingNonFamilyTags, ...entityTags]))
        : existingTagsRaw;

      const passwordUpdate: Record<string, any> = {
        ...passwordDataBase,
        tags: mergedTags,
        created_at: existingPassword.created_at,
      };

      if (config.notes === undefined) {
        delete passwordUpdate.notes;
      }

      const updateClient = (serviceSupabase ?? supabase) as SupabaseClient;
      const { data: updatedPassword, error: updateError } = await updateClient
        .from('passwords')
        .update(passwordUpdate)
        .eq('id', existingPassword.id)
        .select()
        .maybeSingle();

      if (updateError || !updatedPassword) {
        console.error('[Portal-Password Sync] Failed to update password:', updateError);
        throw updateError || new Error('Password update failed');
      }
      password = updatedPassword;
      console.log('[Portal-Password Sync] Password updated successfully:', password?.id);
    } else {
      // Create new password directly in database
      try {
        const passwordInsert = {
          ...passwordDataBase,
          created_at: new Date().toISOString(),
        };

        let newPassword;

        const maskedNotes = passwordDataBase.notes !== undefined
          ? (passwordDataBase.notes ? '[REDACTED]' : null)
          : undefined;

        if (serviceSupabase) {
          console.log('[Portal-Password Sync] Creating password with service client:', {
            ...passwordInsert,
            password: '[REDACTED]',
            ...(maskedNotes !== undefined ? { notes: maskedNotes } : {}),
          });

          const { data, error: createError } = await serviceSupabase
            .from('passwords')
            .insert(passwordInsert)
            .select()
            .single();

          if (createError) {
            console.error('[Portal-Password Sync] Failed to create password:', createError);
            throw createError;
          }
          newPassword = data;
        } else {
          // Fallback to user-scoped client: force owner/shared to createdBy for RLS compatibility
          const fallbackOwnerId = config.createdBy;
          const fallbackSharedWith = cleanSharedWith.filter(id => id && id !== fallbackOwnerId);
          const fallbackInsert = {
            ...passwordInsert,
            owner_id: fallbackOwnerId,
            shared_with: fallbackSharedWith,
            is_shared: fallbackSharedWith.length > 0,
          };

          console.log('[Portal-Password Sync] Creating password with fallback client:', {
            ...fallbackInsert,
            password: '[REDACTED]',
            ...(maskedNotes !== undefined ? { notes: maskedNotes } : {}),
          });

          const { data, error: fallbackError } = await supabase
            .from('passwords')
            .insert(fallbackInsert)
            .select()
            .maybeSingle();

          if (fallbackError || !data) {
            console.error('[Portal-Password Sync] Fallback password creation failed:', fallbackError);
            throw fallbackError || new Error('Fallback password insertion failed');
          }
          newPassword = data;
        }

        password = newPassword;
        console.log('[Portal-Password Sync] Password created successfully:', password?.id);
      } catch (createError) {
        console.error('[Portal-Password Sync] Failed to create password:', createError);
        throw createError;
      }
    }
    
    // 5. Link Portal to Password (update portal with password_id)
    if (password && portal) {
      await supabase
        .from('portals')
        .update({ 
          password_id: password.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', portal.id);
    }
    
    // 6. Log the activity
    await ActivityLogger.log({
      userId: config.createdBy,
      action: existingPortal ? 'update' : 'create',
      entityType: 'portal_password_sync',
      entityId: portal.id,
      entityName: config.providerName,
      page: config.source || 'portal_sync',
      details: {
        portal_id: portal.id,
        password_id: password?.id,
        provider_type: config.providerType,
        owner_id: config.ownerId,
        shared_with_count: cleanSharedWith.length
      }
    });
    
    return {
      portal,
      password,
      success: true
    };
    
  } catch (error) {
    console.error('[Portal-Password Sync] Error:', error);
    return {
      portal: null,
      password: null,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Remove portal-password link (does not delete either record)
 */
export async function unlinkPortalPassword(portalId: string): Promise<boolean> {
  const supabase = await createClient();
  
  try {
    const { error } = await supabase
      .from('portals')
      .update({ 
        password_id: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', portalId);
    
    if (error) throw error;
    
    return true;
  } catch (error) {
    console.error('[Portal-Password Sync] Unlink error:', error);
    return false;
  }
}

/**
 * Get all portals for a specific person (as owner or shared_with)
 * @param providerType - 'medical', 'pet', or 'academic'
 */
export async function getPortalsForPerson(personId: string, providerType?: string): Promise<any[]> {
  const supabase = await createClient();
  
  try {
    let query = supabase
      .from('portals')
      .select('*')
      .or(`patient_ids.cs.{${personId}}`);
    
    if (providerType) {
      query = query.eq('portal_type', providerType);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[Portal-Password Sync] Error fetching portals:', error);
    return [];
  }
}

/**
 * Sync all existing doctor portals to passwords (migration helper)
 */
export async function syncExistingDoctorPortals(userId: string): Promise<{
  synced: number;
  failed: number;
  errors: string[];
}> {
  const supabase = await createClient();
  const results = {
    synced: 0,
    failed: 0,
    errors: [] as string[]
  };
  
  try {
    // Get all doctors with portal credentials
    const { data: doctors, error } = await supabase
      .from('doctors')
      .select('*')
      .not('portal_username', 'is', null)
      .not('portal_password', 'is', null);
    
    if (error) throw error;
    
    for (const doctor of doctors || []) {
      if (!doctor.portal_url || !doctor.portal_username || !doctor.portal_password) {
        continue;
      }
      
      try {
        // Determine owner and shared_with based on patients array
        const patients = doctor.patients || [];
        const ownerId = patients[0] || userId; // First patient or current user
        const sharedWith = patients.slice(1); // Rest of patients
        
        await ensurePortalAndPassword({
          providerType: 'medical',  // Changed from 'health' to 'medical'
          providerId: doctor.id,
          providerName: doctor.name,
          portalName: doctor.name,
          portal_url: doctor.portal_url,
          portal_username: doctor.portal_username,
          portal_password: doctor.portal_password,
          ownerId,
          sharedWith,
          createdBy: userId,
          notes: `Migrated from doctor record: ${doctor.name}`,
          source: 'medical_migration'
        });
        
        results.synced++;
      } catch (syncError) {
        results.failed++;
        results.errors.push(`Failed to sync ${doctor.name}: ${syncError}`);
      }
    }
    
    return results;
  } catch (error) {
    console.error('[Portal-Password Sync] Migration error:', error);
    results.errors.push(error instanceof Error ? error.message : 'Unknown error');
    return results;
  }
}

/**
 * Delete portal and password records for a specific provider
 * Used when deleting doctors, vets, academic contacts, etc.
 */
export async function deletePortalAndPassword(
  providerType: 'medical' | 'pet' | 'academic',
  providerId: string
): Promise<{
  success: boolean;
  deletedPortals: number;
  deletedPasswords: number;
  error?: string;
}> {
  const supabase = await createClient();
  const result = {
    success: true,
    deletedPortals: 0,
    deletedPasswords: 0,
    error: undefined as string | undefined
  };
  
  try {
    console.log(`[Portal-Password Sync] Deleting portal/password for ${providerType} provider ${providerId}`);
    
    // Find all portals for this provider
    const { data: portals, error: findError } = await supabase
      .from('portals')
      .select('id, password_id')
      .eq('portal_type', providerType)
      .eq('entity_id', providerId);
    
    if (findError) {
      throw new Error(`Failed to find portals: ${findError.message}`);
    }
    
    if (!portals || portals.length === 0) {
      console.log('[Portal-Password Sync] No portals found for provider');
      return result;
    }
    
    // Delete associated passwords first
    for (const portal of portals) {
      if (portal.password_id) {
        const { error: passwordError } = await supabase
          .from('passwords')
          .delete()
          .eq('id', portal.password_id);
        
        if (passwordError) {
          console.error(`[Portal-Password Sync] Failed to delete password ${portal.password_id}:`, passwordError);
        } else {
          result.deletedPasswords++;
        }
      }
    }
    
    // Also delete orphaned passwords by source_reference
    const { data: orphanedPasswords, error: orphanedError } = await supabase
      .from('passwords')
      .select('id')
      .eq('source', providerType)
      .eq('source_reference', providerId);
    
    if (!orphanedError && orphanedPasswords) {
      for (const password of orphanedPasswords) {
        const { error: deleteError } = await supabase
          .from('passwords')
          .delete()
          .eq('id', password.id);
        
        if (!deleteError) {
          result.deletedPasswords++;
        }
      }
    }
    
    // Delete the portals
    const { error: portalDeleteError } = await supabase
      .from('portals')
      .delete()
      .eq('portal_type', providerType)
      .eq('entity_id', providerId);
    
    if (portalDeleteError) {
      throw new Error(`Failed to delete portals: ${portalDeleteError.message}`);
    }
    
    result.deletedPortals = portals.length;
    
    console.log(`[Portal-Password Sync] Cleanup complete: ${result.deletedPortals} portals, ${result.deletedPasswords} passwords deleted`);
    
  } catch (error) {
    console.error('[Portal-Password Sync] Cleanup error:', error);
    result.success = false;
    result.error = error instanceof Error ? error.message : 'Unknown error occurred';
  }
  
  return result;
}

export async function deletePortalById(portalId: string): Promise<{
  deletedPortal: boolean;
  deletedPasswords: number;
}> {
  const supabase = await createServiceClient();

  const result = {
    deletedPortal: false,
    deletedPasswords: 0,
  };

  const { data: portal, error: portalError } = await supabase
    .from('portals')
    .select('id, password_id')
    .eq('id', portalId)
    .maybeSingle();

  if (portalError) {
    throw new Error(`Failed to fetch portal ${portalId}: ${portalError.message}`);
  }

  if (!portal) {
    return result;
  }

  try {
    // Remove linked password if the portal tracks it
    if (portal.password_id) {
      const { error: passwordError } = await supabase
        .from('passwords')
        .delete()
        .eq('id', portal.password_id);

      if (passwordError) {
        console.warn('[Portal-Password Sync] Failed to delete password by id:', passwordError);
      } else {
        result.deletedPasswords += 1;
      }
    }

    // Clean up any passwords referencing this portal via source_reference
    const { data: linkedPasswords, error: linkedError } = await supabase
      .from('passwords')
      .select('id')
      .eq('source_reference', portalId);

    if (!linkedError && linkedPasswords?.length) {
      const ids = linkedPasswords.map(p => p.id);
      const { error: orphanDeleteError } = await supabase
        .from('passwords')
        .delete()
        .in('id', ids);

      if (orphanDeleteError) {
        console.warn('[Portal-Password Sync] Failed to delete linked passwords:', orphanDeleteError);
      } else {
        result.deletedPasswords += ids.length;
      }
    }

    const { error: portalDeleteError } = await supabase
      .from('portals')
      .delete()
      .eq('id', portalId);

    if (portalDeleteError) {
      throw new Error(portalDeleteError.message);
    }

    result.deletedPortal = true;
    return result;
  } catch (error) {
    console.error('[Portal-Password Sync] deletePortalById error:', error);
    throw error;
  }
}
