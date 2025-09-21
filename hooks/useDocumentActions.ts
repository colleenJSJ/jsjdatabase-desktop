'use client';

import { useCallback } from 'react';
import ApiClient from '@/lib/api/api-client';
import { Document } from '@/types';

type UseDocumentActionsOptions = {
  onDeleteSuccess?: (doc: Document) => void;
  onToggleStarSuccess?: (doc: Document) => void;
};

type MinimalDocument = Pick<Document, 'id' | 'file_name' | 'file_url' | 'is_starred'>;

async function resolveSignedUrl(doc: MinimalDocument, params?: Record<string, any>) {
  const response = await ApiClient.post('/api/documents/get-signed-url', {
    documentId: doc.id,
    fileName: doc.file_name,
    fileUrl: doc.file_url,
    ...params,
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
    const previewUrl = `/api/documents/preview/${doc.id}?ts=${Date.now()}`;
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  }, []);

  const downloadDocument = useCallback(async (doc: MinimalDocument) => {
    const response = await fetch(`/api/documents/preview/${doc.id}?mode=download&ts=${Date.now()}`);
    if (!response.ok) {
      throw new Error('Failed to download document');
    }

    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] ? decodeURIComponent(match[1]) : doc.file_name;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
