import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
          
          return {
            ...portal,
            children: childIds
          };
        })
      );
      
      // Filter out null values (portals that don't match the childId filter)
      const filteredPortals = portalsWithChildren.filter(p => p !== null);
      return NextResponse.json(filteredPortals);
    }

    return NextResponse.json([]);
  } catch (error) {
    console.error('Error in GET /api/academic-portals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { syncToPasswords, children, url, ...portalData } = body;

    // Map url to portal_url for database compatibility
    if (url) {
      portalData.portal_url = url;
    }
    
    // Remove child_id from portalData as we'll use junction table
    delete portalData.child_id;

    // Insert the portal into unified portals table
    const { data: portal, error: portalError } = await supabase
      .from('portals')
      .insert({
        ...portalData,
        portal_type: 'academic',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (portalError) {
      console.error('Error creating academic portal:', portalError);
      return NextResponse.json({ error: portalError.message }, { status: 500 });
    }

    // Add children associations
    if (portal && children && children.length > 0) {
      const childRecords = children.map((childId: string) => ({
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
    if (portal && (portalData.username && portalData.password)) {
      const { ensurePortalAndPassword } = await import('@/lib/services/portal-password-sync');
      const { resolveFamilyMemberToUser } = await import('@/app/api/_helpers/person-resolver');
      
      // For academic portals, children are the "patients"
      // Convert child IDs (family member IDs) to their parent's user IDs
      const parentUserIds: string[] = [];
      
      // Get parents of the children
      if (children && children.length > 0) {
        for (const childId of children) {
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
        children: children,
        owner: ownerId,
        shared: sharedWith
      });
      
      const syncResult = await ensurePortalAndPassword({
        providerType: 'academic',
        providerId: portal.id,
        providerName: portal.portal_name,
        portal_url: portal.portal_url,
        portal_username: portal.username,
        portal_password: portal.password,
        ownerId,
        sharedWith,
        createdBy: user.id,
        notes: portal.notes || `Academic portal for ${portal.portal_name}`,
        source: 'academic_portal'
      });
      
      if (!syncResult.success) {
        console.error('[Academic Portals API] Failed to sync password:', syncResult.error);
        // Don't fail the portal creation, just log the error
      }
    }

    return NextResponse.json({ ...portal, children: children || [] });
  } catch (error) {
    console.error('Error in POST /api/academic-portals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
