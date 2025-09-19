/**
 * Name normalization utilities for travel document extraction
 * Ensures names are properly formatted for family member matching
 */

/**
 * Convert all-caps name to proper case
 * Handles special cases like McClaren, McDonald, O'Brien, etc.
 */
function toProperCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => {
      // Handle Mc and Mac prefixes (McClaren, McDonald, MacArthur)
      if (word.toLowerCase().startsWith('mc') && word.length > 2) {
        return 'Mc' + word.charAt(2).toUpperCase() + word.slice(3);
      }
      if (word.toLowerCase().startsWith('mac') && word.length > 3) {
        return 'Mac' + word.charAt(3).toUpperCase() + word.slice(4);
      }
      // Handle O' prefix (O'Brien, O'Connor)
      if (word.toLowerCase().startsWith("o'") && word.length > 2) {
        return "O'" + word.charAt(2).toUpperCase() + word.slice(3);
      }
      // Standard proper case
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Common titles/prefixes to remove
 */
const TITLES_TO_REMOVE = ['mr', 'mrs', 'ms', 'miss', 'dr', 'prof'];

/**
 * Known Johnson family first names
 */
const JOHNSON_FAMILY_NAMES = [
  'john', 'susan', 'claire', 'auggie', 'blossom'
];

/**
 * Special name mappings for non-Johnson family members
 */
const SPECIAL_NAME_MAPPINGS: Record<string, string> = {
  'colleen': 'Russell',
  'kate': 'McClaren',
  'katherine': 'McClaren',
  'katie': 'McClaren',
  'kathy': 'McClaren'
};

/**
 * Normalize a single traveler name for better matching
 */
export function normalizeTravelerName(name: string): string {
  if (!name || typeof name !== 'string') return name;
  
  // Trim and clean up
  let normalized = name.trim();
  
  // If empty after trim, return as is
  if (!normalized) return name;
  
  // Check if name is all caps (more than 50% uppercase letters)
  const upperCount = (normalized.match(/[A-Z]/g) || []).length;
  const letterCount = (normalized.match(/[A-Za-z]/g) || []).length;
  const isAllCaps = letterCount > 0 && upperCount / letterCount > 0.5;
  
  // Convert to proper case if all caps
  if (isAllCaps) {
    normalized = toProperCase(normalized);
  }
  
  // Split into parts
  let parts = normalized.split(/\s+/).filter(p => p.length > 0);
  
  // Remove titles
  if (parts.length > 0) {
    const firstPartLower = parts[0].toLowerCase();
    if (TITLES_TO_REMOVE.includes(firstPartLower)) {
      parts = parts.slice(1);
    }
  }
  
  // If empty after removing titles, return original
  if (parts.length === 0) return name;
  
  // Check if it's a single name that needs a last name
  if (parts.length === 1) {
    const firstName = parts[0].toLowerCase();
    
    // Check for special name mappings first (Colleen Russell, Kate McClaren)
    if (SPECIAL_NAME_MAPPINGS[firstName]) {
      return toProperCase(firstName) + ' ' + SPECIAL_NAME_MAPPINGS[firstName];
    }
    
    // Then check Johnson family
    if (JOHNSON_FAMILY_NAMES.includes(firstName)) {
      // Add Johnson as last name
      return toProperCase(firstName) + ' Johnson';
    }
  }
  
  // Check if last name is missing for known people
  if (parts.length === 1 || (parts.length > 1)) {
    const firstName = parts[0].toLowerCase();
    
    // Check for special mappings (Colleen, Kate, etc.)
    if (SPECIAL_NAME_MAPPINGS[firstName]) {
      const lastName = parts[parts.length - 1].toLowerCase();
      // If they don't already have the correct last name, add it
      if (!lastName.includes(SPECIAL_NAME_MAPPINGS[firstName].toLowerCase())) {
        if (parts.length === 1) {
          return toProperCase(firstName) + ' ' + SPECIAL_NAME_MAPPINGS[firstName];
        }
        // Replace incorrect last name
        return parts.slice(0, -1).join(' ') + ' ' + SPECIAL_NAME_MAPPINGS[firstName];
      }
    }
    
    // Check Johnson family members
    if (JOHNSON_FAMILY_NAMES.includes(firstName)) {
      const lastName = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
      if (!lastName.includes('johnson')) {
        // It's a Johnson family member without "Johnson" in the name
        if (parts.length === 1) {
          return toProperCase(firstName) + ' Johnson';
        }
        // For names like "Claire Oreon Kingman" where Johnson is missing
        return parts.join(' ') + ' Johnson';
      }
    }
  }
  
  // For names like "CLAIRE OREON KINGMAN JOHNSON", just proper case it
  return parts.join(' ');
}

/**
 * Process an array of traveler names
 */
export function normalizeTravelerNames(names: string[] | undefined): string[] {
  if (!names || !Array.isArray(names)) return [];
  
  return names.map(name => normalizeTravelerName(name));
}

/**
 * Check if a name likely belongs to the Johnson family
 */
export function isLikelyJohnsonFamilyMember(name: string): boolean {
  if (!name) return false;
  
  const nameLower = name.toLowerCase();
  
  // Check if it contains "johnson"
  if (nameLower.includes('johnson')) return true;
  
  // Check if first name matches known family members
  const parts = name.split(/\s+/);
  if (parts.length > 0) {
    const firstName = parts[0].toLowerCase();
    return JOHNSON_FAMILY_NAMES.includes(firstName);
  }
  
  return false;
}