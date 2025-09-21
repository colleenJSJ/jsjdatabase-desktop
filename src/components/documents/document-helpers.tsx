import { ReactNode, CSSProperties } from 'react';
import {
  Paperclip,
  FileText,
  FileEdit,
  Sheet,
  Image,
} from 'lucide-react';
import { Document } from '@/types';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic', '.heif'];
const PDF_EXTENSIONS = ['.pdf'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv'];

export interface DocumentCategoryOption {
  id: string;
  name: string;
  color: string;
}

export interface DocumentCategoryBadge {
  id: string;
  name: string;
  className?: string;
  style?: CSSProperties;
}

export const DOCUMENT_CATEGORY_OPTIONS: DocumentCategoryOption[] = [
  { id: 'all', name: 'All Categories', color: 'bg-gray-500' },
  { id: 'legal', name: 'Legal', color: 'bg-purple-500' },
  { id: 'financial', name: 'Financial', color: 'bg-green-500' },
  { id: 'medical', name: 'Medical', color: 'bg-red-500' },
  { id: 'education', name: 'Education', color: 'bg-blue-500' },
  { id: 'travel', name: 'Travel', color: 'bg-yellow-500' },
  { id: 'property', name: 'Property', color: 'bg-indigo-500' },
  { id: 'vehicles', name: 'Vehicles', color: 'bg-orange-500' },
  { id: 'personal', name: 'Personal', color: 'bg-pink-500' },
  { id: 'work', name: 'Work', color: 'bg-cyan-500' },
  { id: 'household', name: 'Household', color: 'bg-teal-500' },
  { id: 'other', name: 'Other', color: 'bg-gray-400' },
];

const CATEGORY_BADGE_MAP = DOCUMENT_CATEGORY_OPTIONS.reduce<Record<string, DocumentCategoryBadge>>((acc, option) => {
  if (option.id === 'all') return acc;
  const badge: DocumentCategoryBadge = {
    id: option.id,
    name: option.name,
  };

  if (option.color.startsWith('#')) {
    badge.style = { backgroundColor: option.color };
  } else {
    badge.className = option.color;
  }

  acc[option.id] = badge;
  return acc;
}, {});

export function getDocumentCategoryBadge(category?: string | null): DocumentCategoryBadge | undefined {
  if (!category) return undefined;
  const normalized = category.toString().toLowerCase();
  return CATEGORY_BADGE_MAP[normalized] ?? undefined;
}

function hasExtension(value: string | null | undefined, extensions: string[]): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return extensions.some(ext => lower.endsWith(ext));
}

export function getFileIcon(fileType?: string | null, fileNameOrUrl?: string | null): ReactNode {
  const type = fileType?.toLowerCase();
  if (type) {
    if (type.includes('pdf')) return <FileText className="h-5 w-5" />;
    if (type.includes('doc')) return <FileEdit className="h-5 w-5" />;
    if (type.includes('xls')) return <Sheet className="h-5 w-5" />;
    if (type.startsWith('image/')) return <Image className="h-5 w-5" />;
  }

  if (hasExtension(fileNameOrUrl, IMAGE_EXTENSIONS)) return <Image className="h-5 w-5" />;
  if (hasExtension(fileNameOrUrl, PDF_EXTENSIONS)) return <FileText className="h-5 w-5" />;
  if (fileNameOrUrl && fileNameOrUrl.toLowerCase().includes('.doc')) return <FileEdit className="h-5 w-5" />;
  if (fileNameOrUrl && fileNameOrUrl.toLowerCase().includes('.xls')) return <Sheet className="h-5 w-5" />;

  return <Paperclip className="h-5 w-5" />;
}

export function cleanDocumentTitle(title?: string | null, fallback?: string): string {
  const baseTitle = title || fallback || 'Untitled Document';
  const extensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.gif', '.txt', '.zip', '.rar'];

  let cleanTitle = baseTitle;
  for (const ext of extensions) {
    if (cleanTitle.toLowerCase().endsWith(ext)) {
      cleanTitle = cleanTitle.slice(0, -ext.length);
      break;
    }
  }

  if (cleanTitle.startsWith('Review Contract - ')) {
    cleanTitle = cleanTitle.replace('Review Contract - ', '');
  }

  return cleanTitle;
}

export function formatSourcePage(page?: Document['source_page'] | null): string {
  if (!page) return 'Manual';
  const normalized = page.toString().toLowerCase();
  const map: Record<string, string> = {
    tasks: 'Tasks',
    travel: 'Travel',
    health: 'Health',
    calendar: 'Calendar',
    'j3-academics': 'J3 Academics',
    pets: 'Pets',
    household: 'Household',
    manual: 'Manual',
  };
  return map[normalized] || normalized.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getDaysUntilExpiration(date?: Date | string | null): number | null {
  if (!date) return null;
  const expirationDate = new Date(date);
  if (Number.isNaN(expirationDate.getTime())) return null;
  const now = new Date();
  const diffTime = expirationDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function getDocumentRelatedNames(
  doc: Pick<Document, 'related_to' | 'assigned_to'>,
  familyMemberMap: Record<string, string>
): string[] {
  const relatedIds = doc.related_to && doc.related_to.length > 0
    ? doc.related_to
    : doc.assigned_to && doc.assigned_to.length > 0
      ? doc.assigned_to
      : [];

  return (relatedIds || [])
    .map((id) => familyMemberMap[id] || id)
    .filter(Boolean);
}

export function buildAssignedSummary(names: string[]): string {
  if (names.length === 0) return '';
  return `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`;
}

export type DocumentPreviewType = 'image' | 'pdf' | 'video' | 'other';

export function inferDocumentPreviewType(
  doc: Pick<Document, 'file_type' | 'file_name' | 'file_url'>
): DocumentPreviewType {
  const type = doc.file_type?.toLowerCase();
  if (type) {
    if (type.startsWith('image/')) return 'image';
    if (type.includes('pdf')) return 'pdf';
    if (type.startsWith('video/')) return 'video';
  }

  const fallback = `${doc.file_name || ''} ${doc.file_url || ''}`.toLowerCase();
  if (hasExtension(fallback, IMAGE_EXTENSIONS)) return 'image';
  if (hasExtension(fallback, PDF_EXTENSIONS)) return 'pdf';
  if (hasExtension(fallback, VIDEO_EXTENSIONS)) return 'video';

  return 'other';
}

export function isImageDocument(doc: Pick<Document, 'file_type' | 'file_name' | 'file_url'>): boolean {
  return inferDocumentPreviewType(doc) === 'image';
}

export function isPdfDocument(doc: Pick<Document, 'file_type' | 'file_name' | 'file_url'>): boolean {
  return inferDocumentPreviewType(doc) === 'pdf';
}
