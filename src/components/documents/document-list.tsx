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
    setLoading(true);
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
      console.error('Failed to load documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const requestSignedUrl = async (doc: Document) => {
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
        return null;
      }
      const { signedUrl } = await response.json();
      return signedUrl as string;
    } catch (error) {
      console.error('Failed to retrieve document link:', error);
      return null;
    }
  };

  const handleOpenDocument = async (doc: Document) => {
    const signedUrl = await requestSignedUrl(doc);
    if (!signedUrl) return;
    window.open(signedUrl, '_blank', 'noopener');
  };

  const handleCopyLink = async (doc: Document) => {
    try {
      const signedUrl = await requestSignedUrl(doc);
      if (!signedUrl) return;
      await navigator.clipboard.writeText(signedUrl);
      setCopyingDocId(doc.id);
      setTimeout(() => setCopyingDocId(null), 2000);
    } catch (error) {
      console.error('Failed to copy document link:', error);
    }
  };

  const handleDownload = async (doc: Document) => {
    const signedUrl = await requestSignedUrl(doc);
    if (!signedUrl) return;
    const link = document.createElement('a');
    link.href = signedUrl;
    link.download = doc.file_name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const formatCategoryLabel = (value?: string | null) => {
    if (!value) return 'Uncategorized';
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

  if (loading) {
    return (
      <div className="border border-gray-600/30 rounded-xl divide-y divide-gray-700/50">
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-4 py-3">
            <div className="h-4 w-1/3 bg-gray-700/70 rounded animate-pulse mb-2"></div>
            <div className="h-3 w-1/2 bg-gray-700/40 rounded animate-pulse"></div>
          </div>
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="border border-gray-600/30 rounded-xl p-6 text-center text-text-muted">
        <FileText className="h-10 w-10 mx-auto mb-3 text-text-muted/70" />
        No documents uploaded yet
      </div>
    );
  }

  return (
    <div className="border border-gray-600/30 rounded-xl divide-y divide-gray-700/50 overflow-hidden">
      {documents.map((doc) => {
        const title = (doc as any).title || doc.file_name;
        const participantIds = doc.assigned_to && doc.assigned_to.length > 0
          ? doc.assigned_to
          : doc.related_to && doc.related_to.length > 0
            ? doc.related_to
            : ['shared'];
        const participantLabels = participantIds
          .map(id => familyMemberMap[id] || id)
          .filter(Boolean);

        return (
          <div
            key={doc.id}
            className="flex flex-col gap-3 px-4 py-3 text-sm text-text-muted transition-colors hover:bg-gray-800/40 md:flex-row md:items-center md:justify-between"
          >
            <button
              type="button"
              onClick={() => handleOpenDocument(doc)}
              className="text-left flex-1 focus:outline-none"
            >
              <span className="block text-sm font-medium text-text-primary underline decoration-dotted">
                {title}
              </span>
              {doc.description && (
                <span className="mt-1 block text-xs text-text-muted">
                  {doc.description}
                </span>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-wide text-text-muted/80">
                <span className="flex items-center gap-1 normal-case">
                  <Calendar className="h-3 w-3" />
                  {new Date(doc.created_at).toLocaleDateString()}
                </span>
                <span className="normal-case">{formatFileSize(doc.file_size)}</span>
                <span className="rounded-md bg-gray-700/60 px-2 py-0.5 text-[10px] font-medium normal-case">
                  {formatCategoryLabel(doc.category)}
                </span>
              </div>
              {participantLabels.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                  {participantLabels.map(label => (
                    <span
                      key={`${doc.id}-${label}`}
                      className="inline-flex items-center gap-1 rounded-full border border-gray-600/40 px-2 py-0.5 text-[11px] text-text-primary"
                    >
                      <UserIcon className="h-3 w-3" />
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </button>

            <div className="flex items-center gap-2 self-end md:self-center">
              <button
                onClick={() => handleCopyLink(doc)}
                className={`text-text-muted hover:text-primary-400 transition-colors ${copyingDocId === doc.id ? 'text-green-400' : ''}`}
                title="Copy document link"
                aria-label="Copy document link"
              >
                {copyingDocId === doc.id ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
              <button
                onClick={() => handleDownload(doc)}
                className="text-text-muted hover:text-primary-400 transition-colors"
                title="Download document"
                aria-label="Download document"
              >
                <Download className="h-4 w-4" />
              </button>
              {user?.role === 'admin' && (
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="text-text-muted hover:text-urgent transition-colors"
                  title="Delete document"
                  aria-label="Delete document"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
