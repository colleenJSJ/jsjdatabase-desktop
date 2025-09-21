'use client';

import { useCallback } from 'react';
import ApiClient from '@/lib/api/api-client';
import { Document } from '@/types';

type UseDocumentActionsOptions = {
  onDeleteSuccess?: (doc: Document) => void;
  onToggleStarSuccess?: (doc: Document) => void;
};

type MinimalDocument = Pick<Document, 'id' | 'file_name' | 'file_url' | 'is_starred'>;

async function resolveSignedUrl(doc: MinimalDocument) {
  const response = await ApiClient.post('/api/documents/get-signed-url', {
    documentId: doc.id,
    fileName: doc.file_name,
    fileUrl: doc.file_url,
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to get signed URL');
  }

  const payload = response.data as any;
  const signedUrl = payload?.signedUrl || payload?.signed_url;

  if (!signedUrl || typeof signedUrl !== 'string') {
    throw new Error('Signed URL missing from response');
  }

  return signedUrl;
}

export function useDocumentActions(options: UseDocumentActionsOptions = {}) {
  const { onDeleteSuccess, onToggleStarSuccess } = options;

  const copyLink = useCallback(async (doc: MinimalDocument) => {
    const signedUrl = await resolveSignedUrl(doc);
    await navigator.clipboard.writeText(signedUrl);
  }, []);

  const viewDocument = useCallback(async (doc: MinimalDocument) => {
    const signedUrl = await resolveSignedUrl(doc);
    window.open(signedUrl, '_blank', 'noopener,noreferrer');
  }, []);

  const downloadDocument = useCallback(async (doc: MinimalDocument) => {
    const signedUrl = await resolveSignedUrl(doc);
    const link = document.createElement('a');
    link.href = signedUrl;
    link.download = doc.file_name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const deleteDocument = useCallback(async (doc: MinimalDocument) => {
    const response = await ApiClient.delete(`/api/documents/${doc.id}`);
    if (!response.success) {
      throw new Error(response.error || 'Failed to delete document');
    }

    onDeleteSuccess?.(doc as Document);
  }, [onDeleteSuccess]);

  const toggleStar = useCallback(async (doc: MinimalDocument) => {
    const response = await ApiClient.patch(`/api/documents/${doc.id}`, { is_starred: !doc.is_starred });
    if (!response.success) {
      throw new Error(response.error || 'Failed to update document star');
    }

    onToggleStarSuccess?.({ ...(doc as Document), is_starred: !doc.is_starred });
  }, [onToggleStarSuccess]);

  return {
    copyLink,
    viewDocument,
    downloadDocument,
    deleteDocument,
    toggleStar,
  };
}
