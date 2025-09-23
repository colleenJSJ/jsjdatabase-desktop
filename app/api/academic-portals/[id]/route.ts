import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    return NextResponse.json({ ...portal, children: childIds });
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
    const { children, url, ...portalData } = body;

    // Map url to portal_url for database compatibility
    if (url) {
      portalData.portal_url = url;
    }
    
    // Remove child_id from portalData as we'll use junction table
    delete portalData.child_id;

    // Update the portal
    const { data: portal, error: portalError } = await supabase
      .from('j3_academics_portals')
      .update(portalData)
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

    if (portal && portalData.username && portalData.password) {
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

      await ensurePortalAndPassword({
        providerType: 'academic',
        providerId: id,
        providerName: portalData.portal_name || portal.portal_name,
        portal_url: portalData.portal_url || portal.portal_url,
        portal_username: portalData.username,
        portal_password: portalData.password,
        ownerId,
        sharedWith,
        createdBy: user.id,
        notes: portalData.notes || portal.notes,
        source: 'academic_portal'
      });
    }

    return NextResponse.json({ ...portal, children: children || [] });
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
