import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensurePortalAndPassword, deletePortalById } from '@/lib/services/portal-password-sync';
import { normalizeUrl } from '@/lib/utils/url-helper';
import { decrypt } from '@/lib/encryption';

const serializePortal = (portal: any) => {
  if (!portal) return portal;
  let decryptedPassword = portal.password;
  if (typeof portal.password === 'string' && portal.password.length > 0) {
    try {
      decryptedPassword = decrypt(portal.password);
    } catch (error) {
      console.error('[Medical Portals API] Failed to decrypt portal password', {
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

    return NextResponse.json({ portal: serializePortal(portal) });
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

    const notesProvided = Object.prototype.hasOwnProperty.call(body, 'notes');
    const sanitizedNotes = typeof notes === 'string' && notes.trim().length > 0
      ? notes.trim()
      : notesProvided
        ? null
        : undefined;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (title !== undefined) {
      updates.portal_name = title;
      updates.provider_name = title;
    }
    if (doctorId !== undefined) updates.entity_id = doctorId || null;
    if (username !== undefined) updates.username = username || null;
    if (sanitizedNotes !== undefined) updates.notes = sanitizedNotes;
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
      const patientFamilyIds = Array.isArray(portal.patient_ids)
        ? (portal.patient_ids as string[]).filter((id): id is string => Boolean(id))
        : [];

      let portalPassword = plainPassword ?? null;
      if (portalPassword == null && portal.password) {
        try {
          const { decrypt } = await import('@/lib/encryption');
          portalPassword = decrypt(portal.password);
        } catch (error) {
          console.error('[Medical Portals] Failed to decrypt existing password', error);
        }
      }

      if (portalPassword && (username || portal.username || plainPassword !== undefined || normalizedUrl !== undefined || sanitizedNotes !== undefined)) {
        await ensurePortalAndPassword({
          providerType: 'medical',
          providerId: doctorId ?? portal.entity_id ?? undefined,
          providerName: title ?? portal.portal_name,
          portalName: title ?? portal.portal_name,
          portalId: portal.id,
          portal_url: normalizedUrl ?? portal.portal_url,
          portal_username: (username ?? portal.username) || '',
          portal_password: portalPassword,
          ownerId,
          sharedWith,
          createdBy: user.id,
          notes: sanitizedNotes,
          source: 'medical_portal',
          sourcePage: 'health',
          entityIds: patientFamilyIds
        });
      }
    }

    return NextResponse.json({ portal: serializePortal(portal) });
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

    const serviceSupabase = await createServiceClient();
    const { data: existingPortal, error: portalError } = await serviceSupabase
      .from('portals')
      .select('id, entity_id')
      .eq('id', id)
      .eq('portal_type', 'medical')
      .maybeSingle();

    if (portalError) {
      console.error('Error fetching medical portal for deletion:', portalError);
      return NextResponse.json({ error: 'Failed to delete portal' }, { status: 500 });
    }

    if (!existingPortal) {
      return NextResponse.json({ error: 'Portal not found' }, { status: 404 });
    }

    const result = await deletePortalById(id);

    if (!result.deletedPortal) {
      return NextResponse.json({ error: 'Portal not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedPasswords: result.deletedPasswords });
  } catch (error) {
    console.error('Error in DELETE /api/medical-portals/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
