'use client';

import { Calendar, Copy, CopyCheck, Download, FileText, Trash2, User as UserIcon } from 'lucide-react';
import { useMemo } from 'react';

export interface DocumentItem {
  id: string;
  file_name: string;
  file_url: string;
  file_size?: number;
  file_type?: string;
  category?: string;
  source_page?: string;
  description?: string;
  uploaded_by?: string;
  created_at: string;
  assigned_to?: string[];
  related_to?: string[];
  title?: string;
}

interface DocumentCardProps {
  document: DocumentItem;
  familyMemberMap?: Record<string, string>;
  isCopying?: boolean;
  onCopy?: (doc: DocumentItem) => void;
  onDownload?: (doc: DocumentItem) => void;
  onOpen?: (doc: DocumentItem) => void;
  onDelete?: (doc: DocumentItem) => void;
  canDelete?: boolean;
}

const formatFileSize = (bytes?: number) => {
  if (!bytes || Number.isNaN(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = () => <FileText className="h-5 w-5" />;

export function DocumentCard({
  document,
  familyMemberMap = {},
  isCopying = false,
  onCopy,
  onDownload,
  onOpen,
  onDelete,
  canDelete,
}: DocumentCardProps) {
  const labels = useMemo(() => {
    const ids = document.assigned_to && document.assigned_to.length > 0
      ? document.assigned_to
      : document.related_to && document.related_to.length > 0
        ? document.related_to
        : familyMemberMap['shared'] ? ['shared'] : [];
    return ids
      .map(id => familyMemberMap[id] || id)
      .filter(Boolean);
  }, [document.assigned_to, document.related_to, familyMemberMap]);

  return (
    <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <div className="text-text-muted mt-0.5">
            {getFileIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-text-primary mb-1 truncate">{document.title || document.file_name}</h3>
            {document.description && (
              <p className="text-sm text-text-muted mb-2 line-clamp-2">{document.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(document.created_at).toLocaleDateString()}
              </span>
              {formatFileSize(document.file_size) && (
                <span>{formatFileSize(document.file_size)}</span>
              )}
              {document.category && (
                <span className="px-2 py-0.5 bg-gray-700 rounded capitalize">
                  {document.category}
                </span>
              )}
            </div>
            {labels.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {labels.map(label => (
                  <span
                    key={`${document.id}-${label}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-700/60 text-text-primary rounded-full border border-gray-600/40"
                  >
                    <UserIcon className="h-3 w-3" />
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onCopy && (
            <button
              onClick={() => onCopy(document)}
              className={`text-text-muted hover:text-primary-400 transition-colors ${isCopying ? 'text-green-400' : ''}`}
              title="Copy document link"
            >
              {isCopying ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          )}
          {onDownload && (
            <button
              onClick={() => onDownload(document)}
              className="text-text-muted hover:text-primary-400 transition-colors"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
          {canDelete && onDelete && (
            <button
              onClick={() => onDelete(document)}
              className="text-text-muted hover:text-urgent transition-colors"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {onOpen && (
        <button
          onClick={() => onOpen(document)}
          className="mt-3 text-xs text-primary-400 hover:text-primary-300 transition-colors"
        >
          Open document
        </button>
      )}
    </div>
  );
}
