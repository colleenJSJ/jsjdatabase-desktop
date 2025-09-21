'use client';

import { useState, useEffect } from 'react';
import { FileText, Download, Trash2, Calendar, User as UserIcon, Copy, CopyCheck } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import { addCSRFToHeaders } from '@/lib/security/csrf-client';

interface Document {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  file_type: string;
  category: string;
  source_page?: string;
  description?: string;
  uploaded_by: string;
  created_at: string;
  assigned_to?: string[];
  related_to?: string[];
}

interface DocumentListProps {
  category?: 'Medical' | 'Travel' | 'Legal' | 'Financial' | 'Personal' | 'Other' | 'pets' | 'Education';
  sourcePage?: 'Health' | 'Travel' | 'Documents' | 'Pets' | 'J3 Academics';
  limit?: number;
  refreshKey?: number;
  filterFn?: (doc: Document) => boolean;
  selectedPerson?: string;
}

export function DocumentList({ category, sourcePage, limit, refreshKey, filterFn, selectedPerson }: DocumentListProps) {
  const { user } = useUser();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [copyingDocId, setCopyingDocId] = useState<string | null>(null);
  const [familyMemberMap, setFamilyMemberMap] = useState<Record<string, string>>({ shared: 'Shared/Family' });

  useEffect(() => {
    fetchDocuments();
  }, [category, sourcePage, refreshKey, selectedPerson]);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const response = await fetch('/api/family-members');
        if (!response.ok) return;
        const data = await response.json();
        const members = data.members || [];
        const map: Record<string, string> = { shared: 'Shared/Family' };
        members.forEach((member: any) => {
          const name = member.display_name || member.name || member.email || 'Member';
          map[member.id] = name;
        });
        setFamilyMemberMap(map);
      } catch {
        // ignore fetch errors, fallback map already set
      }
    };

    fetchMembers();
  }, []);

  const fetchDocuments = async () => {
    try {
      let url = '/api/documents';
      const params = new URLSearchParams();
      if (category) params.append('category', category);
      if (sourcePage) params.append('sourcePage', sourcePage);
      if (limit) params.append('limit', limit.toString());
      if (selectedPerson) params.append('selected_person', selectedPerson);
      
      if (params.toString()) {
        url += '?' + params.toString();
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        let docs = data.documents || [];
        
        // Apply custom filter function if provided
        if (filterFn) {
          docs = docs.filter(filterFn);
        }
        
        // Server now handles person filtering via selected_person param
        
        setDocuments(docs);
      }
    } catch (error) {

    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async (doc: Document) => {
    try {
      const response = await fetch('/api/documents/get-signed-url', {
        method: 'POST',
        headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          documentId: doc.id,
          fileName: doc.file_name,
          fileUrl: doc.file_url,
        })
      });
      if (!response.ok) {
        console.error('Failed to fetch document link');
        return;
      }
      const { signedUrl } = await response.json();
      await navigator.clipboard.writeText(signedUrl);
      setCopyingDocId(doc.id);
      setTimeout(() => setCopyingDocId(null), 2000);
    } catch (error) {
      console.error('Failed to copy document link:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
        headers: addCSRFToHeaders(),
      });
      
      if (response.ok) {
        fetchDocuments();
      }
    } catch (error) {

    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (fileType: string) => {
    // You could expand this to show different icons for different file types
    return <FileText className="h-5 w-5" />;
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-background-secondary border border-gray-600/30 rounded-lg p-4">
            <div className="animate-pulse">
              <div className="h-5 bg-gray-700 rounded w-1/3 mb-2"></div>
              <div className="h-4 bg-gray-700 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-8 text-center">
        <FileText className="h-12 w-12 text-text-muted mx-auto mb-3" />
        <p className="text-text-muted">No documents uploaded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {documents.map((doc) => (
        <div key={doc.id} className="bg-background-secondary border border-gray-600/30 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <div className="text-text-muted mt-0.5">
                  {getFileIcon(doc.file_type)}
                </div>
              <div className="flex-1">
                <h3 className="font-medium text-text-primary mb-1">{(doc as any).title || doc.file_name}</h3>
                {doc.description && (
                  <p className="text-sm text-text-muted mb-2">{doc.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(doc.created_at).toLocaleDateString()}
                  </span>
                  <span>{formatFileSize(doc.file_size)}</span>
                  <span className="px-2 py-0.5 bg-gray-700 rounded">
                    {doc.category}
                  </span>
                </div>
                {(() => {
                  const ids = doc.assigned_to && doc.assigned_to.length > 0
                    ? doc.assigned_to
                    : doc.related_to && doc.related_to.length > 0
                      ? doc.related_to
                      : ['shared'];
                  const labels = ids
                    .map(id => familyMemberMap[id] || id)
                    .filter(Boolean);
                  if (labels.length === 0) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {labels.map(label => (
                        <span
                          key={`${doc.id}-${label}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-700/60 text-text-primary rounded-full border border-gray-600/40"
                        >
                          <UserIcon className="h-3 w-3" />
                          {label}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopyLink(doc)}
                className={`text-text-muted hover:text-primary-400 transition-colors ${copyingDocId === doc.id ? 'text-green-400' : ''}`}
                title="Copy document link"
              >
                {copyingDocId === doc.id ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = `/api/documents/download/${doc.id}`;
                  link.rel = 'noopener';
                  link.download = doc.file_name || 'document';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="text-text-muted hover:text-primary-400 transition-colors"
                title="Download"
              >
                <Download className="h-4 w-4" />
              </button>
              {user?.role === 'admin' && (
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="text-text-muted hover:text-urgent transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
