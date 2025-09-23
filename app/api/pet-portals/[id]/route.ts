import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensurePortalAndPassword } from '@/lib/services/portal-password-sync';
import { resolveFamilyMemberToUser } from '@/app/api/_helpers/person-resolver';
import { normalizeUrl } from '@/lib/utils/url-helper';
import { encrypt, decrypt } from '@/lib/encryption';

const serializePortal = (portal: any) => {
  if (!portal) return portal;
  let decryptedPassword = portal.password;
  if (typeof portal.password === 'string' && portal.password.length > 0) {
    try {
      decryptedPassword = decrypt(portal.password);
    } catch (error) {
      console.error('[Pet Portals API] Failed to decrypt portal password', {
        portalId: portal.id,
        error,
      });
      decryptedPassword = null;
    }
  }

  return {
    ...portal,
    password: decryptedPassword,
  };
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();

    const { data: portal, error } = await supabase
      .from('portals')
      .select('*')
      .eq('id', id)
      .eq('portal_type', 'pet')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!portal) {
      return NextResponse.json({ error: 'Portal not found' }, { status: 404 });
    }
    return NextResponse.json({ portal: serializePortal(portal) });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch pet portal' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { title, petId, username, password, url, notes } = body;

    // Get auth user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (title !== undefined) {
      updates.portal_name = title;
      updates.provider_name = title;
    }
    if (petId !== undefined) updates.entity_id = petId || null;
    if (username !== undefined) updates.username = username || null;
    if (notes !== undefined) updates.notes = notes || null;

    let normalizedUrl: string | null | undefined;
    if (url !== undefined) {
      normalizedUrl = url ? normalizeUrl(url) : null;
      updates.portal_url = normalizedUrl;
    }

    let plainPassword: string | null | undefined = undefined;
    if (password !== undefined) {
      plainPassword = password;
      updates.password = password ? encrypt(password) : null;
    }

    const { data: portal, error } = await supabase
      .from('portals')
      .update(updates)
      .eq('id', id)
      .eq('portal_type', 'pet')
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!portal) {
      return NextResponse.json({ error: 'Portal not found' }, { status: 404 });
    }

    // Sync credentials to Passwords if changed/present
    const ownerUserIds: string[] = [];
    if (portal.entity_id) {
      const { data: petData } = await supabase
        .from('family_members')
        .select('parent_id')
        .eq('id', portal.entity_id)
        .eq('type', 'pet')
        .single();

      if (petData?.parent_id) {
        const ownerUserId = await resolveFamilyMemberToUser(petData.parent_id);
        if (ownerUserId) ownerUserIds.push(ownerUserId);
      }
    }

    const ownerId = ownerUserIds[0] || user.id;
    const sharedWith = ownerUserIds.slice(1);

    let portalPassword = plainPassword ?? null;
    if (portalPassword == null && portal.password) {
      try {
        portalPassword = decrypt(portal.password as string);
      } catch (error) {
        console.error('[Pet Portals] Failed to decrypt existing password', error);
      }
    }

    if (portalPassword) {
      await ensurePortalAndPassword({
        providerType: 'pet',
        providerId: portal.entity_id || portal.id,
        providerName: (title ?? portal.portal_name) || portal.provider_name,
        portal_url: normalizedUrl ?? portal.portal_url ?? '',
        portal_username: (username ?? portal.username) || '',
        portal_password: portalPassword,
        ownerId,
        sharedWith,
        createdBy: user.id,
        notes: notes ?? portal.notes ?? `Portal for ${(title ?? portal.portal_name) || portal.provider_name}`,
        source: 'pet_portal',
        sourcePage: 'pets'
      });
    }

    return NextResponse.json({ portal: serializePortal(portal) });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update pet portal' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('portals')
      .delete()
      .eq('id', id)
      .eq('portal_type', 'pet');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete pet portal' }, { status: 500 });
  }
}
