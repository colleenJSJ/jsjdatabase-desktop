// PHASE 3: AUTH MIDDLEWARE UTILITY
// Replaces duplicated authentication code across API routes

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { User } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'user';
  metadata?: any;
}

export interface AuthResult {
  authenticated: boolean;
  user?: AuthUser;
  error?: string;
  response?: NextResponse;
}

/**
 * Middleware to check authentication and get user data
 * @param request - Next.js request object
 * @param requireAdmin - Whether admin role is required
 * @returns AuthResult with user data or error response
 */
export async function authenticateRequest(
  request: NextRequest,
  requireAdmin: boolean = false
): Promise<AuthResult> {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return {
        authenticated: false,
        error: 'Unauthorized',
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
        authenticated: false,
        error: 'User not found',
        response: NextResponse.json({ error: 'User not found' }, { status: 404 })
      };
    }

    // Check admin requirement
    if (requireAdmin && userData.role !== 'admin') {
      return {
        authenticated: false,
        error: 'Admin access required',
        response: NextResponse.json({ error: 'Admin access required' }, { status: 403 })
      };
    }

    // Return authenticated user
    return {
      authenticated: true,
      user: {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name || userData.name,
        role: userData.role,
        metadata: userData.metadata
      }
    };
  } catch (error) {
    console.error('[Auth Middleware] Error:', error);
    return {
      authenticated: false,
      error: 'Internal server error',
      response: NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    };
  }
}

/**
 * Helper to get authenticated Supabase client
 * @returns Supabase client and user or error
 */
export async function getAuthenticatedSupabase() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    throw new Error('Authentication required');
  }
  
  return { supabase, user };
}