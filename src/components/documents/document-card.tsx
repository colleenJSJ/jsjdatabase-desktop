'use client';

import { useState, MouseEvent } from 'react';
import { Star, Copy, CopyCheck, Eye, Download, Trash2 } from 'lucide-react';
import { Document } from '@/types';
import { formatBytes, formatDate } from '@/lib/utils';
import {
  buildAssignedSummary,
  cleanDocumentTitle,
  formatSourcePage,
  getDaysUntilExpiration,
  getDocumentCategoryBadge,
  getDocumentRelatedNames,
  getFileIcon,
} from './document-helpers';

type DocumentCardProps = {
  doc: Document;
  familyMemberMap?: Record<string, string>;
  onCopy: (doc: Document) => Promise<void> | void;
  onView: (doc: Document) => Promise<void> | void;
  onDownload: (doc: Document) => Promise<void> | void;
  onDelete?: (doc: Document) => Promise<void> | void;
  onStarToggle?: (doc: Document) => Promise<void> | void;
};

export function DocumentCard({
  doc,
  familyMemberMap,
  onCopy,
  onView,
  onDownload,
  onDelete,
  onStarToggle,
}: DocumentCardProps) {
  const [isCopying, setIsCopying] = useState(false);
  const relatedNames = familyMemberMap ? getDocumentRelatedNames(doc, familyMemberMap) : [];
  const assignedSummary = buildAssignedSummary(relatedNames);
  const expirationBadge = getDaysUntilExpiration(doc.expiration_date ?? null);
  const categoryBadge = getDocumentCategoryBadge(doc.category);
  const sourceLabel = formatSourcePage(doc.source_page);

  const handleAction = async (
    event: MouseEvent<HTMLButtonElement>,
    action?: (document: Document) => Promise<void> | void,
    onComplete?: () => void
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!action) return;

    try {
      await action(doc);
      onComplete?.();
    } catch (error) {
      console.error('[DocumentCard] action failed', error);
    }
  };

  return (
    <div
      className="relative group flex flex-col items-center justify-between rounded-xl border border-transparent bg-[#30302E] p-4 min-h-[190px] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#3A3A38] focus-within:border-[#3A3A38]"
    >
      <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-60 group-focus-within:opacity-60 z-10" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="invisible flex gap-2 rounded-lg bg-[#262625]/90 p-2 shadow-sm ring-1 ring-gray-700/60 opacity-0 transition duration-200 ease-out group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 z-20">
          <button
            type="button"
            onClick={(event) => handleAction(event, onCopy, () => {
              setIsCopying(true);
              setTimeout(() => setIsCopying(false), 2000);
            })}
            className={`flex h-8 w-8 items-center justify-center rounded-md border border-gray-600/40 bg-[#262625]/80 text-text-primary transition hover:border-gray-500 hover:bg-[#262625] ${isCopying ? 'text-green-400' : ''}`}
            title="Copy link"
            aria-label="Copy document link"
          >
            {isCopying ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={(event) => handleAction(event, onView)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-600/40 bg-[#262625]/80 text-text-primary transition hover:border-blue-400/60 hover:text-blue-400"
            title="View"
            aria-label="View document"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(event) => handleAction(event, onDownload)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-600/40 bg-[#262625]/80 text-text-primary transition hover:border-green-400/60 hover:text-green-400"
            title="Download"
            aria-label="Download document"
          >
            <Download className="h-4 w-4" />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={(event) => handleAction(event, onDelete)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-600/40 bg-[#262625]/80 text-text-primary transition hover:border-red-400/60 hover:text-red-400"
              title="Delete"
              aria-label="Delete document"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {onStarToggle && (
        <button
          type="button"
          onClick={(event) => handleAction(event, onStarToggle)}
          className={`absolute top-3 right-3 z-30 rounded p-1 transition-colors ${
            doc.is_starred ? 'text-yellow-500' : 'text-gray-500 hover:text-yellow-500'
          }`}
          title={doc.is_starred ? 'Unstar' : 'Star'}
          aria-label={doc.is_starred ? 'Remove star' : 'Add star'}
        >
          <Star className="h-4 w-4" fill={doc.is_starred ? 'currentColor' : 'none'} />
        </button>
      )}

      <div className="relative z-10 flex w-full flex-1 flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-700/40 text-text-primary transition-opacity duration-200 group-hover:opacity-60 group-focus-within:opacity-60">
          {getFileIcon(doc.file_type)}
        </div>
        <p
          className="text-sm font-semibold text-text-primary transition-opacity duration-200 group-hover:opacity-60 group-focus-within:opacity-60"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          title={cleanDocumentTitle(doc.title, doc.file_name)}
        >
          {cleanDocumentTitle(doc.title, doc.file_name)}
        </p>
        <div className="flex items-center gap-1 text-[11px] text-text-muted transition-opacity duration-200 group-hover:opacity-30 group-focus-within:opacity-30">
          <span>{formatBytes(doc.file_size || 0)}</span>
          <span>•</span>
          <span>{formatDate(doc.created_at)}</span>
        </div>
        <span className="text-[11px] font-medium text-[#AB9BBF] transition-opacity duration-200 group-hover:opacity-30 group-focus-within:opacity-30">
          {doc.source_page ? `From ${sourceLabel}` : 'Manual Upload'}
        </span>
        {assignedSummary && (
          <span
            className="w-full truncate px-1 text-[10px] text-[#C2C0B6] transition-opacity duration-200 group-hover:opacity-30 group-focus-within:opacity-30"
            title={assignedSummary}
          >
            {assignedSummary}
          </span>
        )}
        {expirationBadge !== null && (
          <span
            className={`text-[10px] transition-opacity duration-200 group-hover:opacity-30 group-focus-within:opacity-30 ${expirationBadge <= 30 ? 'text-red-400' : 'text-text-muted'}`}
          >
            {expirationBadge > 0 ? `Expires in ${expirationBadge} days` : 'Expired'}
          </span>
        )}
      </div>

      <span
        className={`relative z-10 mt-3 inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium text-white transition-opacity duration-200 group-hover:opacity-60 group-focus-within:opacity-60 ${categoryBadge?.className ?? ''}`}
        style={categoryBadge?.style}
      >
        {categoryBadge?.name || doc.category}
      </span>
    </div>
  );
}
