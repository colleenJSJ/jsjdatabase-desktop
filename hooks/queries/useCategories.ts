/**
 * React Query hooks for Categories
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CategoriesClient, Category } from '@/lib/categories/categories-client';

// Query keys factory
export const categoryKeys = {
  all: ['categories'] as const,
  lists: () => [...categoryKeys.all, 'list'] as const,
  list: (type: string) => [...categoryKeys.lists(), type] as const,
  details: () => [...categoryKeys.all, 'detail'] as const,
  detail: (type: string, id: string) => [...categoryKeys.details(), type, id] as const,
};

// Fetch categories for a specific type
export function useCategoriesQuery(type: 'tasks' | 'documents' | 'passwords' | 'health' | string) {
  return useQuery({
    queryKey: categoryKeys.list(type),
    queryFn: () => CategoriesClient.getCategories(type as any),
    staleTime: 10 * 60 * 1000, // Consider data fresh for 10 minutes
    gcTime: 15 * 60 * 1000, // Keep in cache for 15 minutes
  });
}

// Get a specific category
export function useCategoryQuery(type: string, categoryId: string | null | undefined) {
  const { data: categories } = useCategoriesQuery(type);
  
  return {
    data: categoryId ? categories?.find(c => c.id === categoryId) : undefined,
    isLoading: !categories,
  };
}

// Get category by name
export function useCategoryByName(type: string, name: string | null | undefined) {
  const { data: categories } = useCategoriesQuery(type);
  
  return {
    data: name ? categories?.find(c => c.name.toLowerCase() === name.toLowerCase()) : undefined,
    isLoading: !categories,
  };
}

// Create category mutation
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ type, data }: { type: string; data: Partial<Category> }) => {
      const name = data.name || 'New Category';
      const color = data.color || '#6366f1';
      return CategoriesClient.addCategory(name, type as any, color);
    },
    onSuccess: (newCategory, { type }) => {
      // Invalidate and refetch category list
      queryClient.invalidateQueries({ queryKey: categoryKeys.list(type) });
    },
  });
}

// Update category mutation
export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { type: string; id: string; data: Partial<Category> }) => {
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const res = await ApiClient.put(`/api/categories/${id}`, { name: data.name, color: data.color });
      if (!res.success) throw new Error(res.error || 'Failed to update category');
      return res.data;
    },
    onSuccess: (updatedCategory, { type, id }) => {
      // Update cache
      queryClient.setQueryData(categoryKeys.detail(type, id), updatedCategory);
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: categoryKeys.list(type) });
    },
  });
}

// Delete category mutation
export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { type: string; id: string }) => {
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const res = await ApiClient.delete(`/api/categories/${id}`);
      if (!res.success) throw new Error(res.error || 'Failed to delete category');
      return true as const;
    },
    onSuccess: (_, { type, id }) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: categoryKeys.detail(type, id) });
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: categoryKeys.list(type) });
    },
  });
}

// Prefetch categories
export function usePrefetchCategories(type: string) {
  const queryClient = useQueryClient();

  const prefetch = () => {
    queryClient.prefetchQuery({
      queryKey: categoryKeys.list(type),
      queryFn: () => CategoriesClient.getCategories(type as any),
    });
  };

  return prefetch;
}
