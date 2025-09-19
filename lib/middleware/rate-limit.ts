/**
 * Rate limiting middleware for API protection
 * Uses Upstash Redis for production, in-memory for development
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rate limit configurations for different endpoint types
export const RATE_LIMITS = {
  // Authentication endpoints - stricter limits
  auth: {
    requests: 5,
    window: '1 m', // 5 requests per minute
  },
  // Write operations - moderate limits
  write: {
    requests: 30,
    window: '1 m', // 30 requests per minute
  },
  // Read operations - more generous limits
  read: {
    requests: 100,
    window: '1 m', // 100 requests per minute
  },
  // Sensitive operations - very strict
  sensitive: {
    requests: 3,
    window: '5 m', // 3 requests per 5 minutes
  },
} as const;

// Initialize rate limiter based on environment
let ratelimit: Ratelimit | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  // Production: Use Upstash Redis
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '10 s'), // Default: 10 requests per 10 seconds
    analytics: true,
    prefix: '@upstash/ratelimit',
  });
}

// In-memory rate limiter for development
class InMemoryRateLimiter {
  private requests: Map<string, { count: number; resetTime: number }> = new Map();

  async limit(identifier: string, limit: number, windowMs: number) {
    const now = Date.now();
    const record = this.requests.get(identifier);

    if (!record || now > record.resetTime) {
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
      });
      return { success: true, limit, remaining: limit - 1, reset: new Date(now + windowMs) };
    }

    if (record.count >= limit) {
      return { success: false, limit, remaining: 0, reset: new Date(record.resetTime) };
    }

    record.count++;
    return { success: true, limit, remaining: limit - record.count, reset: new Date(record.resetTime) };
  }

  // Clean up old entries periodically
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.requests.entries()) {
      if (now > value.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  // Clear all rate limit records (useful for debugging)
  clear() {
    this.requests.clear();
    console.log('[RateLimit] Cleared all rate limit records');
  }
}

const inMemoryLimiter = new InMemoryRateLimiter();

// Clear rate limits on startup for development
if (process.env.NODE_ENV === 'development') {
  inMemoryLimiter.clear();
}

// Cleanup in-memory storage every minute
if (typeof window === 'undefined') {
  setInterval(() => inMemoryLimiter.cleanup(), 60000);
}

/**
 * Apply rate limiting to an API endpoint
 * @param request - The incoming request
 * @param config - Rate limit configuration (requests per window)
 * @returns null if allowed, error response if rate limited
 */
type NextRequestWithIp = NextRequest & { ip?: string | null };

export async function rateLimit(
  request: NextRequest,
  config: { requests: number; window: string } = RATE_LIMITS.read
): Promise<NextResponse | null> {
  try {
    // Developer convenience: relax auth rate limits on localhost in development
    const isDev = process.env.NODE_ENV === 'development';
    const path = request.nextUrl.pathname || '';
    const host = request.nextUrl.hostname || '';
    if (isDev && host.includes('localhost')) {
      // Skip rate limiting entirely in local dev environment
      return null;
    }
    // Get identifier (user ID from auth or IP address)
    const authHeader = request.headers.get('authorization');
    const forwardedFor = request.headers.get('x-forwarded-for');
    const headerIp = forwardedFor?.split(',')[0]?.trim();
    const requestIp = (request as NextRequestWithIp).ip || undefined;
    let identifier = requestIp ?? headerIp ?? 'anonymous';

    // Try to extract user ID from auth header if available
    if (authHeader) {
      // Simple extraction - customize based on your auth implementation
      const userId = authHeader.replace('Bearer ', '').slice(0, 36); // Assume UUID
      if (userId.length === 36) {
        identifier = `user:${userId}`;
      }
    }

    // Apply rate limiting
    let result;
    
    if (ratelimit) {
      // Production: Use Upstash
      result = await ratelimit.limit(identifier);
    } else {
      // Development: Use in-memory limiter
      const windowMs = parseWindow(config.window);
      result = await inMemoryLimiter.limit(identifier, config.requests, windowMs);
    }

    // Set rate limit headers
    const headers = new Headers();
    headers.set('X-RateLimit-Limit', config.requests.toString());
    headers.set('X-RateLimit-Remaining', result.remaining.toString());
    const resetValue = typeof result.reset === 'number'
      ? new Date(result.reset)
      : result.reset instanceof Date
        ? result.reset
        : undefined;
    const resetDate = resetValue ?? new Date();
    headers.set('X-RateLimit-Reset', resetDate.toISOString());

    if (!result.success) {
      // Rate limit exceeded
      const retryAfterSeconds = Math.max(0, Math.floor((resetDate.getTime() - Date.now()) / 1000));
      headers.set('Retry-After', retryAfterSeconds.toString());
      
      return NextResponse.json(
        { 
          error: 'Too many requests', 
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: resetDate.toISOString(),
        },
        { status: 429, headers }
      );
    }

    // Rate limit check passed - continue with request
    return null;
  } catch (error) {
    // Log error but don't block request if rate limiting fails
    console.error('[RateLimit] Error:', error);
    return null;
  }
}

/**
 * Helper function to determine rate limit config based on endpoint
 */
export function getRateLimitConfig(pathname: string, method: string): { requests: number; window: string } {
  // Exclude certain endpoints from strict rate limiting
  if (pathname === '/api/auth/me' || pathname === '/api/auth/users' || pathname === '/api/categories') {
    // These are called frequently and are safe read operations
    return RATE_LIMITS.read;
  }

  // Authentication endpoints (login/logout)
  if (pathname.includes('/auth/login') || pathname.includes('/auth/logout')) {
    return RATE_LIMITS.auth;
  }

  // Password endpoints - less strict for GET
  if (pathname.includes('/passwords')) {
    if (method === 'GET') {
      return RATE_LIMITS.read;  // Reading passwords is safe
    }
    return RATE_LIMITS.sensitive;  // Writing passwords is sensitive
  }

  // Write operations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return RATE_LIMITS.write;
  }

  // Default to read limits
  return RATE_LIMITS.read;
}

/**
 * Parse window string to milliseconds
 */
function parseWindow(window: string): number {
  const match = window.match(/^(\d+)\s*([smh])$/);
  if (!match) return 60000; // Default to 1 minute

  const [, num, unit] = match;
  const value = parseInt(num, 10);

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    default: return 60000;
  }
}

/**
 * Middleware function for Next.js middleware.ts
 */
export async function withRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const config = getRateLimitConfig(request.nextUrl.pathname, request.method);
  return rateLimit(request, config);
}
