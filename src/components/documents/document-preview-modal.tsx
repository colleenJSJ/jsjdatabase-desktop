'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Download } from 'lucide-react';
import { Document } from '@/types';
import { formatBytes, formatDate } from '@/lib/utils';

interface DocumentPreviewModalProps {
  doc: Document | null;
  signedUrl: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onDownload?: (doc: Document) => Promise<void> | void;
}

function getPreviewType(doc?: Document | null) {
  if (!doc?.file_type) return 'other';
  const type = doc.file_type.toLowerCase();
  if (type.includes('image')) return 'image';
  if (type.includes('pdf')) return 'pdf';
  if (type.includes('video')) return 'video';
  return 'other';
}

export function DocumentPreviewModal({ doc, signedUrl, loading, error, onClose, onDownload }: DocumentPreviewModalProps) {
  const previewType = useMemo(() => getPreviewType(doc), [doc]);
  const [contentLoading, setContentLoading] = useState(true);

  useEffect(() => {
    if (doc && signedUrl) {
      setContentLoading(true);
    }
  }, [doc?.id, signedUrl]);

  useEffect(() => {
    if (doc && signedUrl && previewType === 'other') {
      setContentLoading(false);
    }
  }, [doc?.id, signedUrl, previewType]);

  if (!doc) return null;

  const showSpinner = (loading || contentLoading) && !error;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
      <div className="relative flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-background-secondary border border-gray-700/60 shadow-2xl">
        <header className="flex items-start justify-between border-b border-gray-700/60 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{doc.title || doc.file_name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-muted">
              <span>{formatDate(doc.created_at)}</span>
              <span>•</span>
              <span>{formatBytes(doc.file_size || 0)}</span>
              {doc.category && (
                <span className="rounded-full bg-gray-700/60 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-primary">
                  {doc.category}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onDownload && (
              <button
                type="button"
                onClick={() => onDownload(doc)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-600/50 px-3 py-1.5 text-sm text-text-primary transition hover:border-gray-400 hover:text-white"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-transparent p-1.5 text-text-muted transition hover:border-gray-600 hover:text-white"
              aria-label="Close preview"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="relative flex-1 bg-background-primary">
          {showSpinner && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-t-transparent border-gray-500" />
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-sm text-red-400">
              <span>We couldn't load a preview for this document.</span>
              <span className="text-xs text-text-muted">{error}</span>
            </div>
          )}

          {!error && signedUrl && (
            <div className="h-full w-full overflow-hidden">
              {previewType === 'image' && (
                <div className="flex h-full w-full items-center justify-center bg-black">
                  <img
                    src={signedUrl}
                    alt={doc.title || doc.file_name}
                    className="max-h-full max-w-full object-contain"
                    onLoad={() => setContentLoading(false)}
                    onError={() => setContentLoading(false)}
                  />
                </div>
              )}
              {previewType === 'pdf' && (
                <iframe
                  src={signedUrl}
                  className="h-full w-full"
                  title={doc.title || doc.file_name}
                  onLoad={() => setContentLoading(false)}
                />
              )}
              {previewType === 'video' && (
                <video
                  src={signedUrl}
                  controls
                  className="h-full w-full bg-black"
                  onLoadedData={() => setContentLoading(false)}
                  onError={() => setContentLoading(false)}
                />
              )}
              {previewType === 'other' && (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center text-sm text-text-muted">
                  <p>No in-browser preview available for this file type.</p>
                  <button
                    type="button"
                    onClick={() => onDownload?.(doc)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-600/50 px-3 py-1.5 text-sm text-text-primary transition hover:border-gray-400 hover:text-white"
                  >
                    <Download className="h-4 w-4" />
                    Download instead
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
