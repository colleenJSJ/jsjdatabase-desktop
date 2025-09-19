export type PendingDoc = { file: File; title: string; category: string };
import { addCSRFToHeaders } from '@/lib/security/csrf-client';

export async function uploadPendingDocs(params: {
  pendingFiles: PendingDoc[];
  sourcePage: 'travel' | 'calendar' | 'tasks' | string;
  sourceId?: string | null;
  relatedPeople?: string[];
  descriptionLines?: string[];
}) {
  const { pendingFiles, sourcePage, sourceId, relatedPeople, descriptionLines } = params;
  for (const item of pendingFiles || []) {
    if (!item || !item.title?.trim() || !item.category) continue;
    const fd = new FormData();
    fd.append('file', item.file);
    fd.append('title', item.title.trim());
    fd.append('category', item.category);
    fd.append('source_page', sourcePage);
    if (sourceId) fd.append('source_id', sourceId);
    if (relatedPeople && relatedPeople.length > 0) fd.append('relatedPeople', JSON.stringify(relatedPeople));
    const desc = (descriptionLines || []).filter(Boolean).join('\n');
    if (desc) fd.append('description', desc);
    try {
      await fetch('/api/documents/upload', { method: 'POST', body: fd, headers: addCSRFToHeaders() });
    } catch (e) {
      // swallow upload errors to avoid blocking primary save
      // eslint-disable-next-line no-console
      console.warn('[DocUpload] Upload failed:', e);
    }
  }
}
