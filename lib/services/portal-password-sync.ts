/**
 * Portal-Password Synchronization Service
 * Ensures portals and passwords stay in sync when credentials are created/updated
 */

import { createClient } from '@/lib/supabase/server';
import { normalizeUrl } from '@/lib/utils/url-helper';
import { ActivityLogger } from '@/lib/services/activity-logger';

export interface PortalPasswordSyncConfig {
  providerType: 'medical' | 'pet' | 'academic';  // Valid portal types
  providerId?: string; // Optional: doctor_id, vet_id, portal_id, etc.
  providerName: string;
  portal_url: string;
  portal_username: string;
  portal_password: string;
  ownerId: string; // Primary owner (patient, pet owner, etc.)
  sharedWith: string[]; // Additional family members who need access
  createdBy: string; // User creating/updating the record
  notes?: string;
  source?: string; // Source of the data (e.g., 'health', 'pets')
  sourcePage?: string; // Optional source page for display (e.g., 'health', 'pets')
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
      return 'Healthcare';  // Use existing Healthcare category
    case 'pet':
      return 'Personal';    // Use Personal for pets (no pets category)
    case 'academic':
      return 'Education';   // Matches existing category
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
  
  try {
    // 1. Normalize the portal URL and extract domain
    const normalizedUrl = normalizeUrl(config.portal_url);
    const domain = extractDomain(config.portal_url);
    
    // 2. Dedupe and validate shared_with (ensure owner_id not in shared_with)
    const cleanSharedWith = Array.from(new Set(
      config.sharedWith.filter(id => id && id !== config.ownerId)
    ));
    
    // 3. Upsert Portal record
    // Use composite key: providerType + domain + providerName
    const portalKey = {
      portal_type: config.providerType,
      portal_url_domain: domain,
      provider_name: config.providerName.toLowerCase().trim()
    };
    
    // Check if portal exists
    const { data: existingPortal, error: portalSearchError } = await supabase
      .from('portals')
      .select('*')
      .eq('portal_type', portalKey.portal_type)
      .ilike('provider_name', portalKey.provider_name)
      .single();
    
    let portal;
    if (existingPortal) {
      // Update existing portal
      const { data: updatedPortal, error: updateError } = await supabase
        .from('portals')
        .update({
          portal_url: normalizedUrl,
          username: config.portal_username,
          password: config.portal_password, // Note: This should be encrypted in production
          patient_ids: [config.ownerId, ...cleanSharedWith], // All people who can access
          entity_id: config.providerId,
          notes: config.notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingPortal.id)
        .select()
        .single();
      
      if (updateError) throw updateError;
      portal = updatedPortal;
    } else {
      // Create new portal
      const { data: newPortal, error: createError } = await supabase
        .from('portals')
        .insert({
          portal_type: config.providerType,
          portal_name: `${config.providerName} Portal`,
          portal_url: normalizedUrl,
          username: config.portal_username,
          password: config.portal_password,
          provider_name: config.providerName,
          entity_id: config.providerId,
          patient_ids: [config.ownerId, ...cleanSharedWith],
          notes: config.notes,
          created_by: config.createdBy
        })
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
      owner_id: config.ownerId
    };
    
    // Check if password exists
    const { data: existingPasswords, error: passwordSearchError } = await supabase
      .from('passwords')
      .select('*')
      .eq('owner_id', passwordKey.owner_id)
      .eq('username', passwordKey.username)
      .or(`website_url.ilike.%${domain}%,url.ilike.%${domain}%`);
    
    // Find exact match if exists
    const existingPassword = existingPasswords?.find(p => 
      p.username === passwordKey.username && 
      (p.website_url?.includes(domain) || p.url?.includes(domain))
    );
    
    // For password creation, we'll use direct Supabase insert to avoid interface issues
    let password;
    
    // Import encryption service
    const { encryptionService } = await import('@/lib/encryption');
    
    const source = config.source || config.providerType;
    const sourcePage = config.sourcePage || source;

    // Prepare password data for direct database insert
    const passwordData = {
      service_name: config.providerName,
      title: `${config.providerName} Portal`,
      username: config.portal_username,
      password: encryptionService.encrypt(config.portal_password), // Encrypt the password
      url: normalizedUrl,
      website_url: normalizedUrl,
      category: getCategoryForProviderType(config.providerType),
      notes: config.notes ? encryptionService.encrypt(config.notes || `Portal for ${config.providerName}`) : null,
      owner_id: config.ownerId,
      shared_with: cleanSharedWith, // Array of UUIDs
      is_shared: cleanSharedWith.length > 0,
      source,
      source_page: sourcePage,
      source_reference: portal.id, // Link to portal record
      tags: [],
      is_favorite: false,
      created_by: config.createdBy,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_changed: new Date().toISOString()
    };
    
    if (existingPassword) {
      // Update existing password directly in database
      const { data: updatedPassword, error: updateError } = await supabase
        .from('passwords')
        .update({
          ...passwordData,
          created_at: existingPassword.created_at, // Keep original creation date
        })
        .eq('id', existingPassword.id)
        .select()
        .single();
      
      if (updateError) {
        console.error('[Portal-Password Sync] Failed to update password:', updateError);
        throw updateError;
      }
      password = updatedPassword;
      console.log('[Portal-Password Sync] Password updated successfully:', password?.id);
    } else {
      // Create new password directly in database
      try {
        console.log('[Portal-Password Sync] Creating password with data:', {
          ...passwordData,
          password: '[REDACTED]',
          notes: passwordData.notes ? '[REDACTED]' : null
        });
        
        const { data: newPassword, error: createError } = await supabase
          .from('passwords')
          .insert(passwordData)
          .select()
          .single();
        
        if (createError) {
          console.error('[Portal-Password Sync] Failed to create password:', createError);
          throw createError;
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
