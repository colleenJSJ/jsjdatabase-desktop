'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { CategoriesClient, Category } from '@/lib/categories/categories-client';

interface CategoriesContextType {
  categories: Category[];
  loading: boolean;
  refreshCategories: () => Promise<void>;
  addCategory: (name: string) => Promise<Category>;
  deleteCategory: (id: string) => Promise<void>;
}

const CategoriesContext = createContext<CategoriesContextType | undefined>(undefined);

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshCategories = async () => {
    try {
      const cats = await CategoriesClient.getCategories();
      setCategories(cats || []);
    } catch (error) {

      setCategories([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const addCategory = async (name: string): Promise<Category> => {
    const newCategory = await CategoriesClient.addCategory(name);
    await refreshCategories(); // Refresh to ensure consistency
    return newCategory;
  };

  const deleteCategory = async (id: string): Promise<void> => {
    await CategoriesClient.deleteCategory(id);
    await refreshCategories(); // Refresh to ensure consistency
  };

  useEffect(() => {
    refreshCategories();
  }, []);

  return (
    <CategoriesContext.Provider value={{ categories, loading, refreshCategories, addCategory, deleteCategory }}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  const context = useContext(CategoriesContext);
  if (context === undefined) {
    throw new Error('useCategories must be used within a CategoriesProvider');
  }
  return context;
}