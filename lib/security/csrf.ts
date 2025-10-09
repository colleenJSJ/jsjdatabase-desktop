/**
 * CSRF Protection utilities
 * Implements double-submit cookie pattern for CSRF protection
 */

import 'server-only';
import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { csrfStore } from './csrf-store';
export { csrfStore };

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_FIELD_NAME = '_csrf';
const CSRF_SESSION_COOKIE = 'csrf-session';

// Token expiry (24 hours)
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000;

// Fallback in-memory store for development/testing
const tokenStore = new Map<string, { token: string; expires: number }>();
const HAS_SERVICE_ROLE_KEY = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const USE_SUPABASE_STORE = process.env.NODE_ENV === 'production' && HAS_SERVICE_ROLE_KEY;

if (process.env.NODE_ENV === 'production' && !HAS_SERVICE_ROLE_KEY) {
  console.warn('[CSRF] SUPABASE_SERVICE_ROLE_KEY missing in production; falling back to in-memory token store');
}

function maskToken(token?: string | null): string {
  if (!token) return 'null';
  if (token.length <= 8) return token;
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

/**
 * Generate a CSRF token
 */
export function generateCSRFToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Create and store a CSRF token for a session
 */
export async function createCSRFToken(sessionId: string): Promise<string> {
  const token = generateCSRFToken();
  const expires = Date.now() + TOKEN_EXPIRY;
  
  // Store token using appropriate store
  if (USE_SUPABASE_STORE) {
    await csrfStore.set(sessionId, { token, expires });
    // Cleanup in background (don't await)
    csrfStore.cleanup().catch(console.error);
    console.log('[CSRF] Token stored in Supabase', {
      sessionId,
      expires,
    });
  } else {
    tokenStore.set(sessionId, { token, expires });
    cleanupExpiredTokens();
    console.log('[CSRF] Token stored in memory', {
      sessionId,
      expires,
    });
  }
  
  return token;
}

/**
 * Get CSRF token from request
 */
export async function getCSRFTokenFromRequest(request: NextRequest): Promise<string | null> {
  // Check header first (preferred for AJAX requests)
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (headerToken) return headerToken;
  
  // Check body for form submissions
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    // For form data
    const contentType = request.headers.get('content-type');
    if (contentType?.includes('application/x-www-form-urlencoded')) {
      // Parse form data if needed
      // This is handled differently in Next.js App Router
    }
  }
  
  // Check cookie as fallback
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  
  return cookieToken || null;
}

/**
 * Validate CSRF token
 */
export async function validateCSRFToken(
  request: NextRequest,
  sessionId: string
): Promise<boolean> {
  // Skip validation for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return true;
  }
  
  const providedToken = await getCSRFTokenFromRequest(request);
  if (!providedToken) {
    console.warn('[CSRF] No token provided in request');
    return false;
  }
  
  // Get stored token from appropriate store
  let storedData;
  if (USE_SUPABASE_STORE) {
    storedData = await csrfStore.get(sessionId);
  } else {
    storedData = tokenStore.get(sessionId);
    // Check expiry for in-memory store
    if (storedData && Date.now() > storedData.expires) {
      console.warn('[CSRF] Token expired');
      tokenStore.delete(sessionId);
      return false;
    }
  }
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  console.log('[CSRF] Validating token', {
    sessionId,
    provided: maskToken(providedToken),
    cookie: maskToken(cookieToken),
    storeHit: !!storedData,
    storeType: USE_SUPABASE_STORE ? 'supabase' : 'memory',
  });

  if (!storedData) {
    if (cookieToken && cookieToken === providedToken) {
      console.warn('[CSRF] Falling back to cookie token validation');
      return true;
    }

    console.warn('[CSRF] No token found for session');
    return false;
  }

  // Validate token
  const isValid = providedToken === storedData.token;
  if (!isValid) {
    console.warn('[CSRF] Token mismatch');
  }
  
  return isValid;
}

/**
 * Clean up expired tokens
 */
function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [sessionId, data] of tokenStore.entries()) {
    if (now > data.expires) {
      tokenStore.delete(sessionId);
    }
  }
}

/**
 * Middleware to validate CSRF token
 */
export interface CSRFMiddlewareOptions {
  sessionId?: string;
  skip?: boolean;
}

function isTrustedServiceRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (authHeader && serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) {
    return true;
  }

  return false;
}

export async function csrfMiddleware(
  request: NextRequest,
  options: CSRFMiddlewareOptions = {}
): Promise<{ valid: boolean; error?: string }> {
  if (options.skip) {
    return { valid: true };
  }
  // Skip validation for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return { valid: true };
  }

  if (isTrustedServiceRequest(request)) {
    return { valid: true };
  }
  
  // Get session ID (from auth or cookies)
  const sid = options.sessionId || request.cookies.get(CSRF_SESSION_COOKIE)?.value;
  if (!sid) {
    return { valid: false, error: 'No session found' };
  }
  
  // Validate token
  const isValid = await validateCSRFToken(request, sid);
  
  if (!isValid) {
    return { 
      valid: false, 
      error: 'Invalid or missing CSRF token' 
    };
  }
  
  return { valid: true };
}

export async function enforceCSRF(
  request: NextRequest,
  options: CSRFMiddlewareOptions = {}
): Promise<NextResponse | null> {
  const result = await csrfMiddleware(request, options);
  if (result.valid) {
    return null;
  }

  console.warn('[CSRF] Request blocked', {
    path: request.nextUrl.pathname,
    method: request.method,
    error: result.error,
  });

  return NextResponse.json({ error: result.error || 'Invalid CSRF token' }, { status: 403 });
}

/**
 * Resolve a CSRF token from the incoming request. This looks for
 * the header first, then the csrf-token cookie, and finally falls
 * back to the persisted token store using the csrf-session cookie key.
 */
export async function resolveCSRFTokenFromRequest(request: NextRequest): Promise<string | null> {
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (headerToken) {
    return headerToken;
  }

  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (cookieToken) {
    return cookieToken;
  }

  const sessionId = request.cookies.get(CSRF_SESSION_COOKIE)?.value;
  if (!sessionId) {
    return null;
  }

  try {
    const stored = await csrfStore.get(sessionId);
    return stored?.token ?? null;
  } catch (error) {
    console.warn('[CSRF] Failed to resolve token from store:', error);
    return null;
  }
}

/**
 * React Hook for CSRF token management
 */
export function useCSRFToken(): {
  token: string | null;
  setToken: (token: string) => void;
  getHeaders: () => Record<string, string>;
} {
  if (typeof window === 'undefined') {
    return {
      token: null,
      setToken: () => {},
      getHeaders: () => ({}),
    };
  }
  
  // Get token from cookie or meta tag
  const getToken = (): string | null => {
    // Check meta tag first
    const metaTag = document.querySelector('meta[name="csrf-token"]');
    if (metaTag) {
      return metaTag.getAttribute('content');
    }
    
    // Check cookie
    const match = document.cookie.match(new RegExp(`${CSRF_COOKIE_NAME}=([^;]+)`));
    return match ? match[1] : null;
  };
  
  const token = getToken();
  
  const setToken = (newToken: string) => {
    // Update meta tag
    let metaTag = document.querySelector('meta[name="csrf-token"]');
    if (!metaTag) {
      metaTag = document.createElement('meta');
      metaTag.setAttribute('name', 'csrf-token');
      document.head.appendChild(metaTag);
    }
    metaTag.setAttribute('content', newToken);
  };
  
  const getHeaders = (): Record<string, string> => {
    const currentToken = getToken();
    return currentToken ? { [CSRF_HEADER_NAME]: currentToken } : {};
  };
  
  return { token, setToken, getHeaders };
}

/**
 * Client-side CSRF token injection for forms
 */
export function injectCSRFToken(formData: FormData): FormData {
  if (typeof window === 'undefined') return formData;
  
  const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  if (token) {
    formData.append(CSRF_FIELD_NAME, token);
  }
  
  return formData;
}

/**
 * Add CSRF token to fetch headers
 */
export function addCSRFToHeaders(headers: HeadersInit = {}): HeadersInit {
  if (typeof window === 'undefined') return headers;
  
  const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  if (!token) return headers;
  
  if (headers instanceof Headers) {
    headers.set(CSRF_HEADER_NAME, token);
    return headers;
  }
  
  if (Array.isArray(headers)) {
    return [...headers, [CSRF_HEADER_NAME, token]];
  }
  
  return {
    ...headers,
    [CSRF_HEADER_NAME]: token,
  };
}
