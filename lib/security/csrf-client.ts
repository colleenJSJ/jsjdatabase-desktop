/**
 * Client-side CSRF helpers (safe to import in Client Components)
 */

// Header name used by middleware
const CSRF_HEADER_NAME = 'x-csrf-token';

function getCSRFFromMeta(): string | null {
  if (typeof window === 'undefined') return null;
  return (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null)?.content || null;
}

export function addCSRFToHeaders(headers: HeadersInit = {}): HeadersInit {
  const token = getCSRFFromMeta();
  if (!token) return headers;

  if (headers instanceof Headers) {
    headers.set(CSRF_HEADER_NAME, token);
    return headers;
  }

  if (Array.isArray(headers)) {
    return [...headers, [CSRF_HEADER_NAME, token]] as HeadersInit;
  }

  return { ...(headers as Record<string, string>), [CSRF_HEADER_NAME]: token };
}

export function getCSRFHeaders(): Record<string, string> {
  const token = getCSRFFromMeta();
  return token ? { [CSRF_HEADER_NAME]: token } : {};
}

