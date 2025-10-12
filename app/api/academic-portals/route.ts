import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeUrl } from '@/lib/utils/url-helper';
import { encrypt, decrypt } from '@/lib/encryption';
import { setEncryptionSessionToken } from '@/lib/encryption/context';
import { normalizeFamilyMemberId } from '@/lib/constants/family-members';
import { enforceCSRF } from '@/lib/security/csrf';

const serializePortal = async (portal: any, sessionToken: string | null) => {
  if (!portal) return portal;
  let decryptedPassword = portal.password;
  if (typeof portal.password === 'string' && portal.password.length > 0) {
    try {
      decryptedPassword = await decrypt(portal.password, { sessionToken });
    } catch (error) {
      console.error('[Academic Portals API] Failed to decrypt portal password', {
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
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { session } } = await supabase.auth.getSession();
    const sessionToken = session?.access_token ?? null;
    setEncryptionSessionToken(sessionToken);

    const { searchParams } = new URL(request.url);
    const childId = searchParams.get('childId');
    const selectedPerson = searchParams.get('selected_person');
    
    // Use selectedPerson directly as it's already a family_member.id for children
    // Academic portals link to children via family_member.id in j3_academics_portal_children
    const filterChildId = selectedPerson || childId;

    // Use unified portals table with academic type
    let query = supabase
      .from('portals')
      .select('*')
      .eq('portal_type', 'academic')
      .order('portal_name');

    const { data: portals, error } = await query;

    if (error) {
      console.error('Error fetching academic portals:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch children associations for each portal
    if (portals && portals.length > 0) {
      const portalsWithChildren = await Promise.all(
        portals.map(async (portal) => {
          const { data: children } = await supabase
            .from('j3_academics_portal_children')
            .select('child_id')
            .eq('portal_id', portal.id);
          
          const childIds = children?.map(c => c.child_id) || [];
          
          // Filter by childId if specified (from either childId or selected_person)
          if (filterChildId && filterChildId !== 'all' && !childIds.includes(filterChildId)) {
            return null;
          }
          
          const serialized = await serializePortal(portal, sessionToken);
          return {
            ...serialized,
            children: childIds
          };
        })
      );
      
      // Filter out null values (portals that don't match the childId filter)
      const filteredPortals = portalsWithChildren.filter(p => p !== null);
      return NextResponse.json({ portals: filteredPortals });
    }

    return NextResponse.json({ portals: [] });
  } catch (error) {
    console.error('Error in GET /api/academic-portals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { session } } = await supabase.auth.getSession();
    const sessionToken = session?.access_token ?? null;
    setEncryptionSessionToken(sessionToken);

    const body = await request.json();
    const { children, url, title, username, password, notes } = body;
    const selectedChildIds: string[] = Array.isArray(children)
      ? Array.from(
          new Set(
            children.filter((childId: unknown): childId is string =>
              typeof childId === 'string' && childId.trim().length > 0
            )
          )
        )
      : [];
    const normalizedChildIds: string[] = selectedChildIds.length > 0
      ? Array.from(
          new Set(
            selectedChildIds
              .map(childId => normalizeFamilyMemberId(childId).trim())
              .filter((childId): childId is string => childId.length > 0)
          )
        )
      : [];
    const portalUrl = url ? normalizeUrl(url) : '';
    const sanitizedNotes = typeof notes === 'string' && notes.trim().length > 0
      ? notes.trim()
      : null;

    // Insert the portal into unified portals table
    const encryptedPassword = password ? await encrypt(password, { sessionToken }) : null;

    const { data: portal, error: portalError } = await supabase
      .from('portals')
      .insert({
        portal_name: title,
        provider_name: title,
        portal_url: portalUrl,
        username,
        password: encryptedPassword,
        notes: sanitizedNotes,
        portal_type: 'academic',
        created_by: user.id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (portalError) {
      console.error('Error creating academic portal:', portalError);
      return NextResponse.json({ error: portalError.message }, { status: 500 });
    }

    // Add children associations
    if (portal && normalizedChildIds.length > 0) {
      const childRecords = normalizedChildIds.map((childId) => ({
        portal_id: portal.id,
        child_id: childId
      }));

      const { error: childError } = await supabase
        .from('j3_academics_portal_children')
        .insert(childRecords);

      if (childError) {
        console.error('Error adding portal children:', childError);
      }
    }

    // Sync portal credentials to passwords table using the better sync function
    if (portal && password) {
      const { ensurePortalAndPassword } = await import('@/lib/services/portal-password-sync');
      const { resolveFamilyMemberToUser } = await import('@/app/api/_helpers/person-resolver');
      
      // For academic portals, children are the "patients"
      // Convert child IDs (family member IDs) to their parent's user IDs
      const parentUserIds: string[] = [];
      
      // Get parents of the children
      if (normalizedChildIds.length > 0) {
        for (const childId of normalizedChildIds) {
          // Get the child's parent information
          const { data: childData } = await supabase
            .from('family_members')
            .select('parent_id')
            .eq('id', childId)
            .single();
          
          if (childData?.parent_id) {
            // Convert parent family member ID to user ID
            const parentUserId = await resolveFamilyMemberToUser(childData.parent_id);
            if (parentUserId && !parentUserIds.includes(parentUserId)) {
              parentUserIds.push(parentUserId);
            }
          }
        }
      }
      
      // If no parents found, use current user
      const ownerId = parentUserIds[0] || user.id;
      const sharedWith = parentUserIds.slice(1);
      
      console.log('[Academic Portals API] Syncing portal to password:', {
        portal_id: portal.id,
        children: normalizedChildIds,
        owner: ownerId,
        shared: sharedWith
      });

      const syncResult = await ensurePortalAndPassword({
        providerType: 'academic',
        providerId: undefined, // academic portals link via children only
        providerName: title,
        portalName: title,
        portalId: portal.id,
        portal_url: portalUrl,
        portal_username: username,
        portal_password: password,
        ownerId,
        sharedWith,
        createdBy: user.id,
        notes: sanitizedNotes,
        source: 'academic_portal',
        sourcePage: 'j3-academics',
        entityIds: normalizedChildIds,
        sessionToken,
      });
      
      if (!syncResult.success) {
        console.error('[Academic Portals API] Failed to sync password:', syncResult.error);
        // Don't fail the portal creation, just log the error
      }
    }

    const serializedPortal = await serializePortal(portal, sessionToken);
    return NextResponse.json({ ...serializedPortal, children: normalizedChildIds });
  } catch (error) {
    console.error('Error in POST /api/academic-portals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
