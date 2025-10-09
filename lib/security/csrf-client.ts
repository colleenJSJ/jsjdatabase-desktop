/**
 * Client-side CSRF helpers (safe to import in Client Components)
 */

// Header name used by middleware
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_COOKIE = 'csrf-token';
const CSRF_ENDPOINT = '/api/security/csrf';

function getCSRFFromMeta(): string | null {
  if (typeof window === 'undefined') return null;
  return (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null)?.content || null;
}

function getCSRFFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`${CSRF_TOKEN_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCSRFFromDom(token: string | null): void {
  if (typeof document === 'undefined' || !token) return;
  let metaTag = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null;
  if (!metaTag) {
    metaTag = document.createElement('meta');
    metaTag.setAttribute('name', 'csrf-token');
    document.head.appendChild(metaTag);
  }
  metaTag.setAttribute('content', token);
}

function resolveTokenFromDom(): { metaToken: string | null; cookieToken: string | null } {
  const metaToken = getCSRFFromMeta();
  const cookieToken = getCSRFFromCookie();
  return { metaToken, cookieToken };
}

function shouldAttachToken(input: RequestInfo | URL): boolean {
  if (typeof window === 'undefined') return false;

  try {
    if (input instanceof Request) {
      const requestUrl = new URL(input.url);
      return requestUrl.origin === window.location.origin;
    }

    if (input instanceof URL) {
      return input.origin === window.location.origin;
    }

    const resolvedUrl = new URL(String(input), window.location.origin);
    return resolvedUrl.origin === window.location.origin;
  } catch {
    return false;
  }
}

function mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();

  for (const source of sources) {
    if (!source) continue;
    const iterable = source instanceof Headers ? source : new Headers(source);
    iterable.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

export function getCSRFToken(): string | null {
  const { metaToken, cookieToken } = resolveTokenFromDom();

  if (cookieToken) {
    if (cookieToken !== metaToken) {
      setCSRFFromDom(cookieToken);
    }
    return cookieToken;
  }

  if (metaToken) {
    return metaToken;
  }

  return null;
}

export function addCSRFToHeaders(headers: HeadersInit = {}): HeadersInit {
  const token = getCSRFToken();
  if (!token) return headers;

  const combined = mergeHeaders(headers);
  if (!combined.has(CSRF_HEADER_NAME)) {
    combined.set(CSRF_HEADER_NAME, token);
  }

  return combined;
}

export function getCSRFHeaders(): Record<string, string> {
  const token = getCSRFToken();
  return token ? { [CSRF_HEADER_NAME]: token } : {};
}

let fetchPatched = false;
let inflightTokenRequest: Promise<string | null> | null = null;

async function requestTokenFromServer(fetchImpl?: typeof fetch): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const fetchFn = fetchImpl ?? window.fetch;
    const response = await fetchFn(CSRF_ENDPOINT, {
      method: 'GET',
      credentials: 'same-origin',
    });
    if (!response.ok) {
      console.warn('[CSRF] Failed to fetch token:', response.status);
      return null;
    }
    const data = await response.json();
    const token = data?.token ?? null;
    if (token) {
      setCSRFFromDom(token);
    }
    return token;
  } catch (error) {
    console.warn('[CSRF] Token fetch error', error);
    return null;
  }
}

export async function ensureCSRFToken(fetchImpl?: typeof fetch): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const { metaToken, cookieToken } = resolveTokenFromDom();

  if (cookieToken) {
    if (cookieToken !== metaToken) {
      setCSRFFromDom(cookieToken);
    }
    return cookieToken;
  }

  if (metaToken) {
    console.warn('[CSRF] Meta token present without cookie; requesting fresh token');
  }

  if (!inflightTokenRequest) {
    inflightTokenRequest = requestTokenFromServer(fetchImpl).finally(() => {
      inflightTokenRequest = null;
    });
  }

  return inflightTokenRequest;
}

function isMutatingMethod(method?: string): boolean {
  if (!method) return false;
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

export function ensureCSRFFetch(): void {
  if (fetchPatched || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method
      || (input instanceof Request ? input.method : undefined);

    if (!isMutatingMethod(method) || !shouldAttachToken(input)) {
      return originalFetch(input as RequestInfo, init);
    }

    let token = getCSRFToken();
    if (!token) {
      token = await ensureCSRFToken(originalFetch);
      if (!token) {
        return originalFetch(input as RequestInfo, init);
      }
    }

    if (input instanceof Request) {
      const combinedHeaders = mergeHeaders(input.headers, init?.headers);

      if (!combinedHeaders.has(CSRF_HEADER_NAME)) {
        combinedHeaders.set(CSRF_HEADER_NAME, token);
      }

      const requestInit: RequestInit = {
        ...init,
        headers: combinedHeaders,
      };

      const clonedRequest = new Request(input, requestInit);
      return originalFetch(clonedRequest);
    }

    const combinedHeaders = mergeHeaders(init?.headers);
    if (!combinedHeaders.has(CSRF_HEADER_NAME)) {
      combinedHeaders.set(CSRF_HEADER_NAME, token);
    }

    const finalInit: RequestInit = {
      ...init,
      headers: combinedHeaders,
    };

    return originalFetch(input as RequestInfo, finalInit);
  }) as typeof window.fetch;

  fetchPatched = true;
}
