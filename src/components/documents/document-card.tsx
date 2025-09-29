'use client';

import { useState, useEffect, MouseEvent, KeyboardEvent } from 'react';
import { Star, Copy, CopyCheck, Download, Trash2 } from 'lucide-react';
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
  isImageDocument,
} from './document-helpers';

type DocumentCardProps = {
  doc: Document;
  familyMemberMap?: Record<string, string>;
  onCopy: (doc: Document) => Promise<void> | void;
  onDownload: (doc: Document) => Promise<void> | void;
  onDelete?: (doc: Document) => Promise<void> | void;
  onStarToggle?: (doc: Document) => Promise<void> | void;
  onOpen?: (doc: Document) => Promise<void> | void;
};

export function DocumentCard({
  doc,
  familyMemberMap,
  onCopy,
  onDownload,
  onDelete,
  onStarToggle,
  onOpen,
}: DocumentCardProps) {
  const [isCopying, setIsCopying] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const relatedNames = familyMemberMap ? getDocumentRelatedNames(doc, familyMemberMap) : [];
  const assignedSummary = buildAssignedSummary(relatedNames);
  const expirationBadge = getDaysUntilExpiration(doc.expiration_date ?? null);
  const categoryBadge = getDocumentCategoryBadge(doc.category);
  const sourceLabel = formatSourcePage(doc.source_page);
  const isImage = isImageDocument({
    file_type: doc.file_type,
    file_name: doc.file_name,
    file_url: doc.file_url,
  });
  const uploaderName = familyMemberMap && doc.uploaded_by ? familyMemberMap[doc.uploaded_by] : undefined;
  const ownerDisplayName = assignedSummary || uploaderName || 'Shared/Family';
  const ownerInitial = ownerDisplayName.trim().charAt(0).toUpperCase() || '?';
  const metadataItems: { label: string; tone?: 'danger' }[] = [
    { label: formatBytes(doc.file_size || 0) },
    { label: formatDate(doc.created_at) },
    { label: doc.source_page ? `From ${sourceLabel}` : 'Manual Upload' },
  ];

  if (expirationBadge !== null) {
    metadataItems.push({
      label: expirationBadge > 0 ? `Expires in ${expirationBadge} days` : 'Expired',
      tone: expirationBadge <= 30 ? 'danger' : undefined,
    });
  }

  useEffect(() => {
    if (!isImage) {
      setThumbnailUrl(null);
      setThumbnailLoaded(false);
      return;
    }

    const cache = (window as any).__docThumbCache ?? ((window as any).__docThumbCache = new Map<string, string>());
    const cached = cache.get(doc.id);
    if (cached) {
      setThumbnailUrl(cached);
      setThumbnailLoaded(true);
      return;
    }

    setThumbnailLoaded(false);
    const url = `/api/documents/preview/${doc.id}?mode=thumbnail`;
    cache.set(doc.id, url);
    setThumbnailUrl(url);
  }, [doc, isImage]);

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

  const handleOpen = async () => {
    if (!onOpen) return;
    try {
      await onOpen(doc);
    } catch (error) {
      console.error('[DocumentCard] open failed', error);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onOpen) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen();
    }
  };

  return (
    <div
      className={`group relative mx-auto flex w-full max-w-[330px] flex-col overflow-hidden rounded-[10px] border border-[#3A3A38] bg-[#30302E] shadow-sm transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#4A4A48] hover:shadow-lg focus-within:border-[#4A4A48] ${
        onOpen ? 'cursor-pointer' : ''
      }`}
      onClick={onOpen ? handleOpen : undefined}
      onKeyDown={handleKeyDown}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-50 group-focus-within:opacity-50 z-10" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20">
        <div className="invisible flex gap-3 rounded-full bg-[#1F1F1E]/85 px-3 py-2 text-text-primary opacity-0 shadow-lg ring-1 ring-[#4A4A48]/70 transition duration-200 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 pointer-events-auto">
          <button
            type="button"
            onClick={(event) => handleAction(event, onCopy, () => {
              setIsCopying(true);
              setTimeout(() => setIsCopying(false), 2000);
            })}
            className={`flex h-10 w-10 items-center justify-center rounded-full border border-[#4A4A48]/70 bg-[#2A2A28]/90 transition-colors hover:border-[#6C6C6A] hover:text-white ${
              isCopying ? 'text-green-400' : 'text-[#D2D2D0]'
            }`}
            title="Copy link"
            aria-label="Copy document link"
          >
            {isCopying ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={(event) => handleAction(event, onDownload)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#4A4A48]/70 bg-[#2A2A28]/90 text-[#D2D2D0] transition-colors hover:border-[#6C6C6A] hover:text-[#A8E6A1]"
            title="Download"
            aria-label="Download document"
          >
            <Download className="h-4 w-4" />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={(event) => handleAction(event, onDelete)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#4A4A48]/70 bg-[#2A2A28]/90 text-[#D2D2D0] transition-colors hover:border-[#6C6C6A] hover:text-[#F28482]"
              title="Delete"
              aria-label="Delete document"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="relative z-0 h-[216px] w-full overflow-hidden bg-[#2C2C2A]">
        <div className="absolute inset-0 rounded-t-[10px] bg-black/10 opacity-0 transition-opacity duration-200 group-hover:opacity-20 group-focus-within:opacity-20" />
        <div className="flex h-full w-full items-center justify-center text-text-primary">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={doc.title || doc.file_name}
              className={`h-full w-full object-cover transition-opacity ${thumbnailLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setThumbnailLoaded(true)}
              onError={() => {
                setThumbnailLoaded(false);
                setThumbnailUrl(null);
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-primary/80">
              {getFileIcon(doc.file_type, doc.file_name || doc.file_url)}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <div className="flex items-start justify-between gap-2">
          <p
            className="flex-1 truncate text-[14px] font-medium text-white"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            title={cleanDocumentTitle(doc.title, doc.file_name)}
          >
            {cleanDocumentTitle(doc.title, doc.file_name)}
          </p>
          {onStarToggle && (
            <button
              type="button"
              onClick={(event) => handleAction(event, onStarToggle)}
              className={`h-7 w-7 shrink-0 rounded-full bg-transparent text-[0px] transition-colors ${
                doc.is_starred ? 'text-[#E9C46A]' : 'text-[#7A7A78] hover:text-[#E9C46A]'
              }`}
              title={doc.is_starred ? 'Unstar' : 'Star'}
              aria-label={doc.is_starred ? 'Remove star' : 'Add star'}
            >
              <Star className="mx-auto h-4 w-4" fill={doc.is_starred ? 'currentColor' : 'none'} />
            </button>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[#7A7A78]">
          {metadataItems.map((item, index) => (
            <div key={`${item.label}-${index}`} className="flex items-center gap-2">
              {index !== 0 && <span className="h-3 w-px bg-[#4A4A48]/50" />}
              <span className={item.tone === 'danger' ? 'text-[#F28482]' : undefined}>{item.label}</span>
            </div>
          ))}
        </div>

        <div
          className="mt-2 flex items-center justify-between gap-2 text-[12px] text-[#C2C0B6]"
          title={assignedSummary || uploaderName || undefined}
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5A4AE3] to-[#C784FF] text-[10px] font-semibold text-white">
              {ownerInitial}
            </div>
            <span className="truncate">{ownerDisplayName}</span>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.08em] text-white ${
              categoryBadge?.className ?? ''
            }`}
            style={categoryBadge?.style}
          >
            {(categoryBadge?.name || doc.category || '').toUpperCase() || 'UNCATEGORIZED'}
          </span>
        </div>
      </div>
    </div>
  );
}
