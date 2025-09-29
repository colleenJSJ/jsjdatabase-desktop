/**
 * Authentication and Authorization Helper Functions
 * Provides consistent security checks across all API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { User } from '@supabase/supabase-js';
import { resolveCSRFTokenFromRequest } from '@/lib/security/csrf';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'user' | 'guest';
  metadata?: any;
}

export interface AuthResult {
  authenticated: boolean;
  user?: AuthUser;
  error?: string;
  response?: NextResponse;
}

/**
 * Require authentication for a request
 * Returns user data or an error response
 */
export async function requireAuth(request: NextRequest): Promise<{ user: AuthUser } | { error: NextResponse }> {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return {
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      };
    }

    // Get full user data from the users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return {
        error: NextResponse.json({ error: 'User not found' }, { status: 404 })
      };
    }

    return {
      user: {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name || userData.name,
        role: userData.role || 'user',
        metadata: userData.metadata
      }
    };
  } catch (error) {
    console.error('[Auth Helper] Error:', error);
    return {
      error: NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    };
  }
}

/**
 * Require admin role for a request
 */
export async function requireAdmin(request: NextRequest): Promise<{ user: AuthUser } | { error: NextResponse }> {
  const authResult = await requireAuth(request);
  
  if ('error' in authResult) {
    return authResult;
  }
  
  if (authResult.user.role !== 'admin') {
    return {
      error: NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    };
  }
  
  return authResult;
}

/**
 * Check if user owns or has access to a resource
 */
export function checkResourceAccess(
  userId: string,
  resource: {
    created_by?: string;
    uploaded_by?: string;
    assigned_to?: string[];
    attendees?: string[];
  },
  isAdmin: boolean = false
): boolean {
  // Admins have access to everything
  if (isAdmin) return true;
  
  // Check various ownership fields
  if (resource.created_by === userId) return true;
  if (resource.uploaded_by === userId) return true;
  if (resource.assigned_to?.includes(userId)) return true;
  if (resource.assigned_to?.includes('shared')) return true;
  if (resource.attendees?.includes(userId)) return true;
  
  return false;
}

/**
 * Get user's household members for scoping queries
 */
export async function getUserHousehold(userId: string): Promise<string[]> {
  try {
    const supabase = await createClient();
    
    // Get user's household_id
    const { data: userData } = await supabase
      .from('users')
      .select('household_id')
      .eq('id', userId)
      .single();
    
    if (!userData?.household_id) {
      return [userId]; // User only
    }
    
    // Get all members of the household
    const { data: householdMembers } = await supabase
      .from('users')
      .select('id')
      .eq('household_id', userData.household_id);
    
    return householdMembers?.map(m => m.id) || [userId];
  } catch (error) {
    console.error('[Auth Helper] Error getting household:', error);
    return [userId];
  }
}

/**
 * Validate CSRF token for mutations
 * Note: This is a placeholder - integrate with your CSRF implementation
 */
export async function requireCSRF(request: NextRequest): Promise<boolean> {
  // Skip for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return true;
  }
  
  // Check for CSRF token in header
  const csrfToken = request.headers.get('x-csrf-token');
  if (!csrfToken) {
    console.warn('[Auth Helper] Missing CSRF token');
    return false;
  }
  
  // Validate token (implement your validation logic)
  // This would integrate with your CSRF store
  return true;
}

/**
 * Combined auth check with CSRF for mutations
 */
export async function requireAuthWithCSRF(
  request: NextRequest
): Promise<{ user: AuthUser } | { error: NextResponse }> {
  // Check CSRF for mutations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const csrfValid = await requireCSRF(request);
    if (!csrfValid) {
      return {
        error: NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 })
      };
    }
  }
  
  return requireAuth(request);
}

/**
 * Standard error response helper
 */
export function errorResponse(message: string, status: number = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Standard success response helper
 */
export function successResponse(data: any, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Build headers for internal API calls, forwarding auth/cookies and CSRF token when present.
 */
export async function buildInternalApiHeaders(
  request: NextRequest,
  initial: Record<string, string> = {}
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...initial };

  const authHeader = request.headers.get('Authorization');
  if (authHeader && !headers.Authorization) {
    headers.Authorization = authHeader;
  }

  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader && !headers.Cookie) {
    headers.Cookie = cookieHeader;
  }

  const csrfToken = await resolveCSRFTokenFromRequest(request);
  if (csrfToken && !headers['x-csrf-token']) {
    headers['x-csrf-token'] = csrfToken;
  }

  return headers;
}
