interface ContactSyncData {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  company?: string;
  specialty?: string;
  related_to?: string[];
  patients?: string[];
  pets?: string[];
  notes?: string;
  website?: string;
  portal_url?: string;
  portal_username?: string;
  portal_password?: string;
  is_emergency?: boolean;
}

export async function syncContactToContactsTable(
  sourceType: 'health' | 'household' | 'pets' | 'academics',
  sourceId: string,
  contactData: ContactSyncData
): Promise<void> {
  try {
    const response = await fetch('/api/contacts/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: sourceType,
        source_id: sourceId,
        contact_data: contactData
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`Failed to sync contact: ${error.error}`);
    }
  } catch (error) {
    console.error('Error syncing contact:', error);
    // Don't throw - we don't want to break the main operation if sync fails
  }
}