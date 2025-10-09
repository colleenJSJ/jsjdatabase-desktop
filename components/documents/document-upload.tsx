'use client';

import { useState } from 'react';
import { Upload, X, FileText } from 'lucide-react';
import { FILE_UPLOAD } from '@/constants';
import { usePersonFilter } from '@/contexts/person-filter-context';
import { addCSRFToHeaders } from '@/lib/security/csrf-client';

interface DocumentUploadProps {
  category: 'Medical' | 'Travel' | 'Legal' | 'Financial' | 'Personal' | 'Other' | 'pets' | 'Education';
  sourcePage: 'Health' | 'Travel' | 'Documents' | 'Pets' | 'J3 Academics';
  sourceId?: string;
  onUploadSuccess?: () => void;
  buttonText?: string;
  selectedPerson?: string;
  showCategorySelector?: boolean;
  showPersonSelector?: boolean;
  availableCategories?: string[];
  availablePeople?: { id: string; name: string }[];
}

export function DocumentUpload({ 
  category, 
  sourcePage,
  sourceId, 
  onUploadSuccess,
  buttonText = 'Upload Document',
  selectedPerson,
  showCategorySelector = false,
  showPersonSelector = false,
  availableCategories = [],
  availablePeople = []
}: DocumentUploadProps) {
  const { selectedPersonId } = usePersonFilter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(category || 'Education');
  const effectiveSelected = selectedPerson || selectedPersonId || '';
  const [selectedFamilyMembers, setSelectedFamilyMembers] = useState<string[]>(effectiveSelected ? [effectiveSelected] : []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Check file size
      if (selectedFile.size > FILE_UPLOAD.MAX_SIZE_BYTES) {
        setError(`File size must be less than ${FILE_UPLOAD.MAX_SIZE_MB}MB`);
        return;
      }
      setFile(selectedFile);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    if (showPersonSelector && selectedFamilyMembers.length === 0) {
      setError('Please select at least one family member');
      return;
    }

    if (showCategorySelector && !selectedCategory) {
      setError('Please select a document category');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', showCategorySelector ? selectedCategory : category);
      formData.append('sourcePage', sourcePage);
      if (sourceId) {
        formData.append('sourceId', sourceId);
      }
      
      // Add selected people to description if provided
      let fullDescription = description;
      if (selectedFamilyMembers.length > 0) {
        const memberNames = selectedFamilyMembers
          .map(id => availablePeople.find(p => p.id === id)?.name || id)
          .join(', ');
        fullDescription = `Family Members: ${memberNames}${description ? '\n' + description : ''}`;
        // Send the first selected person as primary
        formData.append('relatedPerson', selectedFamilyMembers[0]);
        // Send all selected people as JSON array
        formData.append('relatedPeople', JSON.stringify(selectedFamilyMembers));
      }
      formData.append('description', fullDescription);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: addCSRFToHeaders(),
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      // Success
      setIsModalOpen(false);
      setFile(null);
      setDescription('');
      setSelectedCategory(category || 'Education');
      setSelectedFamilyMembers(selectedPerson ? [selectedPerson] : []);
      onUploadSuccess?.();
    } catch (err) {
      setError('Failed to upload document. Please try again.');

    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setFile(null);
    setDescription('');
    setError('');
    setSelectedCategory(category || 'Education');
    setSelectedFamilyMembers(selectedPerson ? [selectedPerson] : []);
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-button-create hover:bg-button-create/90 text-white font-medium rounded-md transition-colors"
      >
        <Upload className="h-4 w-4" />
        {buttonText}
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background-secondary rounded-lg max-w-md w-full border border-gray-600/30">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-text-primary">
                  Upload {showCategorySelector ? '' : category} Document
                </h2>
                <button
                  onClick={handleClose}
                  className="text-text-muted hover:text-text-primary transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Category Selection */}
                {showCategorySelector && (
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      Document Category *
                    </label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => {
                        setSelectedCategory(e.target.value);
                        setError('');
                      }}
                      className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                    >
                      <option value="">Select a category...</option>
                      {availableCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Family Member Selection */}
                {showPersonSelector && availablePeople.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      Family Member(s) *
                    </label>
                    <div className="space-y-2 p-3 bg-background-primary rounded-md border border-gray-600/30 max-h-48 overflow-y-auto">
                      {availablePeople.map((person) => (
                        <label key={person.id} className="flex items-center gap-2 cursor-pointer hover:bg-background-secondary rounded p-1">
                          <input
                            type="checkbox"
                            checked={selectedFamilyMembers.includes(person.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedFamilyMembers([...selectedFamilyMembers, person.id]);
                              } else {
                                setSelectedFamilyMembers(selectedFamilyMembers.filter(id => id !== person.id));
                              }
                              setError('');
                            }}
                            className="w-4 h-4 text-button-create bg-gray-800 border-gray-600 rounded focus:ring-button-create focus:ring-2"
                          />
                          <span className="text-text-primary">{person.name}</span>
                        </label>
                      ))}
                    </div>
                    {selectedFamilyMembers.length === 0 && (
                      <p className="text-xs text-text-muted mt-1">Select at least one family member</p>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Select File
                  </label>
                  <div className="border-2 border-dashed border-gray-600/50 rounded-lg p-6 text-center">
                    {!file ? (
                      <label className="cursor-pointer">
                        <FileText className="h-12 w-12 text-text-muted mx-auto mb-3" />
                        <span className="text-sm text-text-muted block mb-2">
                          Click to select a file
                        </span>
                        <span className="text-xs text-text-muted/70">
                          PDF, DOC, DOCX, JPG, PNG (max {FILE_UPLOAD.MAX_SIZE_MB}MB)
                        </span>
                        <input
                          type="file"
                          onChange={handleFileChange}
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          className="hidden"
                        />
                      </label>
                    ) : (
                      <div>
                        <FileText className="h-12 w-12 text-primary-400 mx-auto mb-3" />
                        <p className="text-sm text-text-primary mb-2">{file.name}</p>
                        <p className="text-xs text-text-muted mb-3">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <button
                          onClick={() => setFile(null)}
                          className="text-xs text-urgent hover:underline"
                        >
                          Remove file
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                    placeholder="Add any notes or details about this document..."
                  />
                </div>

                {error && (
                  <p className="text-sm text-urgent">{error}</p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleUpload}
                    disabled={!file || uploading}
                    className="flex-1 py-2 px-4 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-700/50 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
                  >
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                  <button
                    onClick={handleClose}
                    disabled={uploading}
                    className="flex-1 py-2 px-4 bg-background-primary hover:bg-background-primary/80 text-text-primary font-medium rounded-md border border-gray-600/30 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
