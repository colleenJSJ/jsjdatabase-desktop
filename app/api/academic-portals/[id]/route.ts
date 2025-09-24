import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeUrl } from '@/lib/utils/url-helper';
import { encrypt, decrypt } from '@/lib/encryption';

const serializePortal = (portal: any) => {
  if (!portal) return portal;
  let decryptedPassword = portal.password;
  if (typeof portal.password === 'string' && portal.password.length > 0) {
    try {
      decryptedPassword = decrypt(portal.password);
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: portal, error } = await supabase
      .from('j3_academics_portals')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching academic portal:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch children associations
    const { data: children } = await supabase
      .from('j3_academics_portal_children')
      .select('child_id')
      .eq('portal_id', id);
    
    const childIds = children?.map(c => c.child_id) || [];

    return NextResponse.json({ ...serializePortal(portal), children: childIds });
  } catch (error) {
    console.error('Error in GET /api/academic-portals/[id]:', error);
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
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { children, url, title, username, password, notes } = body;

    // Map url to portal_url for database compatibility
    const portalUrl = url ? normalizeUrl(url) : undefined;
    // Update the portal
    const updates: Record<string, unknown> = {
      portal_name: title,
      username,
      notes,
      updated_at: new Date().toISOString()
    };

    if (password !== undefined) {
      updates.password = password ? encrypt(password) : null;
    }

    if (portalUrl !== undefined) {
      updates.portal_url = portalUrl;
    }

    const { data: portal, error: portalError } = await supabase
      .from('j3_academics_portals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (portalError) {
      console.error('Error updating academic portal:', portalError);
      return NextResponse.json({ error: portalError.message }, { status: 500 });
    }

    // Update children associations
    // First, delete existing associations
    await supabase
      .from('j3_academics_portal_children')
      .delete()
      .eq('portal_id', id);

    // Then add new associations
    if (children && children.length > 0) {
      const childRecords = children.map((childId: string) => ({
        portal_id: id,
        child_id: childId
      }));

      const { error: childError } = await supabase
        .from('j3_academics_portal_children')
        .insert(childRecords);

      if (childError) {
        console.error('Error updating portal children:', childError);
      }
    }

    if (portal && username && password) {
      const { ensurePortalAndPassword } = await import('@/lib/services/portal-password-sync');
      const { resolveFamilyMemberToUser } = await import('@/app/api/_helpers/person-resolver');

      const parentUserIds: string[] = [];

      if (children && children.length > 0) {
        for (const childId of children) {
          const { data: childData } = await supabase
            .from('family_members')
            .select('parent_id')
            .eq('id', childId)
            .single();

          if (childData?.parent_id) {
            const parentUserId = await resolveFamilyMemberToUser(childData.parent_id);
            if (parentUserId && !parentUserIds.includes(parentUserId)) {
              parentUserIds.push(parentUserId);
            }
          }
        }
      }

      const ownerId = parentUserIds[0] || user.id;
      const sharedWith = parentUserIds.slice(1);
      const childIds = Array.isArray(children) ? children.filter((childId: string) => Boolean(childId)) : [];

      await ensurePortalAndPassword({
        providerType: 'academic',
        providerId: id,
        providerName: title || portal.portal_name,
        portal_url: portalUrl || portal.portal_url,
        portal_username: username,
        portal_password: password,
        ownerId,
        sharedWith,
        createdBy: user.id,
        notes: notes || portal.notes,
        source: 'academic_portal',
        sourcePage: 'j3-academics',
        entityIds: childIds
      });
    }

    return NextResponse.json({ ...serializePortal(portal), children: children || [] });
  } catch (error) {
    console.error('Error in PUT /api/academic-portals/[id]:', error);
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
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete associated password entry if exists
    await supabase
      .from('passwords')
      .delete()
      .eq('source_reference', id)
      .eq('source_page', 'J3 Academics');

    // Delete the portal
    const { error } = await supabase
      .from('j3_academics_portals')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting academic portal:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/academic-portals/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
