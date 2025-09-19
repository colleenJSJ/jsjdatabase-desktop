import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensurePortalAndPassword } from '@/lib/services/portal-password-sync';
import { resolveFamilyMemberToUser } from '@/app/api/_helpers/person-resolver';

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
    return NextResponse.json({ portal });
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

    // Get auth user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Update unified portal
    const { data: portal, error } = await supabase
      .from('portals')
      .update({
        portal_name: body.portal_name ?? body.provider_name,
        portal_url: body.portal_url,
        username: body.username,
        password: body.password,
        provider_name: body.provider_name,
        entity_id: body.pet_id || body.entity_id,
        notes: body.notes,
        updated_at: new Date().toISOString()
      })
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
    if (portal.username || portal.password || portal.portal_url) {
      try {
        // Determine owner shared mapping: use pet's parent owner if resolvable
        let ownerId = user.id;
        let sharedWith: string[] = [];
        // If portal has patient_ids, convert family members to user ids
        if (Array.isArray(portal.patient_ids) && portal.patient_ids.length > 0) {
          const userIds: string[] = [];
          for (const fmId of portal.patient_ids) {
            const u = await resolveFamilyMemberToUser(String(fmId));
            if (u) userIds.push(u);
          }
          ownerId = userIds[0] || user.id;
          sharedWith = userIds.slice(1);
        }

        await ensurePortalAndPassword({
          providerType: 'pet',
          providerId: portal.entity_id || portal.id,
          providerName: portal.portal_name || portal.provider_name,
          portal_url: portal.portal_url,
          portal_username: portal.username,
          portal_password: portal.password,
          ownerId,
          sharedWith,
          createdBy: user.id,
          notes: portal.notes || `Portal for ${portal.portal_name}`,
          source: 'pet_portal'
        });
      } catch (e) {
        console.error('[Pet Portals] ensurePortalAndPassword failed:', e);
      }
    }

    return NextResponse.json({ portal });
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
