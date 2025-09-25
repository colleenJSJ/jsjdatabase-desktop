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
      .from('portals')
      .select('*')
      .eq('id', id)
      .eq('portal_type', 'academic')
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
    const selectedChildIds: string[] = Array.isArray(children)
      ? Array.from(
          new Set(
            children.filter((childId: unknown): childId is string =>
              typeof childId === 'string' && childId.trim().length > 0
            )
          )
        )
      : [];

    const notesProvided = Object.prototype.hasOwnProperty.call(body, 'notes');
    const sanitizedNotes = typeof notes === 'string' && notes.trim().length > 0
      ? notes.trim()
      : notesProvided
        ? null
        : undefined;

    // Map url to portal_url for database compatibility
    const portalUrl = url ? normalizeUrl(url) : undefined;
    // Update the portal
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (title !== undefined) {
      updates.portal_name = title;
      updates.provider_name = title;
    }

    if (username !== undefined) {
      updates.username = username || null;
    }

    if (sanitizedNotes !== undefined) {
      updates.notes = sanitizedNotes;
    }

    if (password !== undefined) {
      updates.password = password ? encrypt(password) : null;
    }

    if (portalUrl !== undefined) {
      updates.portal_url = portalUrl;
    }

    const { data: portal, error: portalError } = await supabase
      .from('portals')
      .update(updates)
      .eq('id', id)
      .eq('portal_type', 'academic')
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
    if (selectedChildIds.length > 0) {
      const childRecords = selectedChildIds.map((childId) => ({
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

      if (selectedChildIds.length > 0) {
        for (const childId of selectedChildIds) {
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
      const childIds = selectedChildIds;

      await ensurePortalAndPassword({
        providerType: 'academic',
        providerId: undefined,
        providerName: title || portal.portal_name,
        portalName: title || portal.portal_name,
        portalId: portal.id,
        portal_url: portalUrl || portal.portal_url,
        portal_username: username,
        portal_password: password,
        ownerId,
        sharedWith,
        createdBy: user.id,
        notes: sanitizedNotes,
        source: 'academic_portal',
        sourcePage: 'j3-academics',
        entityIds: childIds
      });
    }

    return NextResponse.json({ ...serializePortal(portal), children: selectedChildIds });
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

    const { deletePortalById } = await import('@/lib/services/portal-password-sync');
    const result = await deletePortalById(id);

    if (!result.deletedPortal) {
      return NextResponse.json({ error: 'Portal not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedPasswords: result.deletedPasswords });
  } catch (error) {
    console.error('Error in DELETE /api/academic-portals/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
