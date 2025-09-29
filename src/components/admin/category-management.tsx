'use client';

import { useState, useEffect } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { CategoriesClient, Category } from '@/lib/categories/categories-client';

export function CategoryManagement() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const cats = await CategoriesClient.getCategories();
      setCategories(cats);
    } catch (error) {

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
      const newCategory = await CategoriesClient.addCategory(newCategoryName);
      setCategories([...categories, newCategory].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategoryName('');
      alert('Category added successfully!');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to add category');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    if (!confirm(`Are you sure you want to delete the category "${category.name}"?`)) {
      return;
    }

    try {
      await CategoriesClient.deleteCategory(category.id);
      setCategories(categories.filter(c => c.id !== category.id));
      alert('Category deleted successfully!');
    } catch (error) {
      alert('Failed to delete category');
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-700 rounded w-1/4 mb-4"></div>
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
    <div>
      <h2 className="text-lg font-medium text-text-primary mb-4">Category Management</h2>
      
      <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-6">
        {/* Add Category */}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
            placeholder="Category Name"
            className="flex-1 px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-gray-700"
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
            <div className="grid grid-cols-2 gap-4 pb-2 border-b border-gray-600/30">
              <div className="text-xs font-medium text-text-muted uppercase tracking-wider">Category Name</div>
              <div className="text-xs font-medium text-text-muted uppercase tracking-wider text-right">Actions</div>
            </div>
            {categories.map(category => (
              <div key={category.id} className="grid grid-cols-2 gap-4 py-2 hover:bg-gray-700/20 rounded px-2">
                <div className="text-text-primary">{category.name}</div>
                <div className="text-right">
                  <button
                    onClick={() => handleDeleteCategory(category)}
                    className="p-1.5 hover:bg-red-500/20 rounded transition-colors group"
                    title="Delete category"
                  >
                    <Trash2 className="h-4 w-4 text-red-400 group-hover:text-red-300" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}