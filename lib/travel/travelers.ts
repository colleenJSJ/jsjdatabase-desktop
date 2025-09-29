// Utilities for normalizing traveler associations across travel modules.

export function normalizeTravelerIds(
  travelerIds: Array<string | null | undefined>,
  creatorFamilyMemberId?: string | null
): string[] {
  const normalized = new Set<string>();

  for (const id of travelerIds || []) {
    if (!id) continue;
    const trimmed = String(id).trim();
    if (trimmed) {
      normalized.add(trimmed);
    }
  }

  if (creatorFamilyMemberId) {
    const creatorId = String(creatorFamilyMemberId).trim();
    if (creatorId) {
      normalized.add(creatorId);
    }
  }

  return Array.from(normalized);
}

export function extractTravelerIds(
  record: Record<string, unknown> | null | undefined,
  keys: string[] = ['travelers', 'traveler_ids']
): string[] {
  if (!record) return [];

  const collected = new Set<string>();

  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    for (const raw of value) {
      if (!raw) continue;
      const id = String(raw).trim();
      if (id) {
        collected.add(id);
      }
    }
  }

  return Array.from(collected);
}
