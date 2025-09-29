export function normalizeRichText(raw?: string): string {
  if (!raw) return '';
  let txt = raw;
  txt = txt.replace(/<br\s*\/?>/gi, '\n');
  txt = txt.replace(/<\/?p[^>]*>/gi, '\n');
  txt = txt.replace(/&nbsp;/gi, ' ');
  txt = txt.replace(/<[^>]+>/g, '');
  txt = txt
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  txt = txt.replace(/\n{3,}/g, '\n\n');
  return txt.trim();
}

