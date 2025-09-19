/**
 * Shared hook for fetching and caching categories
 * Prevents multiple components from fetching the same category data
 */

import { useState, useEffect, useRef } from 'react';
import { CategoriesClient, Category } from '@/lib/categories/categories-client';

// Global cache for categories by type
const categoriesCache = new Map<string, Category[]>();
const cacheTimestamps = new Map<string, number>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

interface UseCategoriesResult {
  categories: Category[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCategories(type: 'tasks' | 'documents' | 'passwords' | 'health' | string): UseCategoriesResult {
  const cacheKey = type;
  const [categories, setCategories] = useState<Category[]>(() => 
    categoriesCache.get(cacheKey) || []
  );
  const [loading, setLoading] = useState(!categoriesCache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchCategories = async (force = false) => {
    // Check cache validity
    if (!force && categoriesCache.has(cacheKey)) {
      const cacheTimestamp = cacheTimestamps.get(cacheKey);
      if (cacheTimestamp) {
        const cacheAge = Date.now() - cacheTimestamp;
        if (cacheAge < CACHE_DURATION) {
          setCategories(categoriesCache.get(cacheKey)!);
          setLoading(false);
          return;
        }
      }
    }

    // Prevent duplicate fetches
    if (isFetchingRef.current && !force) {
      return;
    }

    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const fetchedCategories = await CategoriesClient.getCategories(type as any);
      
      // Update global cache
      categoriesCache.set(cacheKey, fetchedCategories);
      cacheTimestamps.set(cacheKey, Date.now());
      
      setCategories(fetchedCategories);
      setError(null);
    } catch (err) {
      console.error(`[useCategories] Error fetching ${type} categories:`, err);
      setError(err instanceof Error ? err.message : 'Failed to fetch categories');
      
      // Use cached data if available on error
      const cached = categoriesCache.get(cacheKey);
      if (cached) {
        setCategories(cached);
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchCategories();
  }, [type]);

  const refresh = async () => {
    await fetchCategories(true);
  };

  return { categories, loading, error, refresh };
}

// Helper to get a specific category
export function useCategory(type: string, categoryId: string | null | undefined): Category | undefined {
  const { categories } = useCategories(type);
  return categoryId ? categories.find(c => c.id === categoryId) : undefined;
}

// Helper to get category by name
export function useCategoryByName(type: string, name: string | null | undefined): Category | undefined {
  const { categories } = useCategories(type);
  return name ? categories.find(c => c.name.toLowerCase() === name.toLowerCase()) : undefined;
}

// Clear cache for a specific type or all types
export function clearCategoriesCache(type?: string) {
  if (type) {
    categoriesCache.delete(type);
    cacheTimestamps.delete(type);
  } else {
    categoriesCache.clear();
    cacheTimestamps.clear();
  }
}

// Preload categories for multiple types
export async function preloadCategories(types: string[]) {
  const promises = types.map(async (type) => {
    try {
      const categories = await CategoriesClient.getCategories(type as any);
      categoriesCache.set(type, categories);
      cacheTimestamps.set(type, Date.now());
    } catch (error) {
      console.error(`[preloadCategories] Failed to preload ${type} categories:`, error);
    }
  });
  
  await Promise.allSettled(promises);
}
