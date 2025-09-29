import { ensurePortalAndPassword, deletePortalAndPassword } from '@/lib/services/portal-password-sync';
import { decrypt } from '@/lib/encryption';

type UnifiedContact = {
  id: string;
  name?: string | null;
  module?: string | null;
  contact_type?: string | null;
  category?: string | null;
  source_type?: string | null;
  source_page?: string | null;
  source_id?: string | null;
  source_reference?: string | null;
  portal_url?: string | null;
  portal_username?: string | null;
  portal_password?: string | null;
  related_to?: string[] | null;
  assigned_entities?: string[] | null;
  patients?: string[] | null;
  pets?: string[] | null;
  created_by?: string | null;
  owner_id?: string | null;
  shared_with?: string[] | null;
};

type SyncOptions = {
  plainPassword?: string | null | undefined;
  allowDeleteFallback?: boolean;
};

function resolveProviderType(contact: UnifiedContact): 'medical' | 'pet' | 'academic' | null {
  const raw = (
    contact.module ||
    contact.contact_type ||
    contact.source_type ||
    contact.category || ''
  ).toLowerCase();

  if (raw.includes('health') || raw.includes('medical') || raw.includes('doctor')) {
    return 'medical';
  }

  if (raw.includes('pet') || raw.includes('vet')) {
    return 'pet';
  }

  if (raw.includes('academic') || raw.includes('education') || raw.includes('school')) {
    return 'academic';
  }

  return null;
}

async function resolveOwnerAndShared(contact: UnifiedContact): Promise<{
  ownerId: string | null;
  sharedWith: string[];
  relatedFamilyIds: string[];
}> {
  const { resolveFamilyMemberToUser } = await import('@/app/api/_helpers/person-resolver');

  const relatedCollections: Array<string[] | null | undefined> = [
    contact.related_to,
    contact.assigned_entities,
    contact.patients,
    contact.pets,
  ];

  const relatedFamilyIds = Array.from(
    new Set(
      relatedCollections
        .flatMap((value) => (Array.isArray(value) ? value : []))
        .filter((value): value is string => Boolean(value))
    )
  );

  const resolvedUsers: string[] = [];
  for (const familyId of relatedFamilyIds) {
    try {
      const userId = await resolveFamilyMemberToUser(familyId);
      if (userId) {
        resolvedUsers.push(userId);
      }
    } catch (error) {
      console.warn('[ContactPortalSync] Failed to resolve family member to user', { familyId, error });
    }
  }

  let ownerId: string | null = null;
  const sharedWith: string[] = [];

  if (resolvedUsers.length > 0) {
    [ownerId, ...sharedWith] = resolvedUsers;
  }

  if (!ownerId && contact.owner_id) {
    ownerId = contact.owner_id;
  }

  if (!ownerId && contact.created_by) {
    ownerId = contact.created_by;
  }

  if (Array.isArray(contact.shared_with)) {
    for (const userId of contact.shared_with) {
      if (userId && !sharedWith.includes(userId)) {
        sharedWith.push(userId);
      }
    }
  }

  return { ownerId, sharedWith, relatedFamilyIds };
}

function resolveProviderId(contact: UnifiedContact): string | null {
  return contact.source_id || contact.source_reference || contact.id || null;
}

async function getPortalPassword(contact: UnifiedContact, plainOverride?: string | null | undefined): Promise<string | null> {
  if (plainOverride !== undefined) {
    return plainOverride || null;
  }

  if (contact.portal_password) {
    try {
      return decrypt(contact.portal_password);
    } catch (error) {
      console.warn('[ContactPortalSync] Failed to decrypt stored portal password', { contactId: contact.id, error });
      return null;
    }
  }

  return null;
}

export async function syncPortalCredentialsForContact(
  contact: UnifiedContact,
  options: SyncOptions = {}
) {
  if (!contact) return { success: false, reason: 'missing-contact' };

  const providerType = resolveProviderType(contact);
  if (!providerType) {
    return { success: false, reason: 'unsupported-provider-type' };
  }

  const providerId = resolveProviderId(contact);
  if (!providerId) {
    return { success: false, reason: 'missing-provider-id' };
  }

  const portalUrl = contact.portal_url?.trim();
  const portalUsername = contact.portal_username?.trim();
  const portalPassword = await getPortalPassword(contact, options.plainPassword);

  if (!portalUrl || !portalUsername || !portalPassword) {
    if (options.allowDeleteFallback !== false) {
      await deletePortalAndPassword(providerType, providerId);
    }
    return { success: true, action: 'removed' };
  }

  const ownerAndShared = await resolveOwnerAndShared(contact);

  if (!ownerAndShared.ownerId) {
    console.warn('[ContactPortalSync] Unable to determine owner for portal sync', {
      contactId: contact.id,
      providerType,
      providerId,
    });
    return { success: false, reason: 'missing-owner' };
  }

  const result = await ensurePortalAndPassword({
    providerType,
    providerId,
    providerName: contact.name || 'Portal Contact',
    portal_url: portalUrl,
    portal_username: portalUsername,
    portal_password: portalPassword,
    ownerId: ownerAndShared.ownerId,
    sharedWith: ownerAndShared.sharedWith,
    createdBy: contact.created_by || ownerAndShared.ownerId,
    notes: `Synced from contact ${contact.id}`,
    source: providerType,
    sourcePage: contact.source_page || contact.module || providerType,
    entityIds: ownerAndShared.relatedFamilyIds,
  });

  if (!result.success) {
    console.error('[ContactPortalSync] Portal sync failed', {
      contactId: contact.id,
      providerType,
      providerId,
      error: result.error,
    });
    return { success: false, reason: 'sync-failed', error: result.error };
  }

  return { success: true, action: 'synced', portalId: result.portal?.id, passwordId: result.password?.id };
}

export async function deletePortalCredentialsForContact(contact: UnifiedContact) {
  if (!contact) return { success: false, reason: 'missing-contact' };

  const providerType = resolveProviderType(contact);
  const providerId = resolveProviderId(contact);

  if (!providerType || !providerId) {
    return { success: false, reason: 'insufficient-identifiers' };
  }

  const result = await deletePortalAndPassword(providerType, providerId);
  if (!result.success) {
    console.error('[ContactPortalSync] Failed to delete portal/password for contact', {
      contactId: contact.id,
      providerType,
      providerId,
      error: result.error,
    });
  }

  return result;
}
