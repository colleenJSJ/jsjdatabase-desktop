import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveFamilyMemberToUser, resolveCurrentUserToFamilyMember } from '@/app/api/_helpers/person-resolver';
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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Handle person filtering
    const searchParams = request.nextUrl.searchParams;
    let selectedPerson = searchParams.get('selected_person');
    
    // Normalize 'me' to current user's family_member.id
    if (selectedPerson === 'me') {
      const familyMemberId = await resolveCurrentUserToFamilyMember(user.id);
      selectedPerson = familyMemberId;
    }
    
    // Fetch medical portals from unified portals table
    // Note: Removed doctor join as entity_id is not a FK to doctors table
    // Doctor info can be fetched separately if needed
    let query = supabase
      .from('portals')
      .select('*')
      .eq('portal_type', 'medical')
      .order('portal_name', { ascending: true });

    // Apply person filter if provided
    if (selectedPerson) {
      const userId = await resolveFamilyMemberToUser(selectedPerson);
      if (userId) {
        query = query.contains('patient_ids', [userId]);
      }
    } else if (userData.role !== 'admin') {
      // If not admin and no person selected, filter by current user
      query = query.contains('patient_ids', [user.id]);
    }

    const { data: portals, error } = await query;

    if (error) {
      console.error('Error fetching medical portals:', error);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { logRlsDenied } = await import('@/lib/utils/db-telemetry');
          await logRlsDenied({ userId: user.id, error, endpoint: '/api/medical-portals', entityType: 'portal', page: 'health' });
        }
      } catch {}
      return NextResponse.json({ error: 'Failed to fetch portals' }, { status: 500 });
    }

    return NextResponse.json({ portals: (portals || []).map(serializePortal) });
  } catch (error) {
    console.error('Error in GET /api/medical-portals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    if (!title) {
      return NextResponse.json({ error: 'Portal name is required' }, { status: 400 });
    }

    const normalizedUrl = url ? normalizeUrl(url) : null;
    const encryptedPassword = password
      ? await (async () => {
          const { encrypt } = await import('@/lib/encryption');
          return encrypt(password);
        })()
      : null;

    const portalData = {
      portal_type: 'medical',
      portal_name: title,
      provider_name: title,
      portal_url: normalizedUrl,
      entity_id: doctorId || null,
      username: username || null,
      password: encryptedPassword,
      notes: notes || null,
      patient_ids: patientIds || [],
      created_by: user.id
    };

    // Insert portal into unified portals table
    const { data: portal, error: insertError } = await supabase
      .from('portals')
      .insert(portalData)
      .select('*')
      .single();

    if (insertError) {
      console.error('Error creating medical portal:', insertError);
      try {
        const { logRlsDenied } = await import('@/lib/utils/db-telemetry');
        await logRlsDenied({ userId: user.id, error: insertError, endpoint: '/api/medical-portals', entityType: 'portal', page: 'health' });
      } catch {}
      return NextResponse.json({ error: 'Failed to create portal' }, { status: 500 });
    }

    // Sync portal credentials to passwords table using the better sync function
    if (portal && username && password) {
      const { ensurePortalAndPassword } = await import('@/lib/services/portal-password-sync');
      const { resolveFamilyMemberToUser } = await import('@/app/api/_helpers/person-resolver');
      
      // Convert patient_ids (family member IDs) to user IDs
      const patientUserIds: string[] = [];
      for (const patientId of (portal.patient_ids || [])) {
        const userId = await resolveFamilyMemberToUser(patientId);
        if (userId) {
          patientUserIds.push(userId);
        }
      }
      
      const patientFamilyIds = Array.isArray(portal.patient_ids)
        ? (portal.patient_ids as string[]).filter((id): id is string => Boolean(id))
        : [];

      // First patient becomes owner, rest are shared_with
      const ownerId = patientUserIds[0] || user.id;
      const sharedWith = patientUserIds.slice(1);
      
      console.log('[Medical Portals API] Syncing portal to password:', {
        portal_id: portal.id,
        owner: ownerId,
        shared: sharedWith
      });
      
      const syncResult = await ensurePortalAndPassword({
        providerType: 'medical',
        providerId: portal.entity_id || portal.id,
        providerName: title,
        portal_url: normalizedUrl || portal.portal_url,
        portal_username: username,
        portal_password: password,
        ownerId,
        sharedWith,
        createdBy: user.id,
        notes: notes || portal.notes || `Portal for ${title}`,
        source: 'medical_portal',
        sourcePage: 'health',
        entityIds: patientFamilyIds
      });
      
      if (!syncResult.success) {
        console.error('[Medical Portals API] Failed to sync password:', syncResult.error);
        // Don't fail the portal creation, just log the error
      }
    }

    return NextResponse.json({ portal: serializePortal(portal) }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/medical-portals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
