import { createServiceClient } from '@/lib/supabase/server';

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

type CategoryUsage = {
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

export class CategoriesService {
  static async getCategories(module?: CategoryModule): Promise<Category[]> {
    const supabase = await createServiceClient();
    
    let query = supabase
      .from('categories')
      .select('*')
      .eq('is_active', true);
    
    if (module) {
      query = query.eq('module', module);
    }
    
    const { data: categories, error } = await query.order('name');

    if (error) {
      console.error('Error fetching categories:', error);
      throw new Error('Failed to fetch categories');
    }

    return categories || [];
  }

  static async addCategory(name: string, module: CategoryModule, color?: string): Promise<Category> {
    const supabase = await createServiceClient();
    
    // Trim and validate the name
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Category name cannot be empty');
    }

    // Check if category already exists for this module
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .ilike('name', trimmedName)
      .eq('module', module)
      .single();

    if (existing) {
      throw new Error(`Category already exists for ${module}`);
    }

    const { data: category, error } = await supabase
      .from('categories')
      .insert({ 
        name: trimmedName,
        module,
        color: color || '#6366f1',
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding category:', error);
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('Category already exists');
      }
      throw new Error('Failed to add category');
    }

    return category;
  }

  static async updateCategory(id: string, updates: Partial<Category>): Promise<Category> {
    const supabase = await createServiceClient();
    
    const { data: category, error } = await supabase
      .from('categories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating category:', error);
      throw new Error('Failed to update category');
    }

    return category;
  }

  static async getCategoryUsage(categoryName: string): Promise<CategoryUsage> {
    const supabase = await createServiceClient();
    
    // Check usage in all tables that have category fields
    const [
      { count: tasksCount },
      { count: eventsCount },
      { count: documentsCount },
      { count: passwordsCount },
      { count: contactsCount },
      { count: householdContactsCount },
      { count: serviceProvidersCount },
      { count: inventoryCount }
    ] = await Promise.all([
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('category', categoryName),
      supabase.from('calendar_events').select('*', { count: 'exact', head: true }).eq('category', categoryName),
      supabase.from('documents').select('*', { count: 'exact', head: true }).eq('category', categoryName),
      supabase.from('passwords').select('*', { count: 'exact', head: true }).eq('category', categoryName),
      supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('category', categoryName),
      supabase.from('household_contacts').select('*', { count: 'exact', head: true }).eq('category', categoryName),
      supabase.from('service_providers').select('*', { count: 'exact', head: true }).eq('category', categoryName),
      supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('category', categoryName)
    ]);

    const usage: CategoryUsage = {
      tasks: tasksCount ?? 0,
      calendar_events: eventsCount ?? 0,
      documents: documentsCount ?? 0,
      passwords: passwordsCount ?? 0,
      contacts: contactsCount ?? 0,
      household_contacts: householdContactsCount ?? 0,
      service_providers: serviceProvidersCount ?? 0,
      inventory: inventoryCount ?? 0,
      total: 0,
    };

    usage.total =
      usage.tasks +
      usage.calendar_events +
      usage.documents +
      usage.passwords +
      usage.contacts +
      usage.household_contacts +
      usage.service_providers +
      usage.inventory;

    return usage;
  }

  static async deleteCategory(id: string, force: boolean = false): Promise<{ success: boolean; usage?: CategoryUsage; message?: string }> {
    const supabase = await createServiceClient();
    
    // First check if the category exists and get its details
    const { data: category, error: fetchError } = await supabase
      .from('categories')
      .select('is_locked, name, module')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('Error fetching category:', fetchError);
      throw new Error('Failed to fetch category');
    }

    if (category?.is_locked) {
      throw new Error(`The category "${category.name}" is required by the system and cannot be deleted`);
    }

    // Check category usage across all tables
    const usage = await this.getCategoryUsage(category.name);

    // If category is in use and force is not true, return usage information
    if (usage.total > 0 && !force) {
      return {
        success: false,
        usage,
        message: `This category is currently used by ${usage.total} item(s). Please confirm deletion.`
      };
    }
    
    // Soft delete by setting is_active to false
    const { error } = await supabase
      .from('categories')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('Error deleting category:', error);
      throw new Error('Failed to delete category');
    }

    return { 
      success: true, 
      message: usage.total > 0 
        ? `Category deleted. ${usage.total} item(s) will show as archived category.`
        : 'Category deleted successfully.'
    };
  }
}
