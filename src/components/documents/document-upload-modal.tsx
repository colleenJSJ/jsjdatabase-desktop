'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { X, Upload, FileText, Calendar, Star } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import { formatBytes } from '@/lib/utils';
import { Category, CategoriesClient } from '@/lib/categories/categories-client';
import { addCSRFToHeaders } from '@/lib/security/csrf-client';
import { useFamilyMembers } from '@/hooks/use-family-members';

interface DocumentUploadModalProps {
  onClose: () => void;
  onUploadComplete: () => void;
  sourcePage?: string;
  sourceId?: string;
  defaultCategory?: string;
  includePets?: boolean;
  initialRelatedTo?: string[];
}

export default function DocumentUploadModal({
  onClose,
  onUploadComplete,
  sourcePage,
  sourceId,
  defaultCategory,
  includePets = false,
  initialRelatedTo = []
}: DocumentUploadModalProps) {
  const { user } = useUser();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>(initialRelatedTo);
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [isStarred, setIsStarred] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const { members: baseFamilyMembers } = useFamilyMembers({ includePets });

  const personOptions = useMemo(() => {
    const mapped = baseFamilyMembers.map((member) => ({
      id: member.id,
      name: member.display_name || member.name,
      type: member.type,
    }));
    return [{ id: 'shared', name: 'Shared/Family' }, ...mapped];
  }, [baseFamilyMembers]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelect = (selectedFile: File) => {
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (selectedFile.size > maxSize) {
      alert('File size must be less than 10MB');
      return;
    }

    setFile(selectedFile);
    // Auto-populate title from filename
    const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
    setTitle(nameWithoutExt);
  };

  const handlePersonToggle = (personId: string) => {
    setSelectedPersonIds(prev =>
      prev.includes(personId)
        ? prev.filter(id => id !== personId)
        : [...prev, personId]
    );
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedPersonIds([]);
    } else {
      const selectable = personOptions
        .map(option => option.id)
        .filter(id => id !== 'shared');
      setSelectedPersonIds(selectable);
    }
    setSelectAll(!selectAll);
  };

  useEffect(() => {
    // Update "All" checkbox state when individual selections change
    const selectableIds = personOptions
      .map(option => option.id)
      .filter(id => id !== 'shared');
    const selectedNonShared = selectedPersonIds.filter(id => id !== 'shared');
    setSelectAll(
      selectableIds.length > 0 &&
      selectedNonShared.length === selectableIds.length
    );
  }, [personOptions, selectedPersonIds]);

  useEffect(() => {
    // Fetch categories on mount
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const cats = await CategoriesClient.getCategories('documents');
      // If defaultCategory provided but not present, prepend a temporary option
      let updated = cats;
      if (defaultCategory && !cats.some(c => c.name.toLowerCase() === defaultCategory.toLowerCase())) {
        updated = [
          { id: 'temp-default', name: defaultCategory, color: '#666', module: 'documents', created_at: '', updated_at: '' } as Category,
          ...cats
        ];
      }
      setCategories(updated);
      // Set initial category preference
      if (defaultCategory) {
        setCategory(defaultCategory);
      } else if (updated.length > 0) {
        setCategory(updated[0].name);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !category) return;

    setUploading(true);

    try {
      // Log session status before upload
      console.log('[Upload Modal] Starting upload...');
      console.log('[Upload Modal] Cookies:', document.cookie);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      formData.append('category', category);
      formData.append('source_page', sourcePage || 'manual');
      formData.append('source_id', sourceId || '');
      formData.append('uploaded_by', user?.id || '');
      
      const assigned = selectedPersonIds.length > 0 ? selectedPersonIds : ['shared'];
      formData.append('assigned_to', JSON.stringify(assigned));
      
      // Combine assignees and custom tags for metadata
      const normalizedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
      const allTags = Array.from(new Set([...assigned, ...normalizedTags]));
      formData.append('tags', JSON.stringify(allTags));
      
      formData.append('description', description);
      formData.append('expiration_date', expirationDate);
      formData.append('is_starred', isStarred.toString());

      const endpoint = sourcePage && sourceId 
        ? '/api/documents/auto-sync'
        : '/api/documents/upload';

      console.log('[Upload Modal] Sending request to:', endpoint);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: addCSRFToHeaders(),
        body: formData,
        credentials: 'include'
      });

      console.log('[Upload Modal] Response status:', response.status);
      console.log('[Upload Modal] Response headers:', Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        onUploadComplete();
      } else {
        const error = await response.json();
        console.error('[Upload Modal] Upload failed:', {
          status: response.status,
          error: error
        });
        alert(error.error || 'Failed to upload document');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-secondary rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-600/30">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-text-primary">Upload Document</h2>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* File Upload Zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive ? 'border-primary-500 bg-primary-500/10' : 'border-gray-600/30 bg-background-primary'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                id="file-upload"
                className="hidden"
                onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx"
              />
              
              {file ? (
                <div className="space-y-2">
                  <FileText className="mx-auto h-12 w-12 text-primary-500" />
                  <p className="text-lg font-medium text-text-primary">{file.name}</p>
                  <p className="text-sm text-text-muted">{formatBytes(file.size)}</p>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="mx-auto h-12 w-12 text-text-muted" />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer text-primary-500 hover:text-primary-400"
                  >
                    <span className="font-medium">Click to upload</span>
                    <span className="text-text-muted"> or drag and drop</span>
                  </label>
                  <p className="text-xs text-text-muted">
                    PDF, DOC, DOCX, JPG, PNG, XLS, XLSX up to 10MB
                  </p>
                </div>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                placeholder="Document title"
                required
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Category <span className="text-red-400">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                required
              >
                <option value="">Select a category</option>
                {categories.length === 0 ? (
                  <option value="Other">Other</option>
                ) : (
                  categories.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))
                )}
              </select>
            </div>

            {/* Assign To */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Assign To (optional)
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto p-3 bg-background-primary border border-gray-600/30 rounded-md">
                <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-700/20 p-1 rounded font-medium">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    className="rounded border-neutral-600 bg-neutral-700 text-primary-600 focus:ring-primary-500"
                  />
                  <span>{selectAll ? 'Clear' : 'Select All'}</span>
                </label>

                <div className="border-t border-gray-600/30 mt-2 pt-2">
                  {personOptions.map(option => (
                    <label key={option.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-700/20 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={selectedPersonIds.includes(option.id)}
                        onChange={() => handlePersonToggle(option.id)}
                        className="rounded border-neutral-600 bg-neutral-700 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm">{option.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-xs text-text-muted mt-1">
                Assigning tags who this document relates to; all users can still view every document.
              </p>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Additional Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                placeholder="passport, 2024, important"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                placeholder="Add notes about this document..."
              />
            </div>

            {/* Expiration Date */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Expiration Date (optional)
              </label>
              <input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
              <p className="text-xs text-text-muted mt-1">
                For passports, licenses, insurance policies, etc.
              </p>
            </div>

            {/* Star as Important */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isStarred}
                  onChange={(e) => setIsStarred(e.target.checked)}
                  className="rounded border-neutral-600 bg-neutral-700 text-yellow-500 focus:ring-yellow-500"
                />
                <span className="text-sm font-medium text-text-primary flex items-center gap-1">
                  <Star className="h-4 w-4" />
                  Star as Important
                </span>
              </label>
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-600/30">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-text-muted bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!file || !title || !category || uploading}
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
