import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeUrl } from '@/lib/utils/url-helper';
import { encrypt } from '@/lib/encryption';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const petId = searchParams.get('petId');
    const selectedPerson = searchParams.get('selected_person');
    
    // Use selectedPerson directly as it's already a family_member.id for pets
    // Pet portals link via entity_id which points to family_member.id for pets
    const filterPetId = selectedPerson || petId;
    
    // Note: Removed is_active filter as portals table may not have this column
    // Also simplified select to avoid potential join issues
    let query = supabase
      .from('portals')
      .select('*')
      .eq('portal_type', 'pet')
      .order('portal_name', { ascending: true });

    if (filterPetId) {
      query = query.eq('entity_id', filterPetId);
    }

    const { data: portals, error } = await query;

    if (error) {
      console.error('[Pet Portals] Error fetching portals:', {
        code: error.code,
        message: error.message,
        details: error.details
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ portals: portals || [] });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch pet portals' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { title, petId, username, password, url, notes } = body;

    if (!title || !petId) {
      return NextResponse.json({ error: 'Portal name and pet are required' }, { status: 400 });
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedUrl = url ? normalizeUrl(url) : null;
    const encryptedPassword = password ? encrypt(password) : null;

    const portalData = {
      portal_type: 'pet',
      portal_name: title,
      portal_url: normalizedUrl,
      entity_id: petId,
      username: username || null,
      password: encryptedPassword,
      provider_name: title,
      notes: notes || null,
      created_by: user.id,
    };

    const { data: portal, error } = await supabase
      .from('portals')
      .insert(portalData)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Sync portal credentials to passwords table using the shared helper
    if (portal && password) {
      const { ensurePortalAndPassword } = await import('@/lib/services/portal-password-sync');
      const { resolveFamilyMemberToUser } = await import('@/app/api/_helpers/person-resolver');
      
      // For pet portals, the pet_id is a family member ID for the pet
      // We need to find the pet's owner(s)
      let petOwnerUserIds: string[] = [];
      
      if (petId) {
        // Get the pet's parent (owner) information
        const { data: petData } = await supabase
          .from('family_members')
          .select('parent_id')
          .eq('id', petId)
          .eq('type', 'pet')
          .single();
        
        if (petData?.parent_id) {
          // Convert owner family member ID to user ID
          const ownerUserId = await resolveFamilyMemberToUser(petData.parent_id);
          if (ownerUserId) {
            petOwnerUserIds.push(ownerUserId);
          }
        }
        
        // Also check if there are multiple owners (shared pets)
        // This might need additional logic depending on your schema
      }
      
      // If no owner found, use current user
      const ownerId = petOwnerUserIds[0] || user.id;
      const sharedWith = petOwnerUserIds.slice(1);
      
      const syncResult = await ensurePortalAndPassword({
        providerType: 'pet',
        providerId: portal.id,
        providerName: title,
        portal_url: normalizedUrl || '',
        portal_username: username || '',
        portal_password: password,
        ownerId,
        sharedWith,
        createdBy: user.id,
        notes: notes || `Pet portal for ${title}`,
        source: 'pet_portal',
        sourcePage: 'pets'
      });
      
      if (!syncResult.success) {
        console.error('[Pet Portals API] Failed to sync password:', syncResult.error);
        // Don't fail the portal creation, just log the error
      }
    }

    return NextResponse.json({ portal });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create pet portal' },
      { status: 500 }
    );
  }
}
