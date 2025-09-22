'use client';

import { useState } from 'react';
import { Plus, Upload, X, FileText, PawPrint } from 'lucide-react';
import { addCSRFToHeaders } from '@/lib/security/csrf-client';
import { FILE_UPLOAD } from '@/constants';

interface Pet {
  id: string;
  name: string;
}

interface PetDocumentUploadProps {
  pets: Pet[];
  selectedPetId?: string;
  onUploadSuccess?: () => void;
}

export function PetDocumentUpload({ 
  pets,
  selectedPetId,
  onUploadSuccess
}: PetDocumentUploadProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [selectedPets, setSelectedPets] = useState<string[]>(
    selectedPetId && selectedPetId !== 'all' ? [selectedPetId] : []
  );
  const [documentType, setDocumentType] = useState<'medical' | 'insurance' | 'registration' | 'photo' | 'other'>('medical');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const getPetFirstName = (fullName: string) => {
    return fullName.split(' ')[0];
  };

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

    if (selectedPets.length === 0) {
      setError('Please select at least one pet this document relates to');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', 'pets');
      formData.append('sourcePage', 'Pets');
      formData.append('sourceId', selectedPets[0]); // Primary pet
      formData.append('description', `Document Type: ${documentType}\nRelated Pets: ${selectedPets.map(id => getPetFirstName(pets.find(p => p.id === id)?.name || '')).join(', ')}\n${description}`);
      formData.append('document_type', documentType);
      
      // Add pet names as tags for better searchability
      const petNames = selectedPets.map(id => getPetFirstName(pets.find(p => p.id === id)?.name || ''));
      formData.append('tags', JSON.stringify([...petNames, documentType]));

      formData.append('relatedPeople', JSON.stringify(selectedPets));
      formData.append('relatedPerson', selectedPets[0]);

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
      setSelectedPets(selectedPetId && selectedPetId !== 'all' ? [selectedPetId] : []);
      setDocumentType('medical');
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
    setSelectedPets(selectedPetId && selectedPetId !== 'all' ? [selectedPetId] : []);
    setDocumentType('medical');
    setError('');
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
      >
        <Plus className="w-5 h-5" />
        Add Document
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background-secondary rounded-xl max-w-md w-full border border-gray-600/30">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-text-primary">
                  Upload Pet Document
                </h2>
                <button
                  onClick={handleClose}
                  className="text-text-muted hover:text-text-primary transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Pet Selection - REQUIRED */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Which pet(s) does this document relate to? *
                  </label>
                  <div className="space-y-2 p-3 bg-background-primary rounded-md border border-gray-600/30">
                    {pets.map((pet) => (
                      <label key={pet.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPets.includes(pet.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPets([...selectedPets, pet.id]);
                            } else {
                              setSelectedPets(selectedPets.filter(p => p !== pet.id));
                            }
                            setError(''); // Clear error when selection changes
                          }}
                          className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-text-primary flex items-center gap-2">
                          <PawPrint className="h-3 w-3 text-text-muted" />
                          {getPetFirstName(pet.name)}
                        </span>
                      </label>
                    ))}
                  </div>
                  {selectedPets.length === 0 && (
                    <p className="text-xs text-text-muted mt-1">Required: Select at least one pet</p>
                  )}
                </div>

                {/* Document Type */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Document Type *
                  </label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  >
                    <option value="medical">Medical Records</option>
                    <option value="insurance">Insurance</option>
                    <option value="registration">Registration/License</option>
                    <option value="photo">Photos</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* File Selection */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Select File *
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
                    placeholder="Add any notes or details about this document..."
                  />
                </div>

                {error && (
                  <p className="text-sm text-urgent">{error}</p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleUpload}
                    disabled={!file || selectedPets.length === 0 || uploading}
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
