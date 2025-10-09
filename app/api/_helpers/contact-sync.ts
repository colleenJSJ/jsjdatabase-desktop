import { createClient } from '@/lib/supabase/server';
import { sanitizeContactPayload } from '@/app/api/_helpers/contact-normalizer';

interface ContactSyncData {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  source_type: 'health' | 'pets' | 'education' | 'travel' | 'household';
  source_id: string;
  category?: string;
  related_to?: string[]; // Array of family member IDs
  patients?: string[];
  pets?: string[];
  specialties?: string[];
  notes?: string | null;
  is_emergency?: boolean;
  portal_url?: string | null;
  portal_username?: string | null;
  portal_password?: string | null;
  company?: string | null;
  role?: string | null;
  services_provided?: string[];
  hours_of_operation?: string | null;
}

/**
 * Maps source types to contact categories
 */
const getCategoryForSource = (sourceType: string): string => {
  const categoryMap: Record<string, string> = {
    'health': 'Health/Medical',
    'pets': 'Pets/Veterinary',
    'education': 'Education/School',
    'travel': 'Travel/Hospitality',
    'household': 'Household/Services'
  };
  return categoryMap[sourceType] || 'General';
};

/**
 * Syncs contact information from various modules to the unified contacts table
 */
export async function syncContactToUnified(contactData: ContactSyncData) {
  try {
    const supabase = await createClient();
    
    // Get current user for created_by
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Determine category based on source type
    const category = contactData.category || getCategoryForSource(contactData.source_type);

    const sanitized = sanitizeContactPayload({
      ...contactData,
      category,
      source_type: contactData.source_type,
      source_page: contactData.source_type,
      related_to: contactData.related_to || contactData.patients || contactData.pets,
    });

    const portalPassword = sanitized.portal_password
      ? await (async () => {
          const { encrypt } = await import('@/lib/encryption');
          return await encrypt(sanitized.portal_password as string);
        })()
      : null;

    // Prepare unified contact data
    const unifiedContactData = {
      name: sanitized.name,
      email: sanitized.email,
      emails: sanitized.emails,
      phone: sanitized.phone,
      phones: sanitized.phones,
      address: sanitized.address,
      addresses: sanitized.addresses,
      website: sanitized.website,
      contact_type: contactData.source_type,
      module: contactData.source_type,
      category,
      source_type: contactData.source_type,
      source_page: sanitized.source_page ?? contactData.source_type,
      source_id: contactData.source_id,
      related_to: sanitized.related_to,
      specialties: contactData.specialties || [],
      notes: sanitized.notes,
      is_emergency: sanitized.is_emergency,
      is_emergency_contact: sanitized.is_emergency,
      portal_url: sanitized.portal_url,
      portal_username: sanitized.portal_username,
      portal_password: portalPassword,
      company: sanitized.company || contactData.company,
      role: contactData.role,
      services_provided: contactData.services_provided || [],
      hours_of_operation: contactData.hours_of_operation,
      tags: sanitized.tags,
      is_active: true,
      created_by: user.id,
      owner_id: user.id
    };

    // Check if contact already exists for this source
    const { data: existing, error: checkError } = await supabase
      .from('contacts_unified')
      .select('id')
      .eq('source_type', contactData.source_type)
      .eq('source_id', contactData.source_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 means no rows found, which is fine
      console.error('Error checking existing contact:', checkError);
      return { success: false, error: checkError.message };
    }

    let result;
    if (existing) {
      // Update existing contact
      const { data, error } = await supabase
        .from('contacts_unified')
        .update({
          ...unifiedContactData,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating unified contact:', error);
        return { success: false, error: error.message };
      }
      result = data;
    } else {
      // Create new unified contact
      const { data, error } = await supabase
        .from('contacts_unified')
        .insert({
          ...unifiedContactData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating unified contact:', error);
        return { success: false, error: error.message };
      }
      result = data;
    }

    return { success: true, data: result };
  } catch (error) {
    console.error('Error syncing contact to unified table:', error);
    return { success: false, error: 'Failed to sync contact' };
  }
}

/**
 * Removes the unified contact entry when a source contact is deleted
 */
export async function removeUnifiedContact(sourceType: string, sourceId: string) {
  try {
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('contacts_unified')
      .delete()
      .eq('source_type', sourceType)
      .eq('source_id', sourceId);

    if (error) {
      console.error('Error removing unified contact:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error removing unified contact:', error);
    return { success: false, error: 'Failed to remove unified contact' };
  }
}

/**
 * Sync a doctor/medical contact from health module
 */
export async function syncDoctorToContacts(doctor: any) {
  const patientIds = doctor.patients || [];
  
  return syncContactToUnified({
    name: doctor.name,
    email: doctor.email,
    phone: doctor.phone,
    address: doctor.address,
    website: doctor.website,
    source_type: 'health',
    source_id: doctor.id,
    category: 'Health/Medical',
    related_to: patientIds,
    specialties: doctor.specialty ? [doctor.specialty] : [],
    notes: doctor.notes,
    portal_url: doctor.portal_url,
    portal_username: doctor.portal_username,
    portal_password: doctor.portal_password,
    is_emergency: false
  });
}

/**
 * Sync a vet contact from pets module
 */
export async function syncVetToContacts(vet: any) {
  const petIds = vet.pets || [];
  
  return syncContactToUnified({
    name: vet.name || vet.clinic_name,
    email: vet.email,
    phone: vet.phone,
    address: vet.address,
    website: vet.website,
    source_type: 'pets',
    source_id: vet.id,
    category: 'Pets/Veterinary',
    related_to: petIds,
    specialties: vet.specialties || [],
    notes: vet.notes,
    is_emergency: vet.is_emergency || false,
    hours_of_operation: vet.hours
  });
}

/**
 * Sync an academic contact from J3 academics module
 */
export async function syncAcademicContactToUnified(contact: any) {
  const childIds = contact.children || contact.child_id ? [contact.child_id].filter(Boolean) : [];
  
  return syncContactToUnified({
    name: contact.contact_name || contact.name,
    email: contact.email,
    phone: contact.phone,
    source_type: 'education',
    source_id: contact.id,
    category: 'Education/School',
    related_to: childIds,
    role: contact.role,
    notes: contact.notes,
    company: contact.school_name
  });
}

/**
 * Sync a travel contact
 */
export async function syncTravelContactToUnified(contact: any) {
  return syncContactToUnified({
    name: contact.name || contact.contact_name,
    email: contact.email,
    phone: contact.phone,
    address: contact.address,
    website: contact.website,
    source_type: 'travel',
    source_id: contact.id,
    category: 'Travel/Hospitality',
    related_to: contact.trip_id ? [contact.trip_id] : [],
    company: contact.company || contact.hotel_name,
    role: contact.contact_type || contact.role,
    notes: contact.notes,
    services_provided: contact.services || []
  });
}

/**
 * Sync a household/service contact
 */
export async function syncHouseholdContactToUnified(contact: any) {
  const propertyIds = contact.property_ids || [];
  
  return syncContactToUnified({
    name: contact.name || contact.company,
    email: contact.email,
    phone: contact.phone,
    address: contact.address,
    website: contact.website,
    source_type: 'household',
    source_id: contact.id,
    category: 'Household/Services',
    related_to: propertyIds,
    company: contact.company,
    services_provided: contact.services || contact.service_type ? [contact.service_type] : [],
    notes: contact.notes,
    is_emergency: contact.is_emergency || false
  });
}
