import 'dotenv/config';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { ensurePortalAndPassword } from '@/lib/services/portal-password-sync';
import { encryptionService } from '@/lib/encryption';
import type { SupabaseClient } from '@supabase/supabase-js';

async function main() {
  const sessionToken = await obtainSessionToken();

  const supabase = await createServiceClient();

  const { data: portals, error } = await supabase
    .from('portals')
    .select('*')
    .in('portal_type', ['medical', 'pet', 'academic']);

  if (error) {
    console.error('[Resync] Failed to fetch portals:', error);
    process.exit(1);
  }

  if (!portals || portals.length === 0) {
    console.log('[Resync] No portals found.');
    return;
  }

  let synced = 0;
  for (const portal of portals) {
    try {
      const providerType = portal.portal_type as 'medical' | 'pet' | 'academic';
      const portalId: string = portal.id;
      const portalName: string = (portal.portal_name || portal.provider_name || 'Portal').trim();
      const portalUrl: string = portal.portal_url || '';
      const portalUsername: string = portal.username || '';

      if (!portal.password || !portalUsername || portal.password.length === 0) {
        console.log(`[Resync] Skipping portal ${portalId} (${portalName}) - missing username/password`);
        continue;
      }

      let plainPassword: string;
      try {
        plainPassword = await encryptionService.decrypt(portal.password, { sessionToken });
      } catch (decryptError) {
        console.warn(`[Resync] Failed to decrypt password for portal ${portalId}:`, decryptError);
        continue;
      }

      const ownerAndShared = await resolvePortalUsers(supabase, portal, providerType);
      if (!ownerAndShared.ownerId) {
        console.warn(`[Resync] Skipping portal ${portalId} (${portalName}) - unable to determine owner`);
        continue;
      }

      const entityIds = await resolveEntityIds(supabase, portal, providerType);

      const notes = typeof portal.notes === 'string' && portal.notes.trim().length > 0
        ? portal.notes.trim()
        : null;

      const providerId = providerType === 'pet'
        ? (portal.entity_id ?? undefined)
        : providerType === 'medical'
          ? (portal.entity_id ?? undefined)
          : undefined;

      await ensurePortalAndPassword({
        providerType,
        providerId,
        providerName: portal.provider_name || portalName,
        portalName,
        portalId,
        portal_url: portalUrl,
        portal_username: portalUsername,
        portal_password: plainPassword,
        ownerId: ownerAndShared.ownerId,
        sharedWith: ownerAndShared.sharedWith,
        createdBy: portal.created_by || ownerAndShared.ownerId,
        notes,
        source: `${providerType}_portal`,
        sourcePage: mapSourcePage(providerType),
        entityIds,
        sessionToken,
        allowServiceClientFallback: true,
      });

      synced += 1;
    } catch (portalError) {
      console.error('[Resync] Failed to resync portal', portal?.id, portalError);
    }
  }

  console.log(`[Resync] Completed. Resynced ${synced} portal records.`);
}

async function obtainSessionToken(): Promise<string> {
  const legacyToken = process.env.ENCRYPTION_SESSION_TOKEN;
  if (legacyToken) {
    console.warn('[Resync] Using legacy ENCRYPTION_SESSION_TOKEN environment variable; consider rotating to the automation credentials flow.');
    return legacyToken;
  }

  const automationEmail = process.env.PORTAL_RESYNC_EMAIL;
  const automationPassword = process.env.PORTAL_RESYNC_PASSWORD;

  if (!automationEmail || !automationPassword) {
    console.error('[Resync] Missing PORTAL_RESYNC_EMAIL or PORTAL_RESYNC_PASSWORD. Add automation user credentials to Bitwarden and regenerate env files.');
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('[Resync] NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required to generate a session token.');
    process.exit(1);
  }

  const supabase = createSupabaseClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: automationEmail,
    password: automationPassword,
  });

  if (error || !data.session?.access_token) {
    console.error('[Resync] Failed to obtain automation session token:', error?.message ?? 'No session returned');
    process.exit(1);
  }

  return data.session.access_token;
}

function mapSourcePage(providerType: 'medical' | 'pet' | 'academic'): string {
  switch (providerType) {
    case 'medical':
      return 'health';
    case 'pet':
      return 'pets';
    case 'academic':
      return 'j3-academics';
    default:
      return providerType;
  }
}

async function resolvePortalUsers(supabase: SupabaseClient, portal: any, providerType: 'medical' | 'pet' | 'academic') {
  const familyMemberIds = new Set<string>();

  if (providerType === 'medical' && Array.isArray(portal.patient_ids)) {
    portal.patient_ids.filter(Boolean).forEach((id: string) => familyMemberIds.add(id));
  }

  if (providerType === 'pet' && portal.entity_id) {
    familyMemberIds.add(String(portal.entity_id));
  }

  if (providerType === 'academic') {
    const { data: childLinks } = await supabase
      .from('j3_academics_portal_children')
      .select('child_id')
      .eq('portal_id', portal.id);
    childLinks?.forEach(link => {
      if (link.child_id) familyMemberIds.add(link.child_id);
    });
  }

  const userIds: string[] = [];
  for (const familyId of familyMemberIds) {
    const userId = await resolveFamilyMemberToUser(supabase, familyId);
    if (userId) userIds.push(userId);
  }

  const ownerId = userIds[0] || portal.created_by || null;
  const sharedWith = ownerId ? userIds.slice(1).filter(id => id !== ownerId) : [];

  return { ownerId, sharedWith };
}

async function resolveEntityIds(supabase: SupabaseClient, portal: any, providerType: 'medical' | 'pet' | 'academic'): Promise<string[]> {
  const ids = new Set<string>();

  if (providerType === 'medical' && Array.isArray(portal.patient_ids)) {
    portal.patient_ids.filter(Boolean).forEach((id: string) => ids.add(id));
  }

  if (providerType === 'pet' && portal.entity_id) {
    ids.add(String(portal.entity_id));
  }

  if (providerType === 'academic') {
    const { data: childLinks } = await supabase
      .from('j3_academics_portal_children')
      .select('child_id')
      .eq('portal_id', portal.id);
    childLinks?.forEach(link => {
      if (link.child_id) ids.add(link.child_id);
    });
  }

  return Array.from(ids);
}

async function resolveFamilyMemberToUser(supabase: SupabaseClient, familyMemberId: string): Promise<string | null> {
  const { data: familyMember } = await supabase
    .from('family_members')
    .select('id, user_id, parent_id, email')
    .eq('id', familyMemberId)
    .maybeSingle();

  if (!familyMember) return null;

  if (familyMember.user_id) return familyMember.user_id;

  if (familyMember.parent_id) {
    const { data: parent } = await supabase
      .from('family_members')
      .select('user_id, email')
      .eq('id', familyMember.parent_id)
      .maybeSingle();
    if (parent?.user_id) return parent.user_id;
  }

  if (familyMember.email) {
    const { data: userByEmail } = await supabase
      .from('users')
      .select('id')
      .ilike('email', familyMember.email)
      .maybeSingle();
    if (userByEmail?.id) return userByEmail.id;
  }

  return null;
}

main().catch((error) => {
  console.error('[Resync] Unhandled error:', error);
  process.exit(1);
});
