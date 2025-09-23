import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensurePortalAndPassword, deletePortalAndPassword } from '@/lib/services/portal-password-sync';
import { normalizeUrl } from '@/lib/utils/url-helper';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the portal from unified portals table
    const { data: portal, error } = await supabase
      .from('portals')
      .select(`
        *,
        doctor:doctors!entity_id(id, name, specialty)
      `)
      .eq('id', id)
      .eq('portal_type', 'medical')
      .single();

    if (error || !portal) {
      return NextResponse.json({ error: 'Portal not found' }, { status: 404 });
    }

    // Check if user has access to this portal
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = userData?.role === 'admin';
    const isPatient = portal.patient_ids?.includes(user.id);
    const isCreator = portal.created_by === user.id;

    if (!isAdmin && !isPatient && !isCreator) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ portal });
  } catch (error) {
    console.error('Error in GET /api/medical-portals/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { title, doctorId, username, password, url, notes, patientIds } = body;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (title !== undefined) updates.portal_name = title;
    if (doctorId !== undefined) updates.entity_id = doctorId || null;
    if (username !== undefined) updates.username = username || null;
    if (notes !== undefined) updates.notes = notes || null;
    if (patientIds !== undefined) updates.patient_ids = patientIds;

    let normalizedUrl: string | null | undefined;
    if (url !== undefined) {
      normalizedUrl = url ? normalizeUrl(url) : null;
      updates.portal_url = normalizedUrl;
    }

    let plainPassword: string | null | undefined = undefined;
    if (password !== undefined) {
      plainPassword = password;
      updates.password = password
        ? await (async () => {
            const { encrypt } = await import('@/lib/encryption');
            return encrypt(password);
          })()
        : null;
    }

    const { data: portal, error: updateError } = await supabase
      .from('portals')
      .update(updates)
      .eq('id', id)
      .eq('portal_type', 'medical')
      .select(`
        *,
        doctor:doctors!entity_id(id, name, specialty)
      `)
      .single();

    if (updateError) {
      console.error('Error updating medical portal:', updateError);
      return NextResponse.json({ error: 'Failed to update portal' }, { status: 500 });
    }

    if (!portal) {
      return NextResponse.json({ error: 'Portal not found' }, { status: 404 });
    }

    if (portal) {
      const { resolveFamilyMemberToUser } = await import('@/app/api/_helpers/person-resolver');
      const patientUserIds: string[] = [];
      if (Array.isArray(portal.patient_ids)) {
        for (const fm of portal.patient_ids) {
          const u = await resolveFamilyMemberToUser(String(fm));
          if (u) patientUserIds.push(u);
        }
      }

      const ownerId = patientUserIds[0] || user.id;
      const sharedWith = patientUserIds.slice(1);

      let portalPassword = plainPassword ?? null;
      if (portalPassword == null && portal.password) {
        try {
          const { decrypt } = await import('@/lib/encryption');
          portalPassword = decrypt(portal.password);
        } catch (error) {
          console.error('[Medical Portals] Failed to decrypt existing password', error);
        }
      }

      if (portalPassword && (username || portal.username || plainPassword !== undefined || normalizedUrl !== undefined)) {
        await ensurePortalAndPassword({
          providerType: 'medical',
          providerId: portal.entity_id || portal.id,
          providerName: title ?? portal.portal_name,
          portal_url: normalizedUrl ?? portal.portal_url,
          portal_username: (username ?? portal.username) || '',
          portal_password: portalPassword,
          ownerId,
          sharedWith,
          createdBy: user.id,
          notes: notes ?? portal.notes ?? `Portal for ${title ?? portal.portal_name}`,
          source: 'medical_portal'
        });
      }
    }

    return NextResponse.json({ portal });
  } catch (error) {
    console.error('Error in PUT /api/medical-portals/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    // Load the portal to determine related provider (entity_id)
    const { data: existingPortal } = await supabase
      .from('portals')
      .select('id, entity_id')
      .eq('id', id)
      .eq('portal_type', 'medical')
      .single();

    // Best-effort cleanup of associated portals/passwords for this provider
    if (existingPortal?.entity_id) {
      try {
        await deletePortalAndPassword('medical', String(existingPortal.entity_id));
      } catch (e) {
        console.warn('[Medical Portals API] Provider cleanup warning:', e);
      }
    }

    // Also remove any password entries directly linked to this portal record
    try {
      await supabase
        .from('passwords')
        .delete()
        .eq('source', 'medical_portal')
        .eq('source_reference', id);
    } catch (e) {
      console.warn('[Medical Portals API] Direct password cleanup warning:', e);
    }

    // Delete the portal from unified portals table
    const { error: deleteError } = await supabase
      .from('portals')
      .delete()
      .eq('id', id)
      .eq('portal_type', 'medical');

    if (deleteError) {
      console.error('Error deleting medical portal:', deleteError);
      return NextResponse.json({ error: 'Failed to delete portal' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/medical-portals/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
