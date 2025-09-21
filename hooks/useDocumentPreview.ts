'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ApiClient from '@/lib/api/api-client';
import { Document } from '@/types';

interface PreviewState {
  doc: Document | null;
  signedUrl: string | null;
  loading: boolean;
  error: string | null;
}

export function useDocumentPreview() {
  const cacheRef = useRef<Map<string, string>>(new Map());
  const [state, setState] = useState<PreviewState>({
    doc: null,
    signedUrl: null,
    loading: false,
    error: null,
  });

  const closePreview = useCallback(() => {
    setState(prev => ({ ...prev, doc: null, signedUrl: null, loading: false, error: null }));
  }, []);

  const fetchSignedUrl = useCallback(async (doc: Document) => {
    const cacheKey = doc.id;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setState({ doc, signedUrl: cached, loading: false, error: null });
      return;
    }

    setState({ doc, signedUrl: null, loading: true, error: null });
    const response = await ApiClient.post('/api/documents/get-signed-url', {
      documentId: doc.id,
      fileName: doc.file_name,
      fileUrl: doc.file_url,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to load document preview');
    }

    const payload = response.data as any;
    const signedUrl = payload?.signedUrl || payload?.signed_url;
    if (!signedUrl) {
      throw new Error('Preview URL missing from response');
    }

    cacheRef.current.set(cacheKey, signedUrl);
    setState({ doc, signedUrl, loading: false, error: null });
  }, []);

  const openPreview = useCallback(async (doc: Document) => {
    try {
      await fetchSignedUrl(doc);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load document preview';
      setState({ doc, signedUrl: null, loading: false, error: message });
    }
  }, [fetchSignedUrl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePreview();
      }
    };

    if (state.doc) {
      window.addEventListener('keydown', onKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [state.doc, closePreview]);

  return {
    doc: state.doc,
    signedUrl: state.signedUrl,
    loading: state.loading,
    error: state.error,
    openPreview,
    closePreview,
  };
}
