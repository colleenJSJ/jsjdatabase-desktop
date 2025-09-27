type UnknownRecord = Record<string, unknown>;

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export const cleanNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const cleanStringArray = (...sources: unknown[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];

  const pushValue = (raw: unknown) => {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        output.push(trimmed);
      }
    }
  };

  sources.forEach(source => {
    if (!source) return;

    if (Array.isArray(source)) {
      source.forEach(item => pushValue(item));
      return;
    }

    if (typeof source === 'string') {
      pushValue(source);
      return;
    }

    if (typeof source === 'object') {
      const record = source as UnknownRecord;
      Object.values(record).forEach(value => pushValue(value));
    }
  });

  return output;
};

export const firstFromArray = (values: string[]): string | null => {
  if (!Array.isArray(values)) return null;
  return values.length > 0 ? values[0] : null;
};

export const cleanBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
};

export const cleanJsonField = (value: unknown): UnknownRecord | null => {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as UnknownRecord;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as UnknownRecord;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

export const ensureName = (value: unknown): string => {
  if (isNonEmptyString(value)) return value.trim();
  throw new Error('Contact name is required');
};

export interface SanitizedContactPayload {
  name: string;
  company: string | null;
  category: string | null;
  contact_subtype: string | null;
  emails: string[];
  email: string | null;
  phones: string[];
  phone: string | null;
  addresses: string[];
  address: string | null;
  tags: string[];
  related_to: string[];
  assigned_entities: string[];
  pets: string[];
  trip_id: string | null;
  source_type: string | null;
  source_page: string | null;
  source_id: string | null;
  notes: string | null;
  website: string | null;
  portal_url: string | null;
  portal_username: string | null;
  portal_password: string | null;
  is_emergency: boolean;
  is_preferred: boolean;
  is_favorite: boolean;
  is_archived: boolean;
}

export const sanitizeContactPayload = (raw: unknown): SanitizedContactPayload => {
  const body = (raw ?? {}) as Record<string, unknown>;

  const emails = cleanStringArray(body.emails, body.email);
  const phones = cleanStringArray(body.phones, body.phone);
  const addresses = cleanStringArray(body.addresses, body.address);
  const tags = cleanStringArray(body.tags);
  const relatedTo = cleanStringArray(body.related_to);
  const assignedEntities = cleanStringArray(body.assigned_entities);
  const pets = cleanStringArray(body.pets);

  return {
    name: ensureName(body.name),
    company: cleanNullableString(body.company),
    category: cleanNullableString(body.category),
    contact_subtype: cleanNullableString(body.contact_subtype),
    emails,
    email: firstFromArray(emails),
    phones,
    phone: firstFromArray(phones),
    addresses,
    address: firstFromArray(addresses),
    tags,
    related_to: relatedTo,
    assigned_entities: assignedEntities,
    pets,
    trip_id: cleanNullableString(body.trip_id),
    source_type: cleanNullableString(body.source_type),
    source_page: cleanNullableString(body.source_page),
    source_id: cleanNullableString(body.source_id),
    notes: cleanNullableString(body.notes),
    website: cleanNullableString(body.website),
    portal_url: cleanNullableString(body.portal_url),
    portal_username: cleanNullableString(body.portal_username),
    portal_password: cleanNullableString(body.portal_password),
    is_emergency: cleanBoolean(body.is_emergency),
    is_preferred: cleanBoolean(body.is_preferred),
    is_favorite: cleanBoolean(body.is_favorite),
    is_archived: cleanBoolean(body.is_archived),
  };
};
