import { createClient } from '@/lib/supabase/server';

interface PortalPasswordData {
  portal_name: string;
  portal_url?: string | null;
  username?: string | null;
  password?: string | null;
  portal_type: 'medical' | 'pet' | 'academic' | 'travel';
  portal_id: string;
  patient_ids?: string[];
  owner_id?: string;
}

/**
 * Syncs portal credentials to the passwords table
 * Creates or updates a password entry when a portal is created/updated
 */
export async function syncPortalToPassword(portalData: PortalPasswordData) {
  try {
    const supabase = await createClient();
    
    // Only sync if there's a username or password
    if (!portalData.username && !portalData.password) {
      return { success: true, message: 'No credentials to sync' };
    }

    // Map portal type to password category
    const categoryMap: Record<string, string> = {
      'medical': 'health',
      'pet': 'pets',
      'academic': 'education',
      'travel': 'travel'
    };

    const category = categoryMap[portalData.portal_type] || 'other';
    
    // Prepare password data
    const passwordData = {
      title: portalData.portal_name,
      service_name: portalData.portal_name,
      username: portalData.username || '',
      password: portalData.password || '',
      url: portalData.portal_url || '',
      category,
      notes: `Auto-synced from ${portalData.portal_type} portal`,
      source: `${portalData.portal_type}_portal`,
      source_reference: portalData.portal_id,
      owner_id: portalData.owner_id || portalData.patient_ids?.[0] || 'shared',
      is_favorite: false
    };

    // Check if password entry already exists for this portal
    const { data: existing, error: checkError } = await supabase
      .from('passwords')
      .select('id')
      .eq('source', `${portalData.portal_type}_portal`)
      .eq('source_reference', portalData.portal_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 means no rows found, which is fine
      console.error('Error checking existing password:', checkError);
      return { success: false, error: checkError.message };
    }

    let result;
    if (existing) {
      // Update existing password entry
      const { data, error } = await supabase
        .from('passwords')
        .update({
          title: passwordData.title,
          service_name: passwordData.service_name,
          username: passwordData.username,
          password: passwordData.password,
          url: passwordData.url,
          category: passwordData.category,
          notes: passwordData.notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating password:', error);
        return { success: false, error: error.message };
      }
      result = data;
    } else {
      // Create new password entry
      const { data, error } = await supabase
        .from('passwords')
        .insert(passwordData)
        .select()
        .single();

      if (error) {
        console.error('Error creating password:', error);
        return { success: false, error: error.message };
      }
      result = data;
    }

    return { success: true, data: result };
  } catch (error) {
    console.error('Error syncing portal to password:', error);
    return { success: false, error: 'Failed to sync portal credentials' };
  }
}

/**
 * Removes the password entry when a portal is deleted
 */
export async function removePortalPassword(portalId: string, portalType: string) {
  try {
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('passwords')
      .delete()
      .eq('source', `${portalType}_portal`)
      .eq('source_reference', portalId);

    if (error) {
      console.error('Error removing password for portal:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error removing portal password:', error);
    return { success: false, error: 'Failed to remove portal password' };
  }
}