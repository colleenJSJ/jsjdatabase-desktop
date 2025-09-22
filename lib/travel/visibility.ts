import { getAccessibleTripIds } from '@/app/api/_helpers/apply-person-filter';
import { resolveFamilyMemberToUser, resolvePersonReferences } from '@/app/api/_helpers/person-resolver';
import { extractTravelerIds } from './travelers';

export interface TravelVisibilityContext {
  showAll: boolean;
  selectedFamilyIds: Set<string>;
  selectedCreatorUserIds: Set<string>;
  accessibleTripIds: Set<string>;
  currentUserId: string;
}

interface BuildVisibilityArgs {
  supabase: any;
  userId: string;
  selectedPerson?: string | null;
  isAdmin: boolean;
}

export async function buildTravelVisibilityContext({
  supabase,
  userId,
  selectedPerson,
  isAdmin,
}: BuildVisibilityArgs): Promise<TravelVisibilityContext> {
  const showAll = !selectedPerson || selectedPerson === 'all';

  const selectedFamilyIds = new Set<string>();
  const selectedCreatorUserIds = new Set<string>();
  let accessibleTripIds: Set<string> = new Set();

  if (!showAll && selectedPerson) {
    const resolved = await resolvePersonReferences(selectedPerson);
    const resolvedList = Array.isArray(resolved) ? resolved : resolved ? [resolved] : [];

    for (const value of resolvedList) {
      if (!value) continue;
      const familyId = String(value);
      if (!familyId) continue;
      selectedFamilyIds.add(familyId);

      const creatorUserId = await resolveFamilyMemberToUser(familyId);
      if (creatorUserId) {
        selectedCreatorUserIds.add(String(creatorUserId));
      }
    }

    const tripIds = await getAccessibleTripIds({
      supabase,
      userId,
      selectedPerson,
      isAdmin,
    });
    accessibleTripIds = new Set(tripIds.map(id => String(id)));
  }

  return {
    showAll,
    selectedFamilyIds,
    selectedCreatorUserIds,
    accessibleTripIds,
    currentUserId: userId,
  };
}

interface ShouldIncludeArgs {
  record: Record<string, any>;
  context: TravelVisibilityContext;
  travelerKeys?: string[];
  fallbackTravelerIds?: string[];
  creatorFamilyMemberId?: string | null;
}

export function shouldIncludeTravelRecord({
  record,
  context,
  travelerKeys = ['travelers', 'traveler_ids'],
  fallbackTravelerIds = [],
  creatorFamilyMemberId,
}: ShouldIncludeArgs): boolean {
  if (!record) return false;

  if (context.showAll) {
    return true;
  }

  const creatorId = record.created_by ? String(record.created_by) : null;
  if (creatorId && creatorId === context.currentUserId) {
    return true;
  }

  if (creatorId && context.selectedCreatorUserIds.has(creatorId)) {
    return true;
  }

  const effectiveCreatorFamilyId = creatorFamilyMemberId || record.creator_family_member_id;
  if (effectiveCreatorFamilyId && context.selectedFamilyIds.has(String(effectiveCreatorFamilyId))) {
    return true;
  }

  const travelerIds = extractTravelerIds(record, travelerKeys);
  for (const id of travelerIds) {
    if (context.selectedFamilyIds.has(id)) {
      return true;
    }
  }

  for (const id of fallbackTravelerIds) {
    if (context.selectedFamilyIds.has(String(id))) {
      return true;
    }
  }

  const tripId = record.trip_id ? String(record.trip_id) : null;
  if (tripId && context.accessibleTripIds.has(tripId)) {
    return true;
  }

  return false;
}
