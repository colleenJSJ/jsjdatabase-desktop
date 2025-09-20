'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/contexts/user-context';
import { addCSRFToHeaders } from '@/lib/security/csrf-client';
import { DocumentCard, DocumentItem } from '@/components/documents/DocumentCard';

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
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
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

  const handleCopyLink = async (doc: DocumentItem) => {
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
        <DocumentCard
          key={doc.id}
          document={doc}
          familyMemberMap={familyMemberMap}
          isCopying={copyingDocId === doc.id}
          onCopy={handleCopyLink}
          onDownload={async (documentItem) => {
            try {
              const response = await fetch('/api/documents/get-signed-url', {
                method: 'POST',
                headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                  documentId: documentItem.id,
                  fileName: documentItem.file_name,
                  fileUrl: documentItem.file_url,
                })
              });
              if (!response.ok) return;
              const { signedUrl } = await response.json();
              const link = document.createElement('a');
              link.href = signedUrl;
              link.download = documentItem.file_name;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            } catch {}
          }}
          onDelete={user?.role === 'admin' ? (docToDelete) => handleDelete(docToDelete.id) : undefined}
          canDelete={user?.role === 'admin'}
        />
      ))}
    </div>
  );
}
