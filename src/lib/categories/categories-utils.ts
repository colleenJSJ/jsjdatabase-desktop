import { Category } from './categories-client';

/**
 * Formats a category name, adding "(archived)" suffix if the category is inactive
 * @param categoryName The name of the category
 * @param activeCategories List of active categories to check against
 * @returns Formatted category name
 */
export function formatCategoryName(
  categoryName: string | null | undefined,
  activeCategories: Category[]
): string {
  if (!categoryName) return '';
  
  const isActive = activeCategories.some(cat => cat.name === categoryName);
  return isActive ? categoryName : `${categoryName} (archived)`;
}

/**
 * Checks if a category is archived (inactive)
 * @param categoryName The name of the category
 * @param activeCategories List of active categories to check against
 * @returns True if the category is archived, false otherwise
 */
export function isCategoryArchived(
  categoryName: string | null | undefined,
  activeCategories: Category[]
): boolean {
  if (!categoryName) return false;
  return !activeCategories.some(cat => cat.name === categoryName);
}

/**
 * Gets the color for a category, returning a default gray for archived categories
 * @param categoryName The name of the category
 * @param activeCategories List of active categories with their colors
 * @returns Hex color code
 */
export function getCategoryColor(
  categoryName: string | null | undefined,
  activeCategories: Category[]
): string {
  if (!categoryName) return '#6B7280'; // Gray as default
  
  const category = activeCategories.find(cat => cat.name === categoryName);
  return category ? category.color : '#6B7280'; // Gray for archived
}

/**
 * Filters out archived categories from a list of category names
 * @param categoryNames List of category names to filter
 * @param activeCategories List of active categories
 * @returns Only the category names that are still active
 */
export function filterActiveCategories(
  categoryNames: string[],
  activeCategories: Category[]
): string[] {
  const activeCategoryNames = new Set(activeCategories.map(cat => cat.name));
  return categoryNames.filter(name => activeCategoryNames.has(name));
}