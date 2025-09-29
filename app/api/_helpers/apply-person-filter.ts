import { resolvePersonReferences, resolveCurrentUserToFamilyMember, resolveFamilyMemberToUser } from './person-resolver';

const ARRAY_FILTER_MODULES = new Set([
  'tasks',
  'calendar',
  'documents',
  'passwords',
  'portals',
  'contacts',
  'trips',
  'travel_details',
  'travel_contacts',
]);

type ModuleName =
  | 'tasks'
  | 'calendar'
  | 'documents'
  | 'passwords'
  | 'portals'
  | 'contacts'
  | 'trips'
  | 'travel_details'
  | 'travel_contacts';

interface FilterOptions {
  query: any; // Supabase query builder
  selectedPerson: string | undefined;
  userId: string;
  module: ModuleName;
  columnName: string;
  isAdmin: boolean;
}

/**
 * Apply person filtering with module-specific visibility rules
 * 
 * Module default behaviors (when no filter selected):
 * - calendar: Non-admins see only their own items
 * - tasks/documents/passwords/trips/travel_details/travel_contacts/contacts: Everyone sees everything  
 * - portals: Non-admins see only their own
 */
export async function applyPersonFilter({
  query,
  selectedPerson,
  userId,
  module,
  columnName,
  isAdmin
}: FilterOptions) {
  console.log(`[Filter] Module: ${module}, Column: ${columnName}, Selected: ${selectedPerson}, Admin: ${isAdmin}`);
  
  // Validate input query is a builder
  if (!query || typeof (query as any)?.order !== 'function') {
    console.error('[Filter] Input query is not a valid Supabase builder!', {
      queryType: query?.constructor?.name,
      hasOrderMethod: typeof (query as any)?.order,
      queryKeys: query ? Object.keys(query) : 'query is null/undefined'
    });
    // Return the query as-is if it's already broken
    return query;
  }
  
  // Handle "all" or no selection - apply module-specific defaults
  if (!selectedPerson || selectedPerson === 'all') {
    switch (module) {
      case 'tasks':
        console.log('[Filter] No default narrowing for tasks - showing all tasks');
        break;

      case 'calendar':
        // These modules narrow by default for non-admins
        if (!isAdmin) {
          const familyMemberId = await resolveCurrentUserToFamilyMember(userId);
          if (familyMemberId) {
            // For calendar attendees (text[]), ensure string format
            const idToUse = module === 'calendar' && columnName === 'attendees' 
              ? String(familyMemberId) 
              : familyMemberId;
            query = query.or(`created_by.eq.${userId},${columnName}.cs.{${idToUse}}`);
            console.log(`[Filter] Applied default narrowing for ${module}: created by me or assigned to me`);
          } else {
            // No family member link - only show created by me
            query = query.eq('created_by', userId);
            console.log(`[Filter] No family_member link - showing only created by user`);
          }
        }
        break;
      
      case 'documents':
      case 'passwords':
      case 'contacts':
        // NO default narrowing - everyone sees everything
        console.log(`[Filter] No default narrowing for ${module} - showing all`);
        break;
      
      case 'portals':
        // Non-admins see only their portals by default
        if (!isAdmin) {
          query = query.contains('patient_ids', [userId]);
          console.log(`[Filter] Non-admin portal filtering - showing only mine`);
        }
        break;
      
      case 'trips':
      case 'travel_details':
      case 'travel_contacts':
        // Show all travel data by default; rely on explicit person filters when selected
        console.log(`[Filter] No default narrowing for ${module} - showing all travel records`);
        break;
    }
    
    // Check query state before returning for early exit case
    if (!query || typeof (query as any)?.order !== 'function') {
      console.error('[Filter] Query corrupted in early return path!', {
        module,
        selectedPerson: selectedPerson || 'null',
        isAdmin,
        queryKeys: query ? Object.keys(query) : 'null'
      });
    }
    
    return query;
  }
  
  // Handle "me" selection - resolve to current user's family_member
  if (selectedPerson === 'me') {
    const familyMemberId = await resolveCurrentUserToFamilyMember(userId);
    if (!familyMemberId) {
      console.log(`[Filter] "me" selected but no family_member mapping found`);
      return query;
    }
    selectedPerson = familyMemberId;
  }
  
  // Resolve selected person to family_members.id
  const resolvedId = await resolvePersonReferences(selectedPerson);
  if (!resolvedId) {
    console.log(`[Filter] Could not resolve person: ${selectedPerson}`);
    return query;
  }
  
  // Ensure we have a single ID (not an array)
  const familyMemberId = Array.isArray(resolvedId) ? resolvedId[0] : resolvedId;
  
  console.log(`[Filter] Resolved person ${selectedPerson} to family_member ${familyMemberId}`);
  
  // Apply module-specific filtering with the resolved ID
  switch (module) {
    case 'tasks':
    case 'trips':
    case 'travel_details':
    case 'travel_contacts':
      // UUID arrays - pass as-is
      query = query.contains(columnName, [familyMemberId]);
      console.log(`[Filter] Applied array contains filter on ${columnName}`);
      break;
      
    case 'calendar':
      // attendees is text[] - ensure we pass string
      query = query.contains(columnName, [String(familyMemberId)]);
      console.log(`[Filter] Applied calendar attendee filter (text array)`);
      break;
    
    case 'documents':
      // Use OR for related_to and assigned_to in single query
      query = query.or(
        `related_to.cs.{${familyMemberId}},assigned_to.cs.{${familyMemberId}}`
      );
      console.log(`[Filter] Applied OR filter for documents (related_to/assigned_to)`);
      break;
    
    case 'passwords':
      // owner_id is users.id - need to map family_member to user
      const passwordUserId = await resolveFamilyMemberToUser(familyMemberId);
      if (passwordUserId) {
        query = query.eq('owner_id', passwordUserId);
        console.log(`[Filter] Applied password owner filter for user ${passwordUserId}`);
      } else {
        console.log(`[Filter] Could not resolve family_member to user for passwords`);
      }
      break;
    
    case 'portals':
      // patient_ids contains users.id - need to map
      const portalUserId = await resolveFamilyMemberToUser(familyMemberId);
      if (portalUserId) {
        query = query.contains('patient_ids', [portalUserId]);
        console.log(`[Filter] Applied portal patient filter for user ${portalUserId}`);
      } else {
        console.log(`[Filter] Could not resolve family_member to user for portals`);
      }
      break;
      
    case 'contacts':
      // Contacts use related_to with family_members.id
      query = query.contains('related_to', [familyMemberId]);
      console.log(`[Filter] Applied contact related_to filter`);
      break;
  }
  
  // Final validation before returning
  if (!query || typeof (query as any)?.order !== 'function') {
    console.error('[Filter] Query builder was corrupted during filtering!', {
      module,
      selectedPerson,
      finalQueryType: query?.constructor?.name,
      hasOrderMethod: typeof (query as any)?.order
    });
  } else {
    console.log('[Filter] Returning valid query builder');
  }
  
  return query;
}

interface AccessibleTripsOptions {
  supabase: any;
  userId: string;
  selectedPerson?: string | null;
  isAdmin: boolean;
}

export async function getAccessibleTripIds({
  supabase,
  userId,
  selectedPerson,
  isAdmin,
}: AccessibleTripsOptions): Promise<string[]> {
  try {
    let tripQuery = supabase
      .from('trips')
      .select('id')
      .eq('is_archived', false);

    tripQuery = await applyPersonFilter({
      query: tripQuery,
      selectedPerson: selectedPerson || undefined,
      userId,
      module: 'trips',
      columnName: 'traveler_ids',
      isAdmin,
    });

    const { data, error } = await tripQuery;
    if (error) {
      console.error('[Filter] Failed to resolve accessible trip IDs:', error);
      return [];
    }

    return (data || [])
      .map((record: { id?: string }) => record.id)
      .filter((id: string | undefined): id is string => Boolean(id));
  } catch (error) {
    console.error('[Filter] Unexpected error resolving trip IDs:', error);
    return [];
  }
}
