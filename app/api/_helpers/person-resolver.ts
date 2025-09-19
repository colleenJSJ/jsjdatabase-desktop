import { createClient } from '@/lib/supabase/server';

export interface PersonReferenceInput {
  id?: string;
  name?: string;
  uuid?: string;
}

async function resolveSingleReference(ref: string): Promise<string | null> {
  try {
    console.log('[Person Resolver] Resolving single reference:', ref);
    const supabase = await createClient();
    
    // Check if it's already a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(ref)) {
      console.log('[Person Resolver] Reference is a UUID, verifying existence...');
      // Verify the UUID exists in family_members
      const { data, error } = await supabase
        .from('family_members')
        .select('id')
        .eq('id', ref)
        .single();
      
      if (error) {
        console.log('[Person Resolver] UUID not found in family_members, checking users:', error.message);
        // Fallback: if this UUID is a users.id, map it to the corresponding family_member.id
        const { data: userRow } = await supabase
          .from('users')
          .select('id')
          .eq('id', ref)
          .single();
        if (userRow?.id) {
          // Try to resolve this user to a family member id
          const fmId = await resolveCurrentUserToFamilyMember(userRow.id);
          if (fmId) {
            console.log('[Person Resolver] Mapped user UUID to family_member:', fmId);
            return fmId;
          }
        }
        return null;
      }
      
      return data ? ref : null;
    }
    
    // Try to resolve as a name (with fuzzy matching)
    console.log('[Person Resolver] Trying to resolve as name with fuzzy matching...');
    const { data, error } = await supabase
      .from('family_members')
      .select('id')
      .or(`name.ilike.%${ref}%,display_name.ilike.%${ref}%`)
      .single();
    
    if (error) {
      console.log('[Person Resolver] Name not found in family_members:', error.message);
      return null;
    }
    
    console.log('[Person Resolver] Resolved to ID:', data?.id);
    return data?.id || null;
  } catch (error) {
    console.error('[Person Resolver] Error in resolveSingleReference:', error);
    throw error;
  }
}

export async function resolvePersonReferences(
  input: string | string[] | PersonReferenceInput | PersonReferenceInput[] | null | undefined
): Promise<string | string[] | null> {
  if (!input) return null;

  if (Array.isArray(input)) {
    const resolved = await Promise.all(input.map(item => resolvePersonReferences(item)));
    return resolved.filter(Boolean) as string[];
  }

  if (typeof input === 'string') {
    return resolveSingleReference(input);
  }

  if (typeof input === 'object' && input !== null) {
    const ref = (input as PersonReferenceInput).id || 
                (input as PersonReferenceInput).uuid || 
                (input as PersonReferenceInput).name;
    return ref ? resolveSingleReference(ref) : null;
  }

  return null;
}

export async function expandPersonReferences(
  ids: string | string[] | null | undefined,
  includeInactive = false
) {
  if (!ids) return null;

  const supabase = await createClient();
  
  if (Array.isArray(ids)) {
    let query = supabase
      .from('family_members')
      .select('*')
      .in('id', ids);
    
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
    
    const { data } = await query;
    return data || [];
  }
  
  let baseQuery = supabase
    .from('family_members')
    .select('*')
    .eq('id', ids);
  if (!includeInactive) {
    baseQuery = baseQuery.eq('is_active', true);
  }
  const { data } = await baseQuery.single();
  return data;
}

/**
 * Resolve current auth user to their family_member.id
 * Used for "me" filtering and dashboard visibility
 */
export async function resolveCurrentUserToFamilyMember(userId: string): Promise<string | null> {
  if (!userId) return null;
  
  try {
    const supabase = await createClient();
    
    // Fast path: Direct user_id link
    const { data: familyMember, error } = await supabase
      .from('family_members')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'human')
      .single();
    
    if (!error && familyMember) {
      console.log(`[Person Resolver] Found family_member ${familyMember.id} for user ${userId} via user_id`);
      return familyMember.id;
    }
    
    // Fallback: Email match
    const { data: user } = await supabase
      .from('users') // Note: public.users table
      .select('email')
      .eq('id', userId)
      .single();
    
    if (user?.email) {
      const { data: fm } = await supabase
        .from('family_members')
        .select('id')
        .ilike('email', user.email)
        .eq('type', 'human')
        .single();
      
      if (fm) {
        console.log(`[Person Resolver] Found family_member ${fm.id} for user ${userId} via email match`);
        return fm.id;
      }
    }
    
    console.log(`[Person Resolver] No family_member found for user ${userId}`);
    return null;
  } catch (error) {
    console.error('[Person Resolver] Error resolving user to family_member:', error);
    return null;
  }
}

/**
 * Resolve family_member.id back to users.id
 * Used for owner_id and patient_ids filtering
 */
export async function resolveFamilyMemberToUser(familyMemberId: string): Promise<string | null> {
  if (!familyMemberId) return null;
  
  try {
    const supabase = await createClient();
    
    // Get family member with user_id and email
    const { data: fm } = await supabase
      .from('family_members')
      .select('user_id, email')
      .eq('id', familyMemberId)
      .single();
    
    // Direct user_id if available
    if (fm?.user_id) {
      console.log(`[Person Resolver] Found user ${fm.user_id} for family_member ${familyMemberId} via user_id`);
      return fm.user_id;
    }
    
    // Email fallback
    if (fm?.email) {
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .ilike('email', fm.email)
        .single();
      
      if (user) {
        console.log(`[Person Resolver] Found user ${user.id} for family_member ${familyMemberId} via email`);
        return user.id;
      }
    }
    
    console.log(`[Person Resolver] No user found for family_member ${familyMemberId}`);
    return null;
  } catch (error) {
    console.error('[Person Resolver] Error resolving family_member to user:', error);
    return null;
  }
}
