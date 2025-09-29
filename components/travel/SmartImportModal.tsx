'use client';

import React, { useState } from 'react';
import { X, Upload, Loader2, FileText, AlertCircle, CheckCircle } from 'lucide-react';

interface SmartImportModalProps {
  onClose: () => void;
  onImport: (data: any) => void;
  familyMembers: any[];
}

export default function SmartImportModal({ 
  onClose, 
  onImport, 
  familyMembers 
}: SmartImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [selectedTravelers, setSelectedTravelers] = useState<string[]>([]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleParse = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/travel/smart-parse', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to parse document');
      }

      const data = await response.json();
      setParsedData(data);
      
      // Auto-match travelers
      if (data.travelers && Array.isArray(data.travelers)) {
        const matchedTravelers: string[] = [];
        data.travelers.forEach((name: string) => {
          const member = familyMembers.find((m: any) => 
            m.name.toLowerCase().includes(name.toLowerCase()) || 
            name.toLowerCase().includes(m.name.toLowerCase())
          );
          if (member) {
            matchedTravelers.push(member.id);
          }
        });
        setSelectedTravelers(matchedTravelers);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse document');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (parsedData) {
      onImport({
        ...parsedData,
        travelers: selectedTravelers
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-secondary rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-600/30">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Smart Document Import
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-text-primary transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!parsedData ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Upload Travel Document
                </label>
                <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center">
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.txt,.doc,.docx"
                    onChange={handleFileSelect}
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer flex flex-col items-center gap-3"
                  >
                    <Upload className="h-12 w-12 text-gray-400" />
                    <div>
                      <p className="text-text-primary font-medium">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        PDF, Images, or Text documents
                      </p>
                    </div>
                  </label>
                  {file && (
                    <div className="mt-4 p-3 bg-background-primary rounded-lg">
                      <p className="text-sm text-text-primary">
                        Selected: {file.name}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button
                onClick={handleParse}
                disabled={!file || loading}
                className="w-full py-2 px-4 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Parsing Document...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Parse Document
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-green-400 font-medium">
                    Document parsed successfully!
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Review the extracted information below and make any necessary adjustments.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      Destination
                    </label>
                    <p className="text-text-primary">{parsedData.destination || 'Not found'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      Dates
                    </label>
                    <p className="text-text-primary">
                      {parsedData.start_date && parsedData.end_date
                        ? `${new Date(parsedData.start_date).toLocaleDateString()} - ${new Date(parsedData.end_date).toLocaleDateString()}`
                        : 'Not found'}
                    </p>
                  </div>
                </div>

                {parsedData.hotel_name && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      Hotel
                    </label>
                    <p className="text-text-primary">{parsedData.hotel_name}</p>
                    {parsedData.hotel_confirmation && (
                      <p className="text-sm text-gray-400">
                        Confirmation: {parsedData.hotel_confirmation}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Travelers
                  </label>
                  <div className="space-y-2">
                    {familyMembers.map((member: any) => (
                      <label key={member.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedTravelers.includes(member.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTravelers([...selectedTravelers, member.id]);
                            } else {
                              setSelectedTravelers(selectedTravelers.filter(id => id !== member.id));
                            }
                          }}
                          className="w-4 h-4 bg-background-primary border-gray-600 rounded"
                        />
                        <span className="text-sm text-text-primary">{member.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {parsedData.notes && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      Additional Notes
                    </label>
                    <p className="text-sm text-text-primary whitespace-pre-wrap">
                      {parsedData.notes}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setParsedData(null);
                    setFile(null);
                  }}
                  className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-text-primary font-medium rounded-lg transition-colors"
                >
                  Parse Another
                </button>
                <button
                  onClick={handleImport}
                  className="flex-1 py-2 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
                >
                  Import to Trip
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}