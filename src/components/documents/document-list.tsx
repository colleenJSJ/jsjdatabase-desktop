'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import { Document } from '@/types';
import ApiClient from '@/lib/api/api-client';
import { DocumentCard } from '@/components/documents/document-card';
import { DocumentPreviewModal } from '@/components/documents/document-preview-modal';
import { useDocumentActions } from '@/hooks/useDocumentActions';
import { useDocumentPreview } from '@/hooks/useDocumentPreview';

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
  const [familyMemberMap, setFamilyMemberMap] = useState<Record<string, string>>({ shared: 'Shared/Family' });

  const { copyLink, viewDocument, downloadDocument, deleteDocument } = useDocumentActions();
  const {
    doc: previewDoc,
    signedUrl: previewUrl,
    loading: previewLoading,
    error: previewError,
    openPreview,
    closePreview,
  } = useDocumentPreview();

  const fetchDocuments = useCallback(async () => {
    try {
      const params: Record<string, any> = {};
      if (category) params.category = category;
      if (sourcePage) params.sourcePage = sourcePage;
      if (limit) params.limit = limit;
      if (selectedPerson) params.selected_person = selectedPerson;

      const response = await ApiClient.get('/api/documents', params);

      if (response.success) {
        const payload = response.data as any;
        let docs: Document[] = payload?.documents || payload || [];
        if (filterFn) {
          docs = docs.filter(filterFn);
        }
        setDocuments(docs);
      } else {
        setDocuments([]);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [category, sourcePage, limit, selectedPerson, filterFn]);

  useEffect(() => {
    setLoading(true);
    fetchDocuments();
  }, [fetchDocuments, refreshKey]);

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
      } catch (error) {
        console.error('Failed to fetch family members for document list:', error);
      }
    };

    fetchMembers();
  }, []);

  const handleCopyLink = async (doc: Document) => {
    try {
      await copyLink(doc);
    } catch (error) {
      console.error('Failed to copy document link:', error);
    }
  };

  const handleView = async (doc: Document) => {
    try {
      await viewDocument(doc);
    } catch (error) {
      console.error('Failed to open document:', error);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      await downloadDocument(doc);
    } catch (error) {
      console.error('Failed to download document:', error);
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      await deleteDocument(doc);
      setDocuments(prev => prev.filter(item => item.id !== doc.id));
    } catch (error) {
      console.error('Failed to delete document:', error);
      alert('Failed to delete document. Please try again.');
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
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5">
        {documents.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            familyMemberMap={familyMemberMap}
            onCopy={handleCopyLink}
            onView={handleView}
            onDownload={handleDownload}
            onDelete={user?.role === 'admin' ? handleDelete : undefined}
            onOpen={openPreview}
          />
        ))}
      </div>

      <DocumentPreviewModal
        doc={previewDoc}
        signedUrl={previewUrl}
        loading={previewLoading}
        error={previewError}
        onClose={closePreview}
        onDownload={handleDownload}
      />
    </>
  );
}
