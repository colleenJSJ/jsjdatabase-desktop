import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createCSRFToken, csrfStore } from '@/lib/security/csrf';

const CSRF_SESSION_COOKIE = 'csrf-session';
const CSRF_TOKEN_COOKIE = 'csrf-token';
const TWENTY_FOUR_HOURS = 24 * 60 * 60; // seconds

function createCookieOptions(isHttpOnly: boolean) {
  return {
    httpOnly: isHttpOnly,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TWENTY_FOUR_HOURS,
  };
}

export async function GET(request: NextRequest) {
  let sessionId = request.cookies.get(CSRF_SESSION_COOKIE)?.value;
  const hadSessionCookie = !!sessionId;

  if (!sessionId) {
    sessionId = randomBytes(32).toString('hex');
  }

  let token: string | undefined;
  let storeHit = false;
  try {
    const existing = await csrfStore.get(sessionId);
    token = existing?.token;
    storeHit = !!existing;
  } catch (error) {
    console.warn('[CSRF Route] Failed to read token from store', error);
  }

  if (!token) {
    token = await createCSRFToken(sessionId);
    console.log('[CSRF Route] Issued new token', {
      sessionId,
      hadSessionCookie,
    });
  } else {
    console.log('[CSRF Route] Reused existing token', {
      sessionId,
      hadSessionCookie,
      storeHit,
    });
  }

  const response = NextResponse.json({ token });

  response.cookies.set(
    CSRF_SESSION_COOKIE,
    sessionId,
    createCookieOptions(true)
  );

  response.cookies.set(
    CSRF_TOKEN_COOKIE,
    token,
    createCookieOptions(false)
  );

  return response;
}
