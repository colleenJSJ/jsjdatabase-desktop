'use client';

import { useState, useEffect } from 'react';
import { Trash2, Plus, Edit2, Save, X, Lock, AlertCircle } from 'lucide-react';
import { CategoriesClient, Category, CategoryModule } from '@/lib/categories/categories-client';

interface CategoryManagementTabsProps {
  module: CategoryModule;
  moduleLabel: string;
}

interface CategoryUsage {
  [categoryName: string]: {
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
}

export function CategoryManagementTabs({ module, moduleLabel }: CategoryManagementTabsProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryUsage, setCategoryUsage] = useState<CategoryUsage>({});
  const [loadingUsage, setLoadingUsage] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', color: '' });

  useEffect(() => {
    fetchCategories();
  }, [module]);

  // Listen for category updates from other tabs/components
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'categories-updated' && e.newValue) {
        // Refetch categories when they're updated elsewhere
        fetchCategories();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const fetchCategories = async () => {
    try {
      const cats = await CategoriesClient.getCategories(module);
      setCategories(cats);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      alert('Category name cannot be empty');
      return;
    }

    setAdding(true);
    try {
      const newCategory = await CategoriesClient.addCategory(newCategoryName, module, newCategoryColor);
      setCategories([...categories, newCategory].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategoryName('');
      setNewCategoryColor('#6366f1');
      
      // Broadcast category update to other tabs/components
      window.localStorage.setItem('categories-updated', Date.now().toString());
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to add category');
    } finally {
      setAdding(false);
    }
  };

  const handleEditCategory = (category: Category) => {
    setEditingId(category.id);
    setEditForm({ name: category.name, color: category.color });
  };

  const handleSaveEdit = async (id: string) => {
    try {
      const updated = await CategoriesClient.updateCategory(id, {
        name: editForm.name,
        color: editForm.color
      });
      setCategories(categories.map(c => c.id === id ? updated : c));
      setEditingId(null);
      
      // Broadcast category update to other tabs/components
      window.localStorage.setItem('categories-updated', Date.now().toString());
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update category');
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    setLoadingUsage(category.id);
    
    try {
      // First attempt to delete without force to check usage
      const result = await CategoriesClient.deleteCategory(category.id, false);
      
      if (!result.success && result.usage) {
        // Category is in use, show detailed confirmation
        const usageDetails = [];
        if (result.usage.tasks > 0) usageDetails.push(`${result.usage.tasks} task(s)`);
        if (result.usage.calendar_events > 0) usageDetails.push(`${result.usage.calendar_events} calendar event(s)`);
        if (result.usage.documents > 0) usageDetails.push(`${result.usage.documents} document(s)`);
        if (result.usage.passwords > 0) usageDetails.push(`${result.usage.passwords} password(s)`);
        if (result.usage.contacts > 0) usageDetails.push(`${result.usage.contacts} contact(s)`);
        if (result.usage.household_contacts > 0) usageDetails.push(`${result.usage.household_contacts} household contact(s)`);
        if (result.usage.service_providers > 0) usageDetails.push(`${result.usage.service_providers} service provider(s)`);
        if (result.usage.inventory > 0) usageDetails.push(`${result.usage.inventory} inventory item(s)`);
        
        const confirmMessage = `The category "${category.name}" is currently used by:\n\n${usageDetails.join('\n')}\n\nTotal: ${result.usage.total} item(s)\n\nThese items will show "${category.name} (archived)" after deletion.\n\nDo you want to proceed with deletion?`;
        
        if (confirm(confirmMessage)) {
          // Force delete the category
          const forceResult = await CategoriesClient.deleteCategory(category.id, true);
          if (forceResult.success) {
            setCategories(categories.filter(c => c.id !== category.id));
            // Update usage state to remove this category
            const newUsage = { ...categoryUsage };
            delete newUsage[category.name];
            setCategoryUsage(newUsage);
            // Broadcast category update to other tabs/components
            window.localStorage.setItem('categories-updated', Date.now().toString());
            if (forceResult.message) {
              alert(forceResult.message);
            }
          }
        }
      } else if (result.success) {
        // Category was not in use, deleted successfully
        setCategories(categories.filter(c => c.id !== category.id));
        // Update usage state to remove this category
        const newUsage = { ...categoryUsage };
        delete newUsage[category.name];
        setCategoryUsage(newUsage);
        // Broadcast category update to other tabs/components
        window.localStorage.setItem('categories-updated', Date.now().toString());
        if (result.message) {
          alert(result.message);
        }
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete category. Please try again.');
    } finally {
      setLoadingUsage(null);
    }
  };

  const fetchCategoryUsage = async (categoryName: string) => {
    try {
      const response = await fetch(`/api/categories/usage?name=${encodeURIComponent(categoryName)}`);
      if (response.ok) {
        const data = await response.json();
        setCategoryUsage(prev => ({ ...prev, [categoryName]: data.usage }));
      }
    } catch (error) {
      console.error('Error fetching category usage:', error);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-6">
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-6">
      {/* Add Category */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
          placeholder={`${moduleLabel} Category Name`}
          className="flex-1 px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-gray-700"
        />
        <input
          type="color"
          value={newCategoryColor}
          onChange={(e) => setNewCategoryColor(e.target.value)}
          className="w-12 h-10 rounded cursor-pointer"
          title="Category color"
        />
        <button
          onClick={handleAddCategory}
          disabled={adding || !newCategoryName.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 disabled:cursor-not-allowed text-white rounded-md transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Category
        </button>
      </div>

      {/* Categories List */}
      {categories.length === 0 ? (
        <p className="text-text-muted text-center py-8">No categories found. Add one above!</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-4 pb-2 border-b border-gray-600/30">
            <div className="col-span-4 text-xs font-medium text-text-muted uppercase tracking-wider">Category Name</div>
            <div className="col-span-2 text-xs font-medium text-text-muted uppercase tracking-wider">Color</div>
            <div className="col-span-2 text-xs font-medium text-text-muted uppercase tracking-wider">Usage</div>
            <div className="col-span-4 text-xs font-medium text-text-muted uppercase tracking-wider text-right">Actions</div>
          </div>
          {categories.map(category => {
            const usage = categoryUsage[category.name];
            return (
              <div key={category.id} className="grid grid-cols-12 gap-4 py-2 hover:bg-gray-700/20 rounded px-2 items-center">
                <div className="col-span-4">
                  {editingId === category.id ? (
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-2 py-1 bg-background-primary border border-gray-600/30 rounded text-sm text-text-primary"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-text-primary">{category.name}</span>
                      {category.is_locked && (
                        <span title="System category - cannot be deleted">
                          <Lock className="h-3 w-3 text-text-muted" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  {editingId === category.id ? (
                    <input
                      type="color"
                      value={editForm.color}
                      onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                      className="w-12 h-8 rounded cursor-pointer"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="text-xs text-text-muted">{category.color}</span>
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  {loadingUsage === category.id ? (
                    <span className="text-xs text-text-muted">Checking...</span>
                  ) : usage ? (
                    <div className="flex items-center gap-1">
                      <span className={`text-sm ${usage.total > 0 ? 'text-yellow-400' : 'text-text-muted'}`}>
                        {usage.total}
                      </span>
                      {usage.total > 0 && (
                        <button
                          onClick={() => fetchCategoryUsage(category.name)}
                          className="p-0.5 hover:bg-gray-600/30 rounded"
                          title="Refresh usage count"
                        >
                          <AlertCircle className="h-3 w-3 text-yellow-400" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => fetchCategoryUsage(category.name)}
                      className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                    >
                      Check usage
                    </button>
                  )}
                </div>
                <div className="col-span-4 text-right">
                {editingId === category.id ? (
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleSaveEdit(category.id)}
                      className="p-1.5 hover:bg-green-500/20 rounded transition-colors group"
                      title="Save changes"
                    >
                      <Save className="h-4 w-4 text-green-400 group-hover:text-green-300" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 hover:bg-red-500/20 rounded transition-colors group"
                      title="Cancel"
                    >
                      <X className="h-4 w-4 text-red-400 group-hover:text-red-300" />
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleEditCategory(category)}
                      className="p-1.5 hover:bg-blue-500/20 rounded transition-colors group"
                      title="Edit category"
                    >
                      <Edit2 className="h-4 w-4 text-blue-400 group-hover:text-blue-300" />
                    </button>
                    {category.is_locked ? (
                      <div className="p-1.5 cursor-not-allowed" title="System category - cannot be deleted">
                        <Lock className="h-4 w-4 text-gray-500" />
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDeleteCategory(category)}
                        className="p-1.5 hover:bg-red-500/20 rounded transition-colors group"
                        title="Delete category"
                      >
                        <Trash2 className="h-4 w-4 text-red-400 group-hover:text-red-300" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
