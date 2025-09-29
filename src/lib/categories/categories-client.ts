export type CategoryModule = 'tasks' | 'calendar' | 'documents' | 'passwords' | 'contacts';

export interface Category {
  id: string;
  name: string;
  color: string;
  icon?: string;
  module: CategoryModule;
  is_active?: boolean;
  is_locked?: boolean;
  created_at: string;
  updated_at: string;
}

import { addCSRFToHeaders } from '@/lib/security/csrf-client';

export class CategoriesClient {
  static async getCategories(module?: CategoryModule): Promise<Category[]> {
    try {
      const url = module ? `/api/categories?module=${module}` : '/api/categories';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch categories');
      }
      const data = await response.json();
      return data.categories || [];
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
  }

  static async addCategory(name: string, module: CategoryModule = 'calendar', color?: string): Promise<Category> {
    const response = await fetch('/api/categories', {
      method: 'POST',
      headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, module, color: color || '#6366f1' }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add category');
    }

    const data = await response.json();
    return data.category;
  }

  static async updateCategory(id: string, updates: Partial<Category>): Promise<Category> {
    const response = await fetch(`/api/categories/${id}`, {
      method: 'PUT',
      headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update category');
    }

    const data = await response.json();
    return data.category;
  }

  static async deleteCategory(id: string, force: boolean = false): Promise<{
    success: boolean;
    usage?: {
      tasks: number;
      calendar_events: number;
      documents: number;
      passwords: number;
      contacts: number;
      household_contacts: number;
      service_providers: number;
      inventory: number;
      total: number;
    };
    message?: string;
  }> {
    const url = force 
      ? `/api/categories/${id}?force=true`
      : `/api/categories/${id}`;
      
    const response = await fetch(url, {
      method: 'DELETE',
      headers: addCSRFToHeaders(),
    });

    const data = await response.json();

    if (!response.ok && response.status !== 409) {
      throw new Error(data.error || 'Failed to delete category');
    }

    return data;
  }
}
