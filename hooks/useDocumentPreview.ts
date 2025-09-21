'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

  const openPreview = useCallback((doc: Document) => {
    const cacheKey = doc.id;
    const cached = cacheRef.current.get(cacheKey);

    if (cached) {
      setState({ doc, signedUrl: cached, loading: false, error: null });
      return;
    }

    const previewUrl = `/api/documents/preview/${doc.id}?ts=${Date.now()}`;
    cacheRef.current.set(cacheKey, previewUrl);
    setState({ doc, signedUrl: previewUrl, loading: false, error: null });
  }, []);

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
