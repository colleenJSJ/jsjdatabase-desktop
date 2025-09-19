import { CalendarEventCategory } from '@/lib/supabase/types';

/**
 * Maps category names from the categories table to calendar event enum values
 * This ensures consistency across all modules when creating calendar events
 */
export const CATEGORY_NAME_TO_ENUM: Record<string, CalendarEventCategory> = {
  // Direct mappings
  'Health': 'medical',
  'J3 Academics': 'education',
  'Travel': 'travel',
  'Pets': 'pets',
  'Work': 'work',
  'Personal': 'personal',
  'Family': 'family',
  'Family Event': 'family',
  'Household': 'household',
  'Financial': 'financial',
  'Legal': 'legal',
  'Other': 'other',
  
  // Alternative names/aliases
  'Meeting': 'work',
  'Appointment': 'medical',
  'School': 'education',
  'Education': 'education',
  'Medical': 'medical',
  'Pet Care': 'pets',
  'Administrative': 'administrative',
  
  // Lowercase versions for flexibility
  'health': 'medical',
  'j3 academics': 'education',
  'travel': 'travel',
  'pets': 'pets',
  'work': 'work',
  'personal': 'personal',
  'family': 'family',
  'family event': 'family',
  'household': 'household',
  'financial': 'financial',
  'legal': 'legal',
  'other': 'other',
};

/**
 * Maps source/module names to their default category enum values
 */
export const SOURCE_TO_CATEGORY: Record<string, CalendarEventCategory> = {
  'j3_academics': 'education',
  'health': 'medical',
  'medical': 'medical',
  'travel': 'travel',
  'pets': 'pets',
  'tasks': 'work',
  'household': 'household',
  'financial': 'financial',
  'legal': 'legal',
};

/**
 * Maps enum values back to display names for UI
 */
export const ENUM_TO_DISPLAY_NAME: Record<CalendarEventCategory, string> = {
  'medical': 'Health',
  'education': 'J3 Academics',
  'travel': 'Travel',
  'pets': 'Pets',
  'work': 'Work',
  'personal': 'Personal',
  'family': 'Family',
  'household': 'Household',
  'financial': 'Financial',
  'legal': 'Legal',
  'administrative': 'Administrative',
  'school': 'School',
  'other': 'Other',
};

/**
 * Get the calendar event category enum value from a category name
 */
export function getCategoryEnum(categoryName: string | null | undefined): CalendarEventCategory {
  if (!categoryName) return 'other';
  
  const mapped = CATEGORY_NAME_TO_ENUM[categoryName] || 
                 CATEGORY_NAME_TO_ENUM[categoryName.toLowerCase()];
  
  return mapped || 'other';
}

/**
 * Get the default category for a source/module
 */
export function getCategoryForSource(source: string | null | undefined): CalendarEventCategory {
  if (!source) return 'other';
  
  return SOURCE_TO_CATEGORY[source.toLowerCase()] || 'other';
}

/**
 * Get display name for a category enum value
 */
export function getCategoryDisplayName(category: CalendarEventCategory): string {
  return ENUM_TO_DISPLAY_NAME[category] || 'Other';
}

/**
 * Check if a category from the database matches a calendar event category
 */
export function categoryMatches(
  dbCategoryName: string, 
  eventCategory: CalendarEventCategory
): boolean {
  const enumValue = getCategoryEnum(dbCategoryName);
  return enumValue === eventCategory;
}

/**
 * Get the color for a category from the categories list
 */
export function getCategoryColor(
  category: CalendarEventCategory,
  categories: Array<{ id: string; color: string; name: string }>
): string {
  // First try to find by matching enum value in id
  const categoryById = categories.find(cat => cat.id === category);
  if (categoryById) return categoryById.color;
  
  // Then try to find by matching name
  const displayName = ENUM_TO_DISPLAY_NAME[category];
  const categoryByName = categories.find(cat => 
    getCategoryEnum(cat.name) === category || 
    cat.name === displayName
  );
  if (categoryByName) return categoryByName.color;
  
  // Fallback colors based on category type
  const fallbackColors: Record<CalendarEventCategory, string> = {
    'medical': '#5B7CA3',
    'education': '#8a6a74',
    'travel': '#6a818a',
    'pets': '#8C7348',
    'work': '#8C7348',
    'personal': '#8A7A6A',
    'family': '#8BA88B',
    'household': '#7A6A8A',
    'financial': '#7A6A8A',
    'legal': '#7A6A8A',
    'administrative': '#7A6A8A',
    'school': '#8a6a74',
    'other': '#7A6A8A',
  };
  
  return fallbackColors[category] || '#7A6A8A';
}